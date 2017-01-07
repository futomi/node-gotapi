/* ------------------------------------------------------------------
* node-gotapi - gotapi-server.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-07
* ---------------------------------------------------------------- */
'use strict';
process.chdir(__dirname);
let mPath   = require('path');
let mCrypto = require('crypto');

/* ------------------------------------------------------------------
* Constructor: GotapiServer(config)
* ---------------------------------------------------------------- */
let GotapiServer = function(config) {
	this.config = config; 
	this.gotapiInterface1 = null;
	this.gotapiInterface4 = null;
	this.gotapiInterface5 = null;
	this.httpServer = null;
	this.authorizing_client = null;
	this.clients = {};
	this.requests = {};
	this.PRODUCT = "GotAPI Server for Node.js";
	this.VERSION = "0.0.11";
	this.config.product = this.PRODUCT;
	this.config.version = this.VERSION;

	// For debug
	this.oncommunication = null;
};

/* ------------------------------------------------------------------
* Method: start([callback])
* ---------------------------------------------------------------- */
GotapiServer.prototype.start = function(callback) {
	// Create the GotAPI-Interface-1 (HTTP server)
	let GotapiInterface1 = require('./gotapi-interface-1.js');
	this.gotapiInterface1 = new GotapiInterface1(this.config, this._receiveMessageOnIf1.bind(this));

	// Create the GotAPI-Interface-4
	let GotapiInterface4 = require('./gotapi-interface-4.js');
	this.gotapiInterface4 = new GotapiInterface4(this.config, this._receiveMessageOnIf4.bind(this));

	// Create the GotAPI-Interface-5 (WebSocket server)
	let GotapiInterface5 = require('./gotapi-interface-5.js');
	this.gotapiInterface5 = new GotapiInterface5(this.config, this.gotapiInterface1.server, this._receiveMessageOnIf5.bind(this));

	// Create a HTTP Server for applications
	let HttpServer = require('./http-server.js');
	this.httpServer = new HttpServer(this.config);

	// Monitor callback
	if(this.oncommunication && typeof(this.oncommunication) === 'function') {
		this.gotapiInterface1.oncommunication = this.oncommunication;
		//this.gotapiInterface4.oncommunication = this.oncommunication;
		this.gotapiInterface5.oncommunication = this.oncommunication;
	}

	// Run the servers
	this.gotapiInterface1.start().then(() => {
		console.log('- The GotAPI Interface-1 has been woken up.');
		return this.gotapiInterface4.start();
	}).then((plugin_list) => {
		console.log('- The GotAPI Interface-4 has been woken up.');
		if(plugin_list.length === 0) {
			console.log('  - No Plug-In was found.');
		} else if(plugin_list.length === 1) {
			console.log('  -  A Plug-In was found:');
		} else {
			console.log('  - ' + plugin_list.length + ' Plug-Ins were found:');
		}
		plugin_list.forEach((p) => {
			console.log('    - ' + p['info']['name'] + ' (' + p['id'] + ')');
		});
		return this.gotapiInterface5.start();
	}).then(() => {
		console.log('- The GotAPI Interface-5 has been woken up.');
		return this.httpServer.start();
	}).then(() => {
		let port = this.config['http_server_port'];
		let scheme = 'http:';
		if(this.config['ssl_engine'] === true) {
			port = this.config['https_server_port'];
			scheme = 'https:';
		}
		let url = scheme + '//localhost:' + port;
		console.log('- The HTTP server has been woken up.');
		console.log('The GotAPI Server has been started successfully.')
		console.log('Your web application can be accessed at ' + url);

		if(callback && typeof(callback) === 'function') {
			callback();
		}
	}).catch((error) => {
		console.log(error.message);
		return;
	});
};

/* ------------------------------------------------------------------
* Methods for the GotAPI-1 Interface (HTTP channel for web apps)
* ---------------------------------------------------------------- */

GotapiServer.prototype._receiveMessageOnIf1 = function(data) {
	/*
	* data = {
	*   if_type     : 1,
	*   request_id  : 12345678,
	*   request_url : "/gotapi/availability?key=01234567",
	*   params      : {
	*     key: 01234567
	*   },
	*   package     : "http://localhost:8080", // The origin of the web app
	*   api         : "gotapi",
	*   profile     : "authorization",
	*   attribute   : "accesstoken",
	*   method      : "get"
	* }
	*/
	let request_id = data['request_id'];
	this.requests[request_id] = data;
	let prof = data['profile'];
	let attr = data['attribute'];
	if(prof === 'availability') {
		this._availabilityApi(data);
	} else if(prof === 'authorization' && attr === 'grant') {
		this._authorizationGrant(data);
	} else if(prof === 'authorization' && attr === 'accesstoken') {
		this._authorizationAccesstoken(data);
	} else if(prof === 'servicediscovery') {
		this._serviceDiscovery(data);
	} else if(prof) {
		this._requestToPlugin(data);
	} else {
		this._returnErrorMessageToIf1(404, 'Unknown request.', data);
	}
};

GotapiServer.prototype._availabilityApi = function(data) {
	let p = data.params;
	if(p.key) {
		this.authorizing_client = {
			key: p.key,
			client_id: '',
			access_token: '',
			scope: []
		};
		this._returnMessageToIf1(data);
	} else {
		this._returnErrorMessageToIf1(400, 'The parameter `key` is required.', data);
	}
};

GotapiServer.prototype._authorizationGrant = function(data) {
	let p = data.params;
	if(this.authorizing_client) {
		let client_id = this._createUniqueRandomString();
		this.authorizing_client['client_id'] = client_id;
		data['clientId'] = client_id;
		data['_client'] = JSON.parse(JSON.stringify(this.authorizing_client));
		this._returnMessageToIf1(data);
	} else {
		this._returnErrorMessageToIf1(400, 'The availability API has not been called yet.', data);
	}
};

GotapiServer.prototype._createUniqueRandomString = function() {
	let id = '';
	id += mCrypto.randomBytes(32).toString('hex') + '_';
	id += Date.now();
	let sha256 = mCrypto.createHash('sha256');
	sha256.update(id);
	id = sha256.digest('hex');
	return id;
};

GotapiServer.prototype._authorizationAccesstoken = function(data) {
	let p = data.params;
	if(!this.authorizing_client) {
		this._returnErrorMessageToIf1(400, 'The availability API has not been called yet.', data);
		return;
	}
	if(p.clientId !== this.authorizing_client['client_id']) {
		this._returnErrorMessageToIf1(400, 'The specified client ID is invalid.', data);
		return;
	}
	if(!p.scope) {
		this._returnErrorMessageToIf1(400, 'The parameter "scope" is required.', data);
		return;
	}
	let access_token = this._createUniqueRandomString();
	this.authorizing_client['access_token'] = access_token;

	this.authorizing_client['scope'] = p.scope.split(/\,\s*/);
	this.clients[access_token] = this.authorizing_client;

	data['accessToken'] = access_token;
	data['_client'] = JSON.parse(JSON.stringify(this.authorizing_client));
	this._returnMessageToIf1(data);
	this.authorizing_client = null;
};

GotapiServer.prototype._serviceDiscovery = function(data) {
	let p = data.params;
	let access_token = p['accessToken'];
	if(!access_token) {
		this._returnErrorMessageToIf1(400, 'The access token is required.', data);
		return;
	} else if(!this.clients[access_token]) {
		this._returnErrorMessageToIf1(400, 'The specified access token is invalid.', data);
		return;
	}
	let client = this.clients[access_token];
	data['_client'] = JSON.parse(JSON.stringify(client));
	data['receiver'] = this.config.gotapi_server_app_id;
	this.gotapiInterface4.postMessage(data);
};

GotapiServer.prototype._requestToPlugin = function(data) {
	let p = data.params;
	let access_token = p['accessToken'];
	if(!access_token) {
		this._returnErrorMessageToIf1(400, 'The access token is required.', data);
		return;
	} else if(!this.clients[access_token]) {
		this._returnErrorMessageToIf1(400, 'The specified access token is invalid.', data);
		return;
	}
	let client = this.clients[access_token];
	data['_client'] = JSON.parse(JSON.stringify(client));
	data['receiver'] = this.config.gotapi_server_app_id;
	this.gotapiInterface4.postMessage(data);
};

GotapiServer.prototype._returnErrorMessageToIf1 = function(code, message, data) {
	data['result'] = code;
	data['errorCode'] = code;
	data['errorMessage'] = message;
	this._returnMessageToIf1(data);
};

GotapiServer.prototype._returnMessageToIf1 = function(data) {
	data['product'] = this.PRODUCT;
	data['version'] = this.VERSION;
	if(!data['result']) {
		data['result'] = 0;
		data['errorCode'] = 0;
		data['errorMessage'] = '';
	}
	this.gotapiInterface1.postMessage(data);

	let request_id = data['request_id'];
	if(this.requests[request_id]) {
		delete this.requests[request_id];
	}
};


/* ------------------------------------------------------------------
* Methods for the GotAPI-5 Interface (WebSocket channel for web apps)
* ---------------------------------------------------------------- */

GotapiServer.prototype._receiveMessageOnIf5 = function(data) {
	/*
	* data = {
	*   if_type     : 5,
	*   ws_conn_id  : "e8188012c2420bc036ba69461d7c23bc61321e687179c7159c79697b5b1435e4",
	*   accessToken : "0c68d31ffd58bd691c101a9e8d8ae02276bab905c161e092534d3e80f527427b",
	*   profile     : "authorization",
	*   attribute   : "verify",
	* }
	*/
	if(data['profile'] === 'authorization' && data['attribute'] === 'verify') {
		let access_token = data['accessToken'];
		if(this._verifyAccessToken(access_token)) {
			data['result'] = 0;
			data['errorCode'] = 0;
			data['errorMessage'] = '';
		} else {
			data['result'] = 401;
			data['errorCode'] = 401;
			data['errorMessage'] = 'The posted access token is not authorized.';
		}
		this.gotapiInterface5.postMessage(data);
	}
};

GotapiServer.prototype._verifyAccessToken = function(access_token) {
	if(!access_token) {
		return false;
	}
	let is_valid = false;
	for(let id in this.clients) {
		let client = this.clients[id];
		if(client['access_token'] === access_token) {
			is_valid = true;
			break;
		}
	}
	return is_valid;
};

GotapiServer.prototype._returnMessageToIf5 = function(data) {
	this.gotapiInterface5.postMessage(data);
};

/* ------------------------------------------------------------------
* Methods for the GotAPI-4 Interface (Plug-Ins)
* ---------------------------------------------------------------- */

GotapiServer.prototype._receiveMessageOnIf4 = function(data) {
	// Pass the response coming from a Plug-In to the Web app
	if(data['action'] === 'EVENT') {
		this._returnMessageToIf5(data);
	} else {
		this._returnMessageToIf1(data);
	}
};

module.exports = GotapiServer;