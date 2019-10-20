/* ------------------------------------------------------------------
* node-gotapi - gotapi-interface-1.js
*
* Copyright (c) 2017-2019, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2019-10-20
* ---------------------------------------------------------------- */
'use strict';
let mOs = require('os');
let mCrypto = require('crypto');
let mIPRest = require('./ip-address-restriction.js');
let mWebContentProvider = require('./web-content-provider.js');

/* ------------------------------------------------------------------
* Constructor: GotapiInterface1(config, sendToGotapiServer)
* ---------------------------------------------------------------- */
let GotapiInterface1 = function (config, sendToGotapiServer) {
	this.config = config;
	this.sendToGotapiServer = sendToGotapiServer;
	this.local_address_list = ['localhost'];
	this.requests = {};
	this.http_request_timeout = 65; // Seconds

	this.port = 0;
	this.server = null;
	this.status_codes = null;
	if (this.config['ssl_engine'] === true) {
		let https = require("https");
		this.server = https.createServer({
			key: this.config['ssl_key_data'],
			cert: this.config['ssl_crt_data'],
			ca: this.config['ssl_ca_data']
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

	this.error_code_map = require('./error-code.json');

	// For Web contents
	this.web_content_provider = null;
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
GotapiInterface1.prototype.start = function () {
	let promise = new Promise((resolve, reject) => {
		// For Web contents
		this.web_content_provider = new mWebContentProvider(this.config);

		// Get the local IP addresses
		let netifs = mOs.networkInterfaces();
		for (let dev in netifs) {
			netifs[dev].forEach((info) => {
				this.local_address_list.push(info.address);
			});
		}
		// Start the HTTP server for the GotAPI-1 Interface
		try {
			this.server.on('error', (error) => {
				reject(error);
			});
			this.server.listen(this.port, () => {
				this.server.on('request', (req, res) => {
					let url_path_parts = (req.url.split('?'))[0].split('/');
					if (url_path_parts[1] === 'gotapi') {
						this._monitorIncoming(req);
						this._receiveRequestFromApp(req, res);
					} else {
						this.web_content_provider.receiveRequest(req, res);
					}
				});
				this.server.removeAllListeners('error');
				resolve();
			});
		} catch (error) {
			reject(error);
		}
		// Start to watch http connections
		this._watchHttpConnections();
	});
	return promise;
};

GotapiInterface1.prototype._monitorIncoming = function (req) {
	if (!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type: 1,
		dir: 1,
		url: req.url,
		method: req.method,
		headers: req.headers
	});
};

GotapiInterface1.prototype._monitorOutgoing = function (m) {
	if (!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type: 1,
		dir: 2,
		code: m['code'],
		headers: m['headers'],
		data: m['data']
	});
};

GotapiInterface1.prototype._watchHttpConnections = function () {
	let now = Date.now();
	Object.keys(this.requests).forEach((request_id) => {
		let request = this.requests[request_id];
		if (now - request['ctime'] > this.http_request_timeout * 1000) {
			this._returnErrorToApp(
				request_id,
				this.error_code_map['TIMEOUT'],
				'TIMEOUT: The GotAPI Server did not respond.'
			);
		}
	});
	setTimeout(() => {
		this._watchHttpConnections();
	}, 1000);
};

GotapiInterface1.prototype._receiveRequestFromApp = function (req, res) {
	let origin = this._getOrigin(req);
	if (origin && !req.headers['origin']) {
		req.headers['origin'] = origin;
	}
	let ip_allowed = mIPRest.isArrowed(req.connection.remoteAddress, this.config['allowed_address_list']);
	if (ip_allowed) {
		if (this._checkOrigin(req)) {
			let method = req.method.toLowerCase();
			if (method === 'options') {
				this._retunForPreflightRequestToApp(req, res);
			} else if (method.match(/^(get|post|put|delete)$/)) {
				this._handleRequestFromApp(req, res);
			} else {
				this._retun403ToApp(
					req, res,
					this.error_code_map['INVALID_METHOD'],
					'The HTTP method `' + method + '` is not allowed.'
				);
			}
		} else {
			this._retun403ToApp(
				req, res,
				this.error_code_map['INVALID_ORIGIN'],
				'The access from the origin `' + req.headers['origin'] + '` is not allowed.'
			);
		}
	} else {
		this._retun403ToApp(
			req, res,
			this.error_code_map['NOT_AUTHORIZED'],
			'The access from the IP address `' + req.connection.remoteAddress + '` is not allowed.'
		);
	}
};

GotapiInterface1.prototype._retun403ToApp = function (req, res, error_code_obj, error_message) {
	let headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': req.headers['origin'] || '*'
	};
	let code = error_code_obj['statusCode'];
	res.writeHead(code, headers);
	let data = {
		result: error_code_obj['result'],
		errorCode: error_code_obj['errorCode'],
		errorText: this.status_codes[code] || 'Unknown Error',
		errorMessage: '[' + error_code_obj['errorName'] + '] ' + error_message,
		statusCode: error_code_obj['statusCode']
	};
	res.write(JSON.stringify(data));
	res.end();
	this._monitorOutgoing({ code: error_code_obj['statusCode'], data: data, headers: headers });
};

GotapiInterface1.prototype._getOrigin = function (req) {
	let origin = req.headers['origin'];
	if (origin) {
		return origin;
	}
	let referer = req.headers['referer'];
	if (referer) {
		let m = referer.match(/^(https*\:\/\/[^\/]+)/);
		if (m && m[1]) {
			return m[1];
		}
	}
	return '';
};

GotapiInterface1.prototype._checkOrigin = function (req) {
	if (this.config['disable_auth']) {
		return true;
	}
	let origin = req.headers['origin'];
	if (!origin) {
		return false;
	}
	let scheme = '';
	let port1 = 0;
	let port2 = 0;
	if (this.config['ssl_engine'] === true) {
		scheme = 'https:';
		port1 = this.config['gotapi_if_ssl_port'];
		port2 = this.config['https_server_port'];
	} else {
		scheme = 'http:';
		port1 = this.config['gotapi_if_port'];
		port2 = this.config['http_server_port'];
	}

	let allowed = false;

	if (!/\.local/.test(origin)) {
		for (let i = 0; i < this.local_address_list.length; i++) {
			let addr = this.local_address_list[i];
			let list = [
				scheme + '//' + addr + ':' + port1,
				scheme + '//' + addr + ':' + port2,
				scheme + '//[' + addr + ']:' + port1,
				scheme + '//[' + addr + ']:' + port2,
			];
			list.forEach((u) => {
				if (origin === u) {
					allowed = true;
				}
			});
		}
		if (allowed === true) {
			return allowed;
		}
	}

	let allowed_origin_list = this.config['allowed_origin_list'];
	if (allowed_origin_list && Array.isArray(allowed_origin_list) && allowed_origin_list.length > 0) {
		for (let i = 0; i < allowed_origin_list.length; i++) {
			if (origin === allowed_origin_list[i]) {
				allowed = true;
				break;
			}
		}
	}
	return allowed;
};

GotapiInterface1.prototype._retunForPreflightRequestToApp = function (req, res) {
	let headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': req.headers['origin'] || '*',
		'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
	};
	res.writeHead(200, headers);
	res.write('');
	res.end();
	this._monitorOutgoing({ code: 200, data: null, headers: headers });
};

GotapiInterface1.prototype._handleRequestFromApp = function (req, res) {
	let request_id = this._createNewRequestId();
	let url_path_parts = (req.url.split('?'))[0].split('/');
	let params_parse_result = this._parseQueryStringFromUrl(req.url);
	this.requests[request_id] = {
		req: req,
		res: res,
		ctime: Date.now(),
		message: {
			if_type: 1,
			request_id: request_id,
			request_url: req.url,
			params: params_parse_result['result'],
			package: this.config['disable_auth'] ? 'dummy' : req.headers['origin'],
			api: url_path_parts[1],
			profile: url_path_parts[2] || '',
			attribute: url_path_parts[3] || '',
			method: req.method.toLowerCase()
		}
	};
	if (params_parse_result['error']) {
		this._returnErrorToApp(
			request_id,
			this.error_code_map['INVALID_PARAMETER'],
			'Failed to parse parameters: ' + params_parse_result['error']
		);
		return;
	}
	let ctype = req.headers['content-type'] || '';
	if (ctype === 'application/x-www-form-urlencoded') {
		let body = '';
		req.on('data', (data) => {
			body += data;
		});
		req.on('end', () => {
			let p = this._parseQueryString(body);
			if (p['error']) {
				this._returnErrorToApp(
					request_id,
					this.error_code_map['INVALID_PARAMETER'],
					'Failed to parse parameters: ' + p['error']
				);
				return;
			}
			if (p['result']) {
				let params = this.requests[request_id]['message']['params'];
				for (let k in p['result']) {
					params[k] = p['result'][k];
				}
			}
			let message = JSON.parse(JSON.stringify(this.requests[request_id]['message']));
			this.sendToGotapiServer(message);
		});
	} else if (ctype.match(/^multipart\/form\-data/)) {
		this._returnErrorToApp(
			request_id,
			this.error_code_map['INVALID_METHOD'],
			'The content type `multipart/form-data` is not supported.'
		);
	} else {
		let message = JSON.parse(JSON.stringify(this.requests[request_id]['message']));
		this.sendToGotapiServer(message);
	}
};

GotapiInterface1.prototype._createNewRequestId = function () {
	let id = '';
	id += mCrypto.randomBytes(32).toString('hex') + '_';
	id += Date.now();
	let sha256 = mCrypto.createHash('sha256');
	sha256.update(id);
	id = sha256.digest('hex');
	return id;
};

GotapiInterface1.prototype._returnErrorToApp = function (request_id, error_code_obj, error_message) {
	let request = this.requests[request_id];
	if (!request || !request['message']) {
		return;
	}
	let status_code = error_code_obj['statusCode'];
	let message = request['message'];
	message['result'] = error_code_obj['result'];
	message['errorCode'] = error_code_obj['errorCode'];
	message['errorText'] = this.status_codes[status_code] || 'Unknown Error',
		message['errorMessage'] = '[' + error_code_obj['errorName'] + '] ' + error_message;
	message['statusCode'] = status_code;
	this._returnResponseToApp(message);
};

GotapiInterface1.prototype._parseQueryStringFromUrl = function (url) {
	let parts = url.split('?');
	let q = parts[1];
	if (q) {
		return this._parseQueryString(q);
	} else {
		return { result: {} };
	}
};

GotapiInterface1.prototype._parseQueryString = function (q) {
	let p = {};
	let kv_list = q.split('&');
	let error = '';
	kv_list.forEach((kv) => {
		let pair = kv.split('=');
		try {
			p[pair[0]] = decodeURIComponent(pair[1]);
		} catch (e) {
			error = e.message;
		}
	});
	if (error) {
		return { result: {}, error: error };
	} else {
		return { result: p };
	}
};

GotapiInterface1.prototype._returnResponseToApp = function (data) {
	let request_id = data['request_id'];
	let request = this.requests[request_id];
	if (!request || !request['req'] || !request['res']) {
		delete this.requests[request_id];
		return;
	}

	let status_code = data['statusCode'];

	if (data['result'] === 0) {
		delete data['errorCode'];
		delete data['errorText'];
		delete data['errorMessage'];
		if ('statusCode' in data) {
			let sc = data['statusCode'];
			//if (!sc || typeof (sc) !== 'number' || !parseInt(sc / 100, 10).toString().match(/^(2|4|5)$/) || !this.status_codes[sc]) {
			if (!sc || typeof (sc) !== 'number' || !/^(2|4|5)\d{2}$/.test(sc.toString()) || !this.status_codes[sc]) {
				data['result'] = 1;
				data['errorCode'] = '1';
				data['errorMessage'] = '[ERROR] Plug-In set an invalid HTTP status code: ' + data['statusCode'];
				data['errorText'] = this.status_codes[500];
				data['statusCode'] = 500;
			}
		} else {
			data['statusCode'] = 200;
		}
	} else {
		data['errorText'] = this.status_codes[status_code];
		if (data['errorText']) {
			if (!data['errorMessage']) {
				data['errorMessage'] = data['errorText'];
			}
		} else {
			data['result'] = 1;
			data['errorCode'] = '1';
			data['errorMessage'] = '[ERROR] Plug-In set an invalid HTTP status code: ' + data['statusCode'];
			data['errorText'] = this.status_codes[500];
			data['statusCode'] = 500;
		}
	}

	let nonce = data['params']['nonce'];
	let key = '';
	if (data['_client']) {
		key = data['_client']['key'];
	}
	if (nonce && key) {
		data['hmac'] = mCrypto.createHmac('sha256', key).update(nonce).digest('hex');;
	}

	data['serviceId'] = ('params' in data) ? data['params']['serviceId'] : '';

	// Delete the properties used internally
	if (!(data['profile'] === 'authorization' && data['attribute'] === 'grant')) {
		delete data['clientId'];
	}
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

	if (!this.status_codes[data['statusCode']]) {
		data['result'] = 1;
		data['errorCode'] = '1';
		data['errorMessage'] = '[ERROR] Plug-In set an invalid HTTP status code: ' + data['statusCode'];
		data['errorText'] = this.status_codes[500];
		data['statusCode'] = 500;
	}

	let res = request['res'];
	let req = request['req'];

	let headers = {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': req.headers['origin'] || '*'
	};
	res.writeHead(data['statusCode'], headers);
	res.write(JSON.stringify(data));
	res.end();

	this._monitorOutgoing({ code: data['statusCode'], data: data, headers: headers });
	data = null;
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