/* ------------------------------------------------------------------
* node-gotapi - gotapi-interface-1.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-07
* ---------------------------------------------------------------- */
'use strict';
let mOs     = require('os');
let mCrypto = require('crypto');
let mIPRest = require('./ip-address-restriction.js');

/* ------------------------------------------------------------------
* Constructor: GotapiInterface1(config, sendToGotapiServer)
* ---------------------------------------------------------------- */
let GotapiInterface1 = function(config, sendToGotapiServer) {
	this.config = config;
	this.sendToGotapiServer = sendToGotapiServer;
	this.local_address_list = ['localhost'];
	this.requests = {};
	this.http_request_timeout = 10; // Seconds

	this.port = 0;
	this.server = null;
	this.status_codes = null;
	if(this.config['ssl_engine'] === true) {
		let https = require("https");
		this.server = https.createServer({
			key  : this.config['ssl_key_data'],
			cert : this.config['ssl_crt_data'], 
			ca   : this.config['ssl_ca_data']
		});
		this.port = this.config['gotapi_if_ssl_port'];
		let http = require('http');
		this.status_codes = http.STATUS_CODES;
	} else {
		let http = require('http');
		this.server = http.createServer();
		this.port = this.config['gotapi_if_port'];
		this.status_codes = http.STATUS_CODES;
	}

	this.oncommunication = null;
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
GotapiInterface1.prototype.start = function() {
	let promise = new Promise((resolve, reject) => {
		// Get the local IP addresses
		let netifs = mOs.networkInterfaces();
		for(let dev in netifs) {
			netifs[dev].forEach((info) => {
				this.local_address_list.push(info.address);
			});
		}
		// Start the HTTP server for the GotAPI-1 Interface
		try {
			this.server.listen(this.port, () => {
				this.server.on('request', (req, res) => {
					this._monitorIncoming(req);
					this._receiveRequestFromApp(req, res);
				});
				resolve();
			});
		} catch(error) {
			reject(error);
		}
		// Start to watch http connections
		this._watchHttpConnections();
	});
	return promise;
};

GotapiInterface1.prototype._monitorIncoming = function(req) {
	if(!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type   : 1,
		dir    : 1,
		url    : req.url,
		method : req.method,
		headers: req.headers
	});
};

GotapiInterface1.prototype._monitorOutgoing = function(m) {
	if(!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type    : 1,
		dir     : 2,
		code    : m['code'],
		headers : m['headers'],
		data    : m['data']
	});
};

GotapiInterface1.prototype._watchHttpConnections = function() {
	let now = Date.now();
	Object.keys(this.requests).forEach((request_id) => {
		let request = this.requests[request_id];
		if(now - request['ctime'] > this.http_request_timeout * 1000) {
			this._returnErrorToApp(request_id, 408, 'The GotAPI Server did not respond.');
		}
	});
	setTimeout(() => {
		this._watchHttpConnections();
	}, 1000);
};

GotapiInterface1.prototype._receiveRequestFromApp = function(req, res) {
	let ip_allowed = mIPRest.isArrowed(req.connection.remoteAddress, this.config['allowed_address_list']);
	if(ip_allowed && this._checkOrigin(req)) {
		let method = req.method.toLowerCase();
		if(method === 'options') {
			this._retunForPreflightRequestToApp(req, res);
		} else if(method.match(/^(get|post|put|delete)$/)) {
			this._handleRequestFromApp(req, res);
		} else {
			this._retun403ToApp(req, res, 'The HTTP method `' + method + '` is not allowed.');
		}
	} else {
		this._retun403ToApp(req, res, 'The access has not been allowed by the access restriction.');
	}
};

GotapiInterface1.prototype._checkOrigin = function(req) {
	let origin = req.headers['origin'];
	let scheme = '';
	let port = 0;
	if(this.config['ssl_engine'] === true) {
		scheme = 'https:';
		port = this.config['https_server_port'];
	} else {
		scheme = 'http:';
		port = this.config['http_server_port'];
	}

	let allowed = false;
	for(let i=0; i<this.local_address_list.length; i++) {
		let addr = this.local_address_list[i];
		if(req.headers['origin'] === scheme + '//' + addr + ':' + port) {
			allowed = true;
			break;
		}
	}
	if(allowed === true) {
		return allowed;
	}

	let allowed_origin_list = this.config['allowed_origin_list'];
	if(allowed_origin_list && Array.isArray(allowed_origin_list) && allowed_origin_list.length > 0) {
		for(let i=0; i<allowed_origin_list.length; i++) {
			if(req.headers['origin'] === allowed_origin_list[i]) {
				allowed = true;
				break;
			}
		}
	}
	return allow;
};

GotapiInterface1.prototype._retun403ToApp = function(req, res, err_message) {
	let code = 403;
	let headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': req.headers['origin']
	};
	res.writeHead(code, headers);
	let data = {
		result       : code,
		errorCode    : code,
		errorText    : this.status_codes[code] || 'Unknown Error',
		errorMessage : err_message
	};
	res.write(JSON.stringify(data));
	res.end();
	this._monitorOutgoing({code: code, data: data, headers: headers});
};

GotapiInterface1.prototype._retunForPreflightRequestToApp = function(req, res) {
	let headers = {
		'Content-Type'                : 'application/json',
		'Access-Control-Allow-Origin' : req.headers['origin'],
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
	};
	res.writeHead(200, headers);
	res.write('');
	res.end();
	this._monitorOutgoing({code: 200, data: null, headers: headers});
};

GotapiInterface1.prototype._handleRequestFromApp = function(req, res) {
	let method = req.method.toLowerCase();
	let request_id = this._createNewRequestId();
	let url_path_parts = (req.url.split('?'))[0].split('/');
	if(url_path_parts[1] === 'gotapi') {
		let message = {
			if_type     : 1,
			request_id  : request_id,
			request_url : req.url,
			params      : this._parseQueryString(req.url),
			package     : req.headers['origin'],
			api         : url_path_parts[1],
			profile     : url_path_parts[2] || '',
			attribute   : url_path_parts[3] || '',
			method      : req.method.toLowerCase()
		};
		this.requests[request_id] = {
			req    :req,
			res    :res,
			ctime  : Date.now(),
			message: message
		};
		this.sendToGotapiServer(message);
	} else {
		this._returnErrorToApp(request_id, 404, 'The URL of the request is invalid.');
	}
};

GotapiInterface1.prototype._createNewRequestId = function() {
	let id = '';
	id += mCrypto.randomBytes(32).toString('hex') + '_';
	id += Date.now();
	let sha256 = mCrypto.createHash('sha256');
	sha256.update(id);
	id = sha256.digest('hex');
	return id;
};

GotapiInterface1.prototype._returnErrorToApp = function(request_id, code, error_message) {
	let request = this.requests[request_id];
	if(!request || !request['message']) {
		return;
	}
	let message = request['message'];
	message['result'] = code;
	message['errorCode'] = code;
	message['errorText'] = this.status_codes[code] || 'Plug-In Error',
	message['errorMessage'] = error_message;
	this._returnResponseToApp(message);
};

GotapiInterface1.prototype._parseQueryString = function(url) {
	let parts = url.split('?');
	let q = parts[1];
	let p = {};
	if(!q) {
		return p;
	}
	let kv_list = q.split('&');
	kv_list.forEach((kv) => {
		let pair = kv.split('=');
		p[pair[0]] = decodeURIComponent(pair[1]);
	});
	return p;
};

GotapiInterface1.prototype._returnResponseToApp = function(data) {
	let request_id = data['request_id'];
	let request = this.requests[request_id];
	if(!request || !request['req'] || !request['res']) {
		delete this.requests[request_id];
		return;
	}

	let status_code = 200;
	if(data['result'] === 0) {
		data['errorCode'] = 0;
		data['errorText'] = '';
		data['errorMessage'] = '';
	} else {
		status_code = data['errorCode'];
		data['errorText'] = this.status_codes[status_code] || 'Unknown Error';
		if(!data['errorMessage']) {
			data['errorMessage'] = data['errorText'];
		}
	}

	let nonce = data['params']['nonce'];
	let key = '';
	if(data['_client']) {
		key = data['_client']['key'];
	}
	if(nonce && key) {
		data['hmac'] = mCrypto.createHmac('sha256', key).update(nonce).digest('hex');;
	}

	// Delete the properties used internally
	if(!(data['profile'] === 'authorization' && data['attribute'] === 'grant')) {
		delete data['clientId'];
	}
	delete data['profile'];
	delete data['attribute'];
	delete data['if_type'];
	delete data['package'];
	delete data['request_id'];
	delete data['action'];
	delete data['params'];
	delete data['request_url'];
	delete data['api'];
	delete data['receiver'];
	delete data['_client'];
	delete data['method'];
	delete data['_plugin_id_list'];

	let res = request['res'];
	let req = request['req'];

	let headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': req.headers['origin']
	};
	res.writeHead(status_code, headers);
	res.write(JSON.stringify(data));
	res.end();

	this._monitorOutgoing({code: status_code, data: data, headers: headers});

	delete this.requests[request_id];
};

/* ------------------------------------------------------------------
* Method: postMessage(data)
* This method is just an alias of the `_returnResponseToApp()` method,
* which is exposed to the GotAPI Server.
* When this method is called by the GotAPI Server, this method will
* pass the message to the web app on the GotAPI-1 Interface.
* ---------------------------------------------------------------- */
GotapiInterface1.prototype.postMessage = GotapiInterface1.prototype._returnResponseToApp;

module.exports = GotapiInterface1;