/* ------------------------------------------------------------------
* node-gotapi - gotapi-plugin-util.js
*
* This module is used by Plug-Ins for communication with the GotAPI
* Server on the GotAPI-4 Interface.
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-03-29
* ---------------------------------------------------------------- */
'use strict';
let mCrypto = require('crypto');
let mConsole = require('./console-util.js');

/* ------------------------------------------------------------------
* Constructor: GotapiPluginUtil(port)
* ---------------------------------------------------------------- */
let GotapiPluginUtil = function(port) {
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
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.init(message)
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.init = function(info) {
	let err = this._checkErrorInformationObject(info);
	if(err) {
		throw new Error(err);
	} else {
		this.info = info;
		this.port.on('message', this._receiveMessage.bind(this));
	}
};

GotapiPluginUtil.prototype._checkErrorInformationObject = function(info) {
	let err = '';
	if(typeof(info) !== 'object') {
		return 'The `PluginInformation` object must be an Object object.';
	}

	let name = info['name'];
	if(!name) {
		return 'The `name` property is required in the `PluginInformation` object.';
	} else if(typeof(name) !== 'string') {
		return 'The value of the `name` property in the `PluginInformaton` object must be an string.';
	}

	let services = info['services'];
	if(!services) {
		err = 'The `services` property is requierd in the `PluginInformation` object.';
	} else if(!Array.isArray(services)) {
		err = 'The value of the `services` property in the `PluginInformation` object must be an Array object.';
	} else if(services.length === 0) {
		err = 'The number of elements in the `PluginInformation.services` must be grater than 0.'
	}

	let property_types = {
		'serviceId'   : 'string',
		'name'        : 'string',
		'online'      : 'boolean',
		'scopes'      : 'array',
		'manufacturer': 'string',
		'version'     : 'string',
		'type'        : 'string'
	};
	let required_property_list = [
		'serviceId',
		'name',
		'online',
		'scopes'
	];

	for(let i=0; i<services.length; i++) {
		let s = services[i];
		if(typeof(s) !== 'object') {
			return 'The value of an element in the `PluginInformation.services` must be an Object object.';
		}
		for(let i=0; i<required_property_list.length; i++) {
			let name = required_property_list[i];
			if(!(name in s)) {
				return 'The `' + name + '` property is required in the `PluginInformation.services`.'
			}
		}
		for(let name in property_types) {
			if(!(name in s)) {
				continue
			}
			let type = property_types[name];
			let value = s[name];
			if(type === 'string' || type === 'boolean') {
				if(typeof(value) !== type) {
					return 'The type of the `' + name + '` property in an element of the `PluginInformation.services` must be ' + type + '.';
				}
			} else if(type === 'array') {
				if(!Array.isArray(value)) {
					return 'The value of the `' + name + '` property in an element of the `PluginInformation.services` must be an Array object.';
				} else if(value.length === 0) {
					return 'The value of the `' + name + '` property in an element of the `PluginInformation.services` must be an Array object containing at least an element.'
				}
			}
		}
	}
	return '';
};

GotapiPluginUtil.prototype._receiveMessage = function(message) {
	this.requests[message['requestCode']] = JSON.parse(JSON.stringify(message));
	// Plug-In Discovery (Service Discovery)
	if(message.profile === 'networkServiceDiscovery') {
		if(message.attribute === 'getNetworkServices') {
			this._getNetworkServices(message);
		}
	// Plug-In Approval
	} else if(message.profile === 'authorization') {
		// Request for registration of application
		if(message.attribute === 'createClient') {
			this._createClient(message);
		// Request for an access token
		} else if(message.attribute === 'requestAccessToken') {
			this._requestAccessToken(message);
		}
	// Plug-In functions
	} else {
		if(this.onmessage && typeof(this.onmessage) === 'function') {
			try {
				this.onmessage(JSON.parse(JSON.stringify(message)));
			} catch(error) {
				mConsole.error('[Plug-In ERROR]', error);
				message['result'] = 500;
				message['errorCode'] = 500;
				message['errorMessage'] = `The Plug-In caused an error: ` + error.message;
				this.port.postMessage(message);
			}
		} else {
			message['result'] = 501;
			message['errorCode'] = 501;
			message['errorMessage'] = 'The Plug-In forgets to attach a callback to reply messages.';
			this.port.postMessage(message);
		}
	}
};

// Plug-In Discovery (Service Discovery)
GotapiPluginUtil.prototype._getNetworkServices = function(message) {
	/*
	* message = {
	*   receiver: "com.github.futomi.node-gotapi", // The application ID of the GotAPI Server
	*   requestCode: "xxxxxxxxxxxxxxxxxx", // A request code,
	*   api: "gotapi",
	*   profile: "networkServiceDiscovery",
	*   attribute: "getNetworkServices"
	* }
	*/
	if(this.onservicediscoverry && typeof(this.onservicediscoverry) === 'function') {
		this.onservicediscoverry(message);
	} else {
		message['result'] = 0;
		message['services'] = JSON.parse(JSON.stringify(this.info.services));
		this.port.postMessage(message);
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnServiceDiscovery(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnServiceDiscovery = function(message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if(!res) {
		return;
	}
	let services = [];
	if(('services' in message) && Array.isArray(message['services'])) {
		services = message['services'];
	}
	res['result'] = 0;
	res['services'] = services;
	this.port.postMessage(res);
	delete this.requests[request_code];
};

// Plug-In Approval
GotapiPluginUtil.prototype._createClient = function(message) {
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
	message['errorMessage'] = '';
	if(this.onclinetid && typeof(this.onclinetid) === 'function') {
		this.onclinetid(message);
	} else {
		this.returnClientIdRequest(message);
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnClientIdRequest(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnClientIdRequest = function(message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if(!res) {
		return;
	}
	if(message && message['accept'] === true) {
		// Create an client ID
		let client_id = '';
		client_id += mCrypto.randomBytes(8).toString('hex') + '_';
		client_id += res.package + '_' + Date.now();
		let client_id_sha256 = mCrypto.createHash('sha256');
		client_id_sha256.update(client_id);
		client_id = client_id_sha256.digest('hex');
		this.client_id_map[client_id] = {client_id: client_id};
		// Return the result
		res['result'] = 0;
		res['clientId'] = client_id;
		this.port.postMessage(res);
	} else {
		res['result'] = 403;
		res['errorCode'] = 403;
		if(message['errorMessage']) {
			res['errorMessage'] = message['errorMessage'];
		} else {
			res['errorMessage'] = 'The Plug-In denied the request for a client ID.';
		}
		this.port.postMessage(res);
	}
	delete this.requests[request_code];
};

// Plug-In Approval
GotapiPluginUtil.prototype._requestAccessToken = function(message) {
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
	if(!app_id) {
		error_message = 'A package ID (application ID) is required.';
	} else if(!client_id) {
		error_message = 'A client ID is required.';
	} else if(!this.client_id_map[client_id]) {
		error_message = 'The specified cliend ID has not been registered or has been expired.'
	}
	if(error_message) {
		// Return the result
		message['result'] = 401;
		message['errorCode'] = 401;
		message['errorMessage'] = error_message;
		this.port.postMessage(message);
	} else {
		message['accept'] = true;
		message['errorMessage'] = '';
		if(this.onaccesstoken && typeof(this.onaccesstoken) === 'function') {
			this.onaccesstoken(message);
		} else {
			this.returnAccessTokenRequest(message);
		}
	}
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.returnAccessTokenRequest(message);
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.returnAccessTokenRequest = function(message) {
	let request_code = message['requestCode'];
	let res = this.requests[request_code];
	if(!res) {
		return;
	}
	if(message && message['accept'] === true) {
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
		res['result'] = 403;
		res['errorCode'] = 403;
		if(message['errorMessage']) {
			res['errorMessage'] = message['errorMessage'];
		} else {
			res['errorMessage'] = 'The Plug-In denied the request for an access token.';
		}
		this.port.postMessage(res);
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
GotapiPluginUtil.prototype.returnMessage = function(message) {
	message['action'] = 'RESPONSE';
	this._postMessage(message);
};

/* ------------------------------------------------------------------
* Method: GotapiPluginUtil.pushMessage(message);
*  message = {
*    requestCode: "xxxxxxxxxxxx",
*    result: 401,
*    data: null,
*    errorMessage: ""
*  }
* ---------------------------------------------------------------- */
GotapiPluginUtil.prototype.pushMessage = function(message) {
	message['action'] = 'EVENT';
	this._postMessage(message);
};

GotapiPluginUtil.prototype._postMessage = function(message) {
	if(!message) {
		return;
	}
	let request_code = message['requestCode'];
	if(!request_code || !this.requests[request_code]) {
		return;
	}

	let result = message['result'];
	if(result) {
		if(typeof(result) === 'number') {
			result = parseInt(result, 10);
		} else {
			result = 500;
		}
	} else {
		result = 0;
	}

	let error_message = message['errorMessage'];
	if(!error_message) {
		error_message = '';
	} else if(typeof(error_message) !== 'string') {
		error_message = error_message.toString();
	}

	let request = this.requests[request_code];
	let res = JSON.parse(JSON.stringify(request));
	res['action'] = message['action'];
	res['errorMessage'] = error_message;
	res['result'] = result;

	if(result > 0) {
		if('errorCode' in message) {
			let error_code = message['errorCode'];
			if(typeof(error_code) === 'number') {
				error_code = parseInt(error_code, 10);
				if(error_code < 400 || error_code >= 1000) {
					res['errorCode'] = 500;
					res['errorMessage'] = 'An invalid HTTP status code was specified by the Plug-In.'
				}
			} else {
				res['errorCode'] = 500;
				res['errorMessage'] = 'An invalid HTTP status code was specified by the Plug-In.'
			}
		} else {
			if(result < 1000) {
				res['errorCode'] = result;
			} else {
				res['errorCode'] = 500;
				res['errorMessage'] = 'The Plug-In did not specify the HTTP status code.';
			}
		}
	} else {
		res['errorCode'] = 0;
	}


	for(let k in message) {
		if(!(k in res)) {
			res[k] = message[k];
		}
	}

	this.port.postMessage(res);

	if(request['method'] === 'delete') {
		Object.keys(this.requests).forEach((code) => {
			let r = this.requests[code];
			if(r['method'] === 'put' && r['profile'] === res['profile'] && r['attribute'] === res['attribute']) {
				delete this.requests[code];
			}
		});
	}
	if(request['method'] !== 'put') {
		delete this.requests[request_code];
	}
};

module.exports = GotapiPluginUtil;