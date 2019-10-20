/* ------------------------------------------------------------------
* node-gotapi - gotapi-plugin-util.js
*
* This module is used by Plug-Ins for communication with the GotAPI
* Server on the GotAPI-4 Interface.
*
* Copyright (c) 2017-2019, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2019-10-20
* ---------------------------------------------------------------- */
'use strict';
let mCrypto = require('crypto');
let mConsole = require('./console-util.js');

/* ------------------------------------------------------------------
* Constructor: GotapiPluginUtil(port)
* ---------------------------------------------------------------- */
let GotapiPluginUtil = function (port) {
	// The MessagePort object which communicates with the GotAPI
	// Server through the GotAPI-4 Interface
	this.port = port;
	// Client ID
	this.client_id_map = {};
	// Information of the Plug-In
	this.info = null;
	// Callback function which is called when a message comes from the GotAPI Server
	this.onservicediscoverry = null;
	this.onclinetid = null;
	this.onaccesstoken = null;
	this.onmessage = null;
	//
	this.requests = {};
	this.error_code_map = require('./error-code.json');
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.init(message)
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.init = function (info) {
	let err = this._checkErrorInformationObject(info);
	if (err) {
		throw new Error(err);
	} else {
		this.info = info;
		this.port.on('message', this._receiveMessage.bind(this));
	}
};

GotapiPluginUtil.prototype._checkErrorInformationObject = function (info) {
	let err = '';
	if (typeof (info) !== 'object') {
		return 'The `PluginInformation` object must be an Object object.';
	}

	let name = info['name'];
	if (!name) {
		return 'The `name` property is required in the `PluginInformation` object.';
	} else if (typeof (name) !== 'string') {
		return 'The value of the `name` property in the `PluginInformaton` object must be an string.';
	}

	let services = info['services'];
	if (!services) {
		err = 'The `services` property is requierd in the `PluginInformation` object.';
	} else if (!Array.isArray(services)) {
		err = 'The value of the `services` property in the `PluginInformation` object must be an Array object.';
	} else if (services.length === 0) {
		err = 'The number of elements in the `PluginInformation.services` must be grater than 0.'
	}

	let property_types = {
		'serviceId': 'string',
		'name': 'string',
		'online': 'boolean',
		'scopes': 'array',
		'manufacturer': 'string',
		'version': 'string',
		'type': 'string'
	};
	let required_property_list = [
		'serviceId',
		'name',
		'online',
		'scopes'
	];

	for (let i = 0; i < services.length; i++) {
		let s = services[i];
		if (typeof (s) !== 'object') {
			return 'The value of an element in the `PluginInformation.services` must be an Object object.';
		}
		for (let i = 0; i < required_property_list.length; i++) {
			let name = required_property_list[i];
			if (!(name in s)) {
				return 'The `' + name + '` property is required in the `PluginInformation.services`.'
			}
		}
		for (let name in property_types) {
			if (!(name in s)) {
				continue
			}
			let type = property_types[name];
			let value = s[name];
			if (type === 'string' || type === 'boolean') {
				if (typeof (value) !== type) {
					return 'The type of the `' + name + '` property in an element of the `PluginInformation.services` must be ' + type + '.';
				}
			} else if (type === 'array') {
				if (!Array.isArray(value)) {
					return 'The value of the `' + name + '` property in an element of the `PluginInformation.services` must be an Array object.';
				} else if (value.length === 0) {
					return 'The value of the `' + name + '` property in an element of the `PluginInformation.services` must be an Array object containing at least an element.'
				}
			}
		}
	}
	return '';
};

GotapiPluginUtil.prototype._receiveMessage = function (message_orig) {
	let message = JSON.parse(JSON.stringify(message_orig));
	this.requests[message['requestCode']] = message;

	// Plug-In Discovery (Service Discovery)
	if (message.profile === 'networkServiceDiscovery') {
		if (message.attribute === 'getNetworkServices') {
			this._getNetworkServices(message);
		}
		// Plug-In Approval
	} else if (message.profile === 'authorization') {
		// Request for registration of application
		if (message.attribute === 'createClient') {
			this._createClient(message);
			// Request for an access token
		} else if (message.attribute === 'requestAccessToken') {
			this._requestAccessToken(message);
		}
		// Plug-In functions
	} else {
		if (this.onmessage && typeof (this.onmessage) === 'function') {
			try {
				this.onmessage(message);
			} catch (error) {
				mConsole.error('[Plug-In ERROR]', error);
				this._returnErrorToGotapiServer(
					this.error_code_map['ERROR'],
					`The Plug-In caused an error: ` + error.message,
					message
				);
			}
		} else {
			this._returnErrorToGotapiServer(
				this.error_code_map['ERROR'],
				'The Plug-In forgets to attach a callback to reply messages.',
				message
			);
		}
	}
};

// Plug-In Discovery (Service Discovery)
GotapiPluginUtil.prototype._getNetworkServices = function (message) {
	/*
	* message = {
	*   receiver: "com.github.futomi.node-gotapi", // The application ID of the GotAPI Server
	*   requestCode: "xxxxxxxxxxxxxxxxxx", // A request code,
	*   api: "gotapi",
	*   profile: "networkServiceDiscovery",
	*   attribute: "getNetworkServices"
	* }
	*/
	if (this.onservicediscoverry && typeof (this.onservicediscoverry) === 'function') {
		this.onservicediscoverry(message);
	} else {
		message['result'] = 0;
		message['services'] = JSON.parse(JSON.stringify(this.info.services));
		this.port.postMessage(message);

		let request_code = message['requestCode'];
		if(this.requests[request_code]) {
			delete this.requests[request_code];
		}
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnServiceDiscovery(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnServiceDiscovery = function (message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if (!res) {
		return;
	}
	let services = [];
	if (('services' in message) && Array.isArray(message['services'])) {
		services = message['services'];
	}
	res['result'] = 0;
	res['services'] = services;
	this.port.postMessage(res);
	delete this.requests[request_code];
};

// Plug-In Approval
GotapiPluginUtil.prototype._createClient = function (message) {
	/*
	* message = {
	*   receiver: "com.github.futomi.node-gotapi", // The application ID of the GotAPI Server
	*   requestCode: 1, // A request code,
	*   api: "gotapi",
	*   profile: "authorization",
	*   attribute: "createClient",
	*   package: "http://localhost:8080" // The origin of the web app
	* }
	*/

	message['accept'] = true;
	if (this.onclinetid && typeof (this.onclinetid) === 'function') {
		this.onclinetid(message);
	} else {
		this.returnClientIdRequest(message);
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnClientIdRequest(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnClientIdRequest = function (message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if (!res) {
		return;
	}
	if (message && message['accept'] === true) {
		// Create an client ID
		let client_id = '';
		client_id += mCrypto.randomBytes(8).toString('hex') + '_';
		client_id += res.package + '_' + Date.now();
		let client_id_sha256 = mCrypto.createHash('sha256');
		client_id_sha256.update(client_id);
		client_id = client_id_sha256.digest('hex');
		this.client_id_map[client_id] = { client_id: client_id };
		// Return the result
		res['result'] = 0;
		res['clientId'] = client_id;
		this.port.postMessage(res);
	} else {
		let error_message = 'The Plug-In denied the request for a client ID.';
		if (message['errorMessage']) {
			error_message = message['errorMessage'];
		}
		this._returnErrorToGotapiServer(
			this.error_code_map['NOT_AUTHORIZED'],
			error_message,
			res
		);
	}
	delete this.requests[request_code];
};

// Plug-In Approval
GotapiPluginUtil.prototype._requestAccessToken = function (message) {
	/*
	* message = {
	*   receiver: "com.github.futomi.node-gotapi", // The application ID of the GotAPI Server
	*   requestCode: 1, // A request code,
	*   api: "gotapi",
	*   profile: "authorization",
	*   attribute: "requestAccessToken",
	*   package: "http://localhost:8080" // The origin of the web app
	*   clientId: "xxxxxxxxxxxxxxx"
	* }
	*/

	// This is an web application identifirer
	let app_id = message.package; // the web application id
	let client_id = message.clientId;
	let error_message = '';
	if (!app_id) {
		error_message = 'A package ID (application ID) is required.';
	} else if (!client_id) {
		error_message = 'A client ID is required.';
	} else if (!this.client_id_map[client_id]) {
		error_message = 'The specified cliend ID has not been registered or has been expired.'
	}
	if (error_message) {
		// Return the result
		this._returnErrorToGotapiServer(
			this.error_code_map['NOT_AUTHORIZED'],
			error_message,
			message
		);
	} else {
		message['accept'] = true;
		if (this.onaccesstoken && typeof (this.onaccesstoken) === 'function') {
			this.onaccesstoken(message);
		} else {
			this.returnAccessTokenRequest(message);
		}
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnAccessTokenRequest(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnAccessTokenRequest = function (message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if (!res) {
		return;
	}
	if (message && message['accept'] === true) {
		let client_id = res['clientId'];
		// Create an access token
		let access_token = '';
		access_token += mCrypto.randomBytes(8).toString('hex') + '_';
		access_token += client_id + '_';
		access_token += Date.now();
		let access_token_sha256 = mCrypto.createHash('sha256');
		access_token_sha256.update(access_token);
		access_token = access_token_sha256.digest('hex');
		this.client_id_map[client_id]['accessToken'] = access_token;
		// Return the result
		res['result'] = 0;
		res['accessToken'] = access_token;
		this.port.postMessage(res);
	} else {
		let error_message = 'The Plug-In denied the request for an access token.';
		if (message['errorMessage']) {
			error_message = message['errorMessage'];
		}
		this._returnErrorToGotapiServer(
			this.error_code_map['NOT_AUTHORIZED'],
			error_message,
			res
		);
	}
	delete this.requests[request_code];
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnMessage(message);
*  message = {
*    requestCode: "xxxxxxxxxxxx",
*    result: 401,
*    data: null,
*    errorMessage: ""
*  }
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnMessage = function (message) {
	message['action'] = 'RESPONSE';
	this._postMessage(message);
};

GotapiPluginUtil.prototype._postMessage = function (message) {
	if (!message) {
		return;
	}
	let request_code = message['requestCode'];
	if (!request_code || !this.requests[request_code]) {
		return;
	}

	let request = this.requests[request_code];
	let res = JSON.parse(JSON.stringify(request));
	res['action'] = message['action'];

	if ('result' in message) {
		let result = message['result'];
		if (typeof (result) === 'string' && result.match(/^\d+$/)) {
			result = parseInt(result, 10);
		}
		if (typeof (result) === 'number' && result % 1 === 0) {
			res['result'] = result;
		} else {
			res['statusCode'] = 500;
			res['errorMessage'] = 'An invalid result code was specified by the Plug-In: ' + message['result'].toString()
		}
	} else {
		res['result'] = 0;
	}

	if (res['result'] !== 0) {
		if ('errorCode' in message) {
			let error_code = message['errorCode'];
			if (typeof (error_code) !== 'string') {
				error_code = error_code.toString();
			}
			res['errorCode'] = error_code;
		} else {
			res['errorCode'] = res['result'].toString();
		}
		if ('errorMessage' in message) {
			let error_message = message['errorMessage'];
			if (typeof (error_message) !== 'string') {
				error_message = error_message.toString();
			}
			res['errorMessage'] = error_message;
		} else {
			res['errorMessage'] = '';
		}
	}

	if ('statusCode' in message) {
		let status_code = message['statusCode'];
		if (typeof (status_code) === 'string' && status_code.match(/^\d+$/)) {
			status_code = parseInt(status_code, 10);
		}
		if (typeof (status_code) === 'number') {
			let status_type = parseInt(status_code / 100, 10);
			if (res['result'] === 0) {
				if (status_type === 2) {
					res['statusCode'] = status_code;
				} else {
					res['statusCode'] = 200;
				}
			} else {
				if (status_type.toString().match(/^(4|5)$/)) {
					res['statusCode'] = status_code;
				} else {
					res['statusCode'] = 400;
				}
			}
		} else {
			res['result'] = 1;
			res['errorCode'] = '1';
			res['statusCode'] = 500;
			res['errorMessage'] = 'The Plug-In module specified an invalid HTTP status code: ' + status_code.toString();
		}
	} else {
		if (res['result'] === 0) {
			res['statusCode'] = 200;
		} else {
			let ecode = message['errorCode'];
			if (ecode && typeof (ecode) === 'number' && ecode % 1 === 0 && parseInt(ecode / 100).toString().match(/^(2|4|5)$/)) {
				// This is for backward compatibility.
				// The node-gotapi v0.2.2 and earlier used the `errorCode` for a HTTP status code.
				// This work-around will be deleted sometime in the future.
				res['statusCode'] = ecode;
			} else {
				res['statusCode'] = 400;
			}
		}
	}

	for (let k in message) {
		if (!(k in res)) {
			res[k] = message[k];
		}
	}

	if (res['result'] === 0) {
		delete res['errorCode'];
		delete res['errorMessage'];
	}

	this.port.postMessage(res);
	delete this.requests[request_code];
};

GotapiPluginUtil.prototype._returnErrorToGotapiServer = function (error_code_obj, message, data) {
	data['result'] = error_code_obj['result'];
	data['errorCode'] = error_code_obj['errorCode'];
	data['errorMessage'] = '[' + error_code_obj['errorName'] + '] ' + message;
	data['statusCode'] = error_code_obj['statusCode'];
	this.port.postMessage(data);
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.pushMessage(message);
*  message = {
*    result: 0,
*    data: 'something'
*  }
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.pushMessage = function (message) {
	if (!message || typeof (message) !== 'object' || !('result' in message)) {
		return;
	}
	let result = message['result'];
	if (typeof (result) === 'string' && result.match(/^d+$/)) {
		result = parseInt(result, 10);
	}
	if (typeof (result) !== 'number' || result % 1 !== 0) {
		return;
	}
	let res = JSON.parse(JSON.stringify(message));
	res['action'] = 'EVENT';
	this.port.postMessage(res);
};

module.exports = GotapiPluginUtil;