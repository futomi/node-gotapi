#!/usr/bin/env node
/* ------------------------------------------------------------------
* node-gotapi - start-gotapi-debug.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-02-18
* ---------------------------------------------------------------- */
'use strict';

// Command line options
let disable_auth = false;
let disable_monitor = false; 
process.argv.forEach((opt) => {
	if(opt === '--disable-auth') {
		disable_auth = true;
	} else if(opt === '--disable-monitor') {
		disable_monitor = true; 
	}
});

// Load the node-gotapi module
let gotapi = require('./start-gotapi.js');

// Set a callback for monitoring the communications
//   Note that the callback must be set before calling
//   the `start()` method.
if(disable_monitor === false) {
	gotapi.oncommunication = (m) => {
		console.log('----------------------------------------------');
		// The direction of the message and the GotAPI Interface
		if(m['dir'] === 1) { // incoming message
			console.log('>> IF-' + m['type']);
		} else if(m['dir'] === 2) { // outgoing message
			console.log('<< IF-' + m['type']);
		}
		console.log('');
		// The contents of the message
		if(m['type'] === 1) { // GotAPI-Interface-1/2 (HTTP)
			if(m['dir'] === 1) { // incoming
				console.log(m['method'] + ' ' + m['url']);
			} else if(m['dir'] === 2) { // outgoing
				if(m['code'] === 200) {
					console.log(m['code'] + ' OK');
				} else {
					console.log(m['code'] + ' ' + m['data']['errorText']);
				}
				console.log('');
				console.log(JSON.stringify(m['data'], null, '  '));
			}
		} else if(m['type'] === 5) { // GotAPI-Interface-5 (WebSocket)
			console.log(JSON.stringify(m['data'], null, '  '));
		} else if(m['type'] === 4) { // GotAPI-Interface-4 (Plug-In)
			console.log(JSON.stringify(m['data'], null, '  '));
		}
		console.log('');
	};
}

// Start the GotAPI Server
gotapi.start({
	enable_console: true,
	disable_auth: disable_auth
});