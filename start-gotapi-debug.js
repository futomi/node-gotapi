#!/usr/bin/env node
/* ------------------------------------------------------------------
* node-gotapi - start-gotapi-debug.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-04
* ---------------------------------------------------------------- */
'use strict';

// Load the node-gotapi module
let gotapi = require('./start-gotapi.js');

// Set a callback for monitoring the communications
//   Note that the callback must be set before calling
//   the `start()` method.
gotapi.oncommunication = (m) => {
	var cols = [];
	// The direction of the message
	if(m['dir'] === 1) { // incoming message
		cols.push('<<');
	} else if(m['dir'] === 2) { // outgoing message
		cols.push('>>');
	}
	// The GotAPI Interface
	cols.push('IF-' + m['type']);
	// The contents of the message
	if(m['type'] === 1) { // GotAPI-Interface-1/2 (HTTP)
		if(m['dir'] === 1) { // incoming
			cols.push(m['method'], m['url'], JSON.stringify(m['headers']));
		} else if(m['dir'] === 2) { // outgoing
			cols.push(m['code'], JSON.stringify(m['data']), JSON.stringify(m['headers']));
		}
	} else if(m['type'] === 5) { // GotAPI-Interface-5 (WebSocket)
		cols.push(JSON.stringify(m['data']));
	} else if(m['type'] === 4) { // GotAPI-Interface-4 (Plug-In)
		cols.push(JSON.stringify(m['data']));
	}
	// print the log
	var log = cols.join('\t');
	console.log(log)
};

// Start the GotAPI Server
gotapi.start();