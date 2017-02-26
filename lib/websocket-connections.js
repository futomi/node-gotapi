/* ------------------------------------------------------------------
* node-gotapi - websocket-connections.js
*
* This module is used to manage WebSocket connections for the GotAPI-
* Interface-5.
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-02-26
* ---------------------------------------------------------------- */
'use strict';
let mCrypto = require('crypto');

/* ------------------------------------------------------------------
* Constructor: WebsocketConnection(id, conn)
* ---------------------------------------------------------------- */
let WebsocketConnection = function(id, conn) {
	this.id = id;
	this.conn = conn;
	this.callback = function() {};
	this.access_token = '';
	this.ctime = Date.now();
};

WebsocketConnection.prototype.init = function(callback) {
	this.callback = callback;
	this.conn.on('message', (message) => {
		let data = null;
		if(message.type === 'utf8' && 'utf8Data' in message) {
			data = message.utf8Data;
		} else if(message.type === 'binary' && 'binaryData' in message) {
			/*
			* For now, the node-gotapi does not support binary data for
			* the GotAPI-5 Inferface. 
			*/
			//data = message.binaryData;
		}
		this.callback(this.id, data);
	});
	this.conn.on('error', () => {});
};

WebsocketConnection.prototype.setAccessToken = function(access_token) {
	this.access_token = access_token;
};

WebsocketConnection.prototype.getAccessToken = function() {
	return this.access_token;
};

WebsocketConnection.prototype.send = function(message) {
	this.conn.send(message);
};

WebsocketConnection.prototype.destroy = function() {
	this.conn.close();
	this.callback = function() {};
	if(this.access_token_set_watch_timer_id) {
		clearInterval(this.access_token_set_watch_timer_id);
		this.access_token_set_watch_timer_id = 0;
	}
	this.access_token = '';
};

module.exports = WebsocketConnection;