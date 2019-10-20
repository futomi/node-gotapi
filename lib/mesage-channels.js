/* ------------------------------------------------------------------
* node-gotapi - mesage-channels.js
*
* This module is used for the GotAPI-Interface-4 between the GotAPI
* Server and the Plug-Ins.
*
* This module is based on the WHATWG Message channels [1], which was 
* a part of the W3C HTML5 Web Messaging [2].
* [1] https://html.spec.whatwg.org/multipage/comms.html#channel-messaging
* [2] https://www.w3.org/TR/webmessaging/

* Copyright (c) 2017-2019, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2019-10-20
* ---------------------------------------------------------------- */
'use strict';
let mEventEmitter = require('events').EventEmitter;
let mUtil = require('util');

/* ------------------------------------------------------------------
* Constructor: MessageChannel()
* ---------------------------------------------------------------- */
let MessageChannel = function () {
	let port1 = new MessagePort(1, _eventCallback);
	let port2 = new MessagePort(2, _eventCallback);

	function _eventCallback(sender_port_number, type, message) {
		let receiver_port = (sender_port_number === 1) ? port2 : port1;
		receiver_port.emit('message', message);
	}

	this.port1 = port1;
	this.port2 = port2;
};

/* ------------------------------------------------------------------
* Constructor: MessagePort()
* ---------------------------------------------------------------- */
let MessagePort = function (port_number, callback) {
	this._port_number = port_number;
	this._callback = callback;
	this._queue = [];
	this._event_loop_active = false;
	mEventEmitter.call(this);
};
mUtil.inherits(MessagePort, mEventEmitter);

/* ------------------------------------------------------------------
* Method: MessagePort.postMessage(message)
* ---------------------------------------------------------------- */
MessagePort.prototype.postMessage = function (message) {
	this._queue.push(message);
	if (this._event_loop_active === false) {
		this._postMessageEventLoop();
	}
};

MessagePort.prototype._postMessageEventLoop = function () {
	let message = this._queue.shift();
	if (message) {
		this._callback(this._port_number, 'postMessage', message);
		this._event_loop_active = true;
		setTimeout(() => {
			this._postMessageEventLoop();
		}, 0);
	} else {
		this._event_loop_active = false;
	}
};

module.exports = MessageChannel;