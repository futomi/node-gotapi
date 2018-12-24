/* ------------------------------------------------------------------
* node-gotapi - gotapi-interface-5.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-12-24
* ---------------------------------------------------------------- */
'use strict';
let mWebsocket = require('websocket').server;
let mCrypto    = require('crypto');
let mHttp      = require('http');

/* ------------------------------------------------------------------
* Constructor: GotapiInterface5(config, if1_server, sendToGotapiServer)
* ---------------------------------------------------------------- */
let GotapiInterface5 = function(config, if1_server, sendToGotapiServer) {
	this.config = config;
	this.port = config.gotapi_if_port;
	this.server = new mWebsocket({
		httpServer: if1_server
	});
	this.sendToGotapiServer = sendToGotapiServer;
	this.conns = {};
	this.access_toke_conn_id_map = {};
	this.requests = {};
	this.WebsocketConnections = require('./websocket-connections.js');
	this.access_token_request_timeout = 5; // Seconds

	this.oncommunication = null;
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
GotapiInterface5.prototype.start = function() {
	var promise = new Promise((resolve, reject) => {
		this.server.on('request', (ws_req) => {
			if(this.server.connections.length > this.config.ws_connection_limit) {
				ws_req.reject();
			} else if(ws_req.resource !== '/gotapi/websocket') {
				ws_req.reject();
			} else {
				let ws_conn = ws_req.accept(null, null);
				this._connected(ws_conn);
			}
		});
		this._watchWebSocketConnections();
		resolve();
	});
	return promise;
};

GotapiInterface5.prototype._monitorIncoming = function(m) {
	if(!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type : 5,
		dir  : 1,
		data : m['data']
	});
};

GotapiInterface5.prototype._monitorOutgoing = function(m) {
	if(!this.oncommunication) {
		return;
	}
	this.oncommunication({
		type : 5,
		dir  : 2,
		data : m['data']
	});
};


GotapiInterface5.prototype._watchWebSocketConnections = function() {
	let now = Date.now();
	Object.keys(this.conns).forEach((ws_conn_id) => {
		let conn = this.conns[ws_conn_id];
		if(!conn.getAccessToken()) {
			if(now - conn['ctime'] > this.access_token_request_timeout * 1000) {
				this._returnErrorToApp(ws_conn_id, 408, 'Access token was not provided. This WebSocket connection will be closed in 1 second.');
				setTimeout((ws_conn_id) => {
					let conn = this.conns[ws_conn_id];
					conn.destroy();
					delete this.conns[ws_conn_id];
				}, 1000, ws_conn_id);
			}
		}
	});
	setTimeout(() => {
		this._watchWebSocketConnections();
	}, 1000);
};

GotapiInterface5.prototype._returnErrorToApp = function(ws_conn_id, code, message) {
	this._returnResponseToApp({
		ws_conn_id   : ws_conn_id,
		result       : code,
		errorCode    : code,
		errorText    : mHttp.STATUS_CODES[code] || 'Unknown Error',
		errorMessage : message
	});
};

GotapiInterface5.prototype._connected = function(ws_io_conn) {
	let ws_conn_id = this._createUniqueId();
	let conn = new this.WebsocketConnections(ws_conn_id, ws_io_conn);
	conn.init(this._receiveRequestFromApp.bind(this));
	this.conns[conn.id] = conn;
};

GotapiInterface5.prototype._createUniqueId = function() {
	let id = '';
	id += mCrypto.randomBytes(32).toString('hex') + '_';
	id += Date.now();
	let sha256 = mCrypto.createHash('sha256');
	sha256.update(id);
	id = sha256.digest('hex');
	return id;
};

GotapiInterface5.prototype._receiveRequestFromApp = function(ws_conn_id, json_string) {
	let data = this._parseReceivedJsonFromApp(json_string);
	this._monitorIncoming({data: data});
	if(data) {
		this._handleRequestFromApp(ws_conn_id, data);
	} else {
		this._returnErrorToApp(ws_conn_id, 400, 'The posted data is invalid as a JSON serialization.');
	}
};

GotapiInterface5.prototype._parseReceivedJsonFromApp = function(data) {
	let parsed = null;
	if(typeof(data) === 'string' && data !== '') {
		try {
			parsed = JSON.parse(data);
		} catch(e) {}
	}
	return parsed;
};

GotapiInterface5.prototype._handleRequestFromApp = function(ws_conn_id, data) {
	let conn = this.conns[ws_conn_id];
	if(data['accessToken']) {
		data['ws_conn_id'] = ws_conn_id;
		this.sendToGotapiServer({
			if_type     : 5,
			ws_conn_id  : ws_conn_id,
			accessToken : data['accessToken'],
			profile     : 'authorization',
			attribute   : 'verify'
		});
	}
};

GotapiInterface5.prototype._returnResponseToApp = function(data) {
	let ws_conn_id = data['ws_conn_id'];
	if(!ws_conn_id) {
		if(data['_client'] && data['_client']['access_token']) {
			let access_token = data['_client']['access_token'];
			ws_conn_id = this.access_toke_conn_id_map[access_token];
		} else {
			return;
		}
	}
	let conn = this.conns[ws_conn_id];
	if(!conn) {
		return;
	}

	if(!conn.getAccessToken() && data['profile'] === 'authorization' && data['attribute'] === 'verify') {
		if(data['result'] === 0) {
			conn.setAccessToken(data['accessToken']);
			this.access_toke_conn_id_map[data['accessToken']] = ws_conn_id;
		}
	}

	data['errorText'] = '';
	if(data['result'] === 0) {
		delete data['errorCode'];
		delete data['errorText'];
		delete data['errorMessage'];
	}

	data['serviceId'] =('params' in data) ? data['params']['serviceId'] : '';

	delete data['ws_conn_id'];
	delete data['accessToken'];
	delete data['if_type'];
	delete data['request_id'];
	delete data['request_url'];
	delete data['params'];
	delete data['package'];
	delete data['_client'];
	delete data['api'];
	delete data['method'];
	delete data['receiver'];
	delete data['action'];
	delete data['clientId'];

	conn.send(JSON.stringify(data));
	this._monitorOutgoing({data: data});
};

/* ------------------------------------------------------------------
* Method: postMessage(data)
* This method is just an alias of the `_returnResponseToApp()` method,
* which is exposed to the GotAPI Server.
* When this method is called by the GotAPI Server, this method will
* pass the message to the web app on the GotAPI-1 Interface.
* ---------------------------------------------------------------- */
GotapiInterface5.prototype.postMessage = GotapiInterface5.prototype._returnResponseToApp;

module.exports = GotapiInterface5;