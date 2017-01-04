/* ------------------------------------------------------------------
* node-gotapi - websocket-connections.js
*
* This module is used to manage WebSocket connections for the GotAPI-
* Interface-5.
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-01
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
		this.callback(this.id, message);
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