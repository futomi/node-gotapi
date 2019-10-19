/* ------------------------------------------------------------------
* node-gotapi - gotapi-interface-4.js
*
* Copyright (c) 2017-2019, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2019-10-19
* ---------------------------------------------------------------- */
'use strict';
const mCrypto = require('crypto');
const mGotapiPluginLoader = require('./gotapi-plugin-loader.js');

/* ------------------------------------------------------------------
* Constructor: GotapiInterface4(config, returnCallback)
* ---------------------------------------------------------------- */
let GotapiInterface4 = function (config, returnCallback) {
	this.config = config;
	this.returnCallback = returnCallback;
	this.plugins = {};
	this.requests = {};
	this.requests_approving = {};
	this.approved_clients = {};
	this.plugin_response_timeout_watch_timer_id = null;

	this.oncommunication = null;
	this.error_code_map = require('./error-code.json');
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
GotapiInterface4.prototype.start = function () {
	var promise = new Promise((resolve, reject) => {
		// Find and load the GotAPI Plug-ins
		let plugin_loader = new mGotapiPluginLoader(this.config);
		plugin_loader.load((plugins) => {
			this.plugins = plugins;
			let list = [];
			for (let path in plugins) {
				let p = plugins[path];
				list.push(p);
				// Set a listener for `message` event fired on the message channel for the Plug-In
				p.channel.on('message', this._receiveMessageFromPlugin.bind(this));
			}

			// Start to watch the timeout of the response from the Plug-In
			this.plugin_response_timeout_watch_timer_id = setInterval(() => {
				this._startWatchPluginResponseTimeout();
			}, 1000);

			resolve(list);
		});
	});
	return promise;
};

GotapiInterface4.prototype._startWatchPluginResponseTimeout = function () {
	let now = Date.now();
	for (let request_code in this.requests) {
		let data = this.requests[request_code];
		let rtime = data['_plugin_req_time'];
		if (now - rtime > this.config.plugin_response_timeout * 1000) {
			// If the HTTP response code is `408 Request Timeout`,
			// Chrome retries the request troublingly.
			// Therefore, `500 Internal Server Error` is adopted
			// in this case.
			data['result'] = 500;
			data['statusCode'] = 500;
			data['errorCode'] = 500;

			data['errorMessage'] = 'TIMEOUT: The Plug-In did not respond the time limit (' + this.config.plugin_response_timeout + ' sec).';
			this._returnResponseToGotapiServer(data);
			delete this.requests[request_code];
		}
	}
};

/* ------------------------------------------------------------------
* Method: postMessage(data)
* This method is called by the GotAPI Server in order to send a
* message to the Plug-In.
* ---------------------------------------------------------------- */
GotapiInterface4.prototype.postMessage = function (data) {
	let request_code = this._createNewRequestCode();
	data['requestCode'] = request_code;
	data['_plugin_req_time'] = Date.now();
	let prof = data['profile'];
	//let attr = data['attribute'];
	if (prof === 'servicediscovery' || prof === 'serviceDiscovery') {
		data['profile'] = 'networkServiceDiscovery';
		data['attribute'] = 'getNetworkServices';
		this.requests[request_code] = data;
		this._requestServiceDiscovery(request_code);
	} else if (prof) {
		let client_id = data['_client']['client_id'];
		let service_id = data['params']['serviceId'];
		if (service_id) {
			if (this.approved_clients[client_id] && this.approved_clients[client_id][service_id]) {
				data['accessToken'] = this.approved_clients[client_id][service_id];
				this.requests[request_code] = data;
				this._requestCommandToPlugin(request_code);
			} else {
				this.requests[request_code] = data;
				this._requestCreateClientToPlugin(request_code);
			}
		} else {
			this._returnErrorToGotapiServer(
				this.error_code_map['INVALID_SERVICE_ID'],
				'No service ID  was specified.',
				data
			);
		}
	} else {
		this._returnErrorToGotapiServer(
			this.error_code_map['INVALID_PROFILE'],
			'No profile was specified.',
			data
		);
	}
};

GotapiInterface4.prototype._createNewRequestCode = function () {
	let id = '';
	id += mCrypto.randomBytes(32).toString('hex') + '_';
	id += Date.now();
	let sha256 = mCrypto.createHash('sha256');
	sha256.update(id);
	id = sha256.digest('hex');
	return id;
};

GotapiInterface4.prototype._requestServiceDiscovery = function (request_code) {
	let data = this.requests[request_code];
	let plugin_id_list = Object.keys(this.plugins);
	data['_plugin_id_list'] = plugin_id_list;
	data['services'] = [];
	this._requestServiceDiscoverySequentially(request_code);
};

GotapiInterface4.prototype._requestServiceDiscoverySequentially = function (request_code) {
	let data = this.requests[request_code];
	let plugin_id = data['_plugin_id_list'].shift();
	if (plugin_id) {
		data['_plugin_req_time'] = Date.now();
		this.plugins[plugin_id]['channel'].postMessage(data);
	} else {
		this._returnResponseToGotapiServer(data);
		delete this.requests[request_code];
	}
};

GotapiInterface4.prototype._requestCreateClientToPlugin = function (request_code) {
	let data = this.requests[request_code];
	let pres = this._findPluginId(data);
	let target_plugin_id = pres['plugin_id'];
	if (!target_plugin_id) {
		this._returnErrorToGotapiServer(
			this.error_code_map[pres['error_name']],
			pres['error_message'],
			data
		);
		delete this.requests[request_code];
		return;
	}
	let new_request_code = this._createNewRequestCode();
	let new_request_data = {
		receiver: data['receiver'],
		requestCode: new_request_code,
		api: data['api'],
		profile: 'authorization',
		attribute: 'createClient',
		package: data['package'],
		_plugin_req_time: Date.now()
	};
	this.requests[new_request_code] = new_request_data;
	this.requests_approving[new_request_code] = data;
	this.plugins[target_plugin_id]['channel'].postMessage(new_request_data);
};

GotapiInterface4.prototype._requestAccessTokenToPlugin = function (request_code) {
	let data = this.requests[request_code];
	let pres = this._findPluginId(this.requests_approving[request_code]);
	let target_plugin_id = pres['plugin_id'];
	if (!target_plugin_id) {
		this._returnErrorToGotapiServer(
			this.error_code_map[pres['error_name']],
			pres['error_message'],
			data
		);
	}
	data['profile'] = 'authorization';
	data['attribute'] = 'requestAccessToken';
	data['_plugin_req_time'] = Date.now();
	this.plugins[target_plugin_id]['channel'].postMessage(data);
};

GotapiInterface4.prototype._requestCommandToPlugin = function (request_code) {
	let data = this.requests[request_code];
	let pres = this._findPluginId(data);
	let target_plugin_id = pres['plugin_id'];
	if (target_plugin_id) {

		this.plugins[target_plugin_id]['channel'].postMessage(data);
	} else {
		this._returnErrorToGotapiServer(
			this.error_code_map[pres['error_name']],
			pres['error_message'],
			data
		);
	}
};

GotapiInterface4.prototype._returnResponseToGotapiServer = function (data) {
	delete data['_plugin_req_time'];
	delete data['requestCode'];
	delete data['accessToken'];
	this.returnCallback(data);
};

GotapiInterface4.prototype._findPluginId = function (data) {
	let profile = data['profile'];
	//let attribute = data['attribute'];
	let service_id = data['params']['serviceId'];
	let found_plugin_list = [];
	for (let id in this.plugins) {
		let plugin = this.plugins[id];
		let service_list = plugin['info']['services'];
		for (let i = 0; i < service_list.length; i++) {
			let service = service_list[i];
			if (service['serviceId'] === service_id) {
				found_plugin_list.push({
					plugin_id: id,
					service: service
				});
			}
		}
	}
	if (found_plugin_list.length === 0) {
		return {
			error_name: 'UNKNOWN_SERVICE',
			error_message: 'No service was found.'
		};
	}

	let plugin_id = '';
	for (let i = 0; i < found_plugin_list.length; i++) {
		let p = found_plugin_list[i];
		if (profile === 'serviceinformation' || profile === 'serviceInformation') {
			if (p['service']['scopes'].indexOf('serviceinformation') >= 0 || p['service']['scopes'].indexOf('serviceInformation') >= 0) {
				plugin_id = p['plugin_id'];
				break;
			}
		} else if (p['service']['scopes'].indexOf(profile) >= 0) {
			plugin_id = p['plugin_id'];
			break;
		}
	}

	if (plugin_id) {
		return {
			plugin_id: plugin_id
		};
	} else {
		return {
			error_name: 'OUT_OF_SCOPE',
			error_message: 'There is no Plug-In that the specified profile is in the scope.'
		};
	}
};

GotapiInterface4.prototype._receiveMessageFromPlugin = function (res) {
	if (res['action'] === 'EVENT') {
		this._receiveEventMessageFromPlugin(res);
	} else {
		this._receiveResponseMessageFromPlugin(res);
	}
}

GotapiInterface4.prototype._receiveEventMessageFromPlugin = function (res) {
	this._returnResponseToGotapiServer(res);
};

GotapiInterface4.prototype._receiveResponseMessageFromPlugin = function (res) {
	let request_code = res['requestCode'];
	let req = this.requests[request_code];
	if (!req) {
		return;
	}
	// Service Discovery
	if (req['profile'] === 'networkServiceDiscovery') {
		if (res['result'] === 0 && res['services'] && Array.isArray(res['services']) && res['services'].length > 0) {
			res['services'].forEach((s) => {
				req['services'].push(s);
			});
		}
		this._requestServiceDiscoverySequentially(request_code);
		// Plug-In authorization
	} else if (req['profile'] === 'authorization') {
		let orig_request_code = this.requests_approving[request_code]['requestCode'];
		let orig_request_data = this.requests[orig_request_code];
		if (orig_request_data) {
			// Created a client ID
			if (req['attribute'] === 'createClient') {
				if (res['result'] === 0 && res['clientId']) {
					req['clientId'] = res['clientId'];
					orig_request_data['clientId'] = res['clientId'];
					this._requestAccessTokenToPlugin(request_code);
				} else {
					let err_message = 'The Plug-In denied the request for a client ID.';
					if (res['errorMessage']) {
						err_message = res['errorMessage'];
					}
					this._returnErrorToGotapiServer(
						this.error_code_map['INVALID_CLIENT_ID'],
						err_message,
						orig_request_data
					);
					delete this.requests[orig_request_code];
					delete this.requests[request_code];
					delete this.requests_approving[request_code];
				}
				// Created an access token
			} else if (req['attribute'] === 'requestAccessToken') {
				if (res['result'] === 0) {
					let client_id = orig_request_data['_client']['client_id'];
					if (!this.approved_clients[client_id]) {
						this.approved_clients[client_id] = {};
					}
					let service_id = orig_request_data['params']['serviceId'];
					this.approved_clients[client_id][service_id] = res['accessToken'];
					orig_request_data['accessToken'] = res['accessToken'];
					req['accessToken'] = res['accessToken'];
					delete this.requests[request_code];
					delete this.requests_approving[request_code];
					this._requestCommandToPlugin(orig_request_code);
				} else {
					let err_message = 'The Plug-In denied the request for an access token.';
					if (res['errorMessage']) {
						err_message = res['errorMessage'];
					}
					this._returnErrorToGotapiServer(
						this.error_code_map['INVALID_TOKEN'],
						err_message,
						orig_request_data
					);
					delete this.requests[orig_request_code];
					delete this.requests[request_code];
					delete this.requests_approving[request_code];
				}
			} else {
				this._returnErrorToGotapiServer(
					this.error_code_map['INVALID_ATTRIBUTE'],
					'The specified attribute is not supported.',
					orig_request_data
				);
				delete this.requests[orig_request_code];
				delete this.requests[request_code];
				delete this.requests_approving[request_code];
			}
		} else {
			delete this.requests[request_code];
			delete this.requests_approving[request_code];
			this._returnErrorToGotapiServer(
				this.error_code_map['ERROR'],
				'Unknown request.',
				res
			);
		}
	} else {
		for (let k in req) {
			res[k] = req[k];
		}
		this._returnResponseToGotapiServer(res);
		delete this.requests[request_code];
	}
};

GotapiInterface4.prototype._returnErrorToGotapiServer = function (error_code_obj, message, data) {
	data['result'] = error_code_obj['result'];
	data['errorCode'] = error_code_obj['errorCode'];
	data['errorMessage'] = '[' + error_code_obj['errorName'] + '] ' + message;
	data['statusCode'] = error_code_obj['statusCode'];
	this._returnResponseToGotapiServer(data);
};

module.exports = GotapiInterface4;