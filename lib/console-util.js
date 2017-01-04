/* ------------------------------------------------------------------
* node-gotapi - console-util.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-03
* ---------------------------------------------------------------- */
'use strict';

let ConsoleUtil = function() {};

ConsoleUtil.prototype.error = function(title, error) {
	console.log('\u001b[31m');
	//console.log('\x1b[31m\x1b[47m');
	console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
	console.log(title);
	console.log(error.message);
	console.log(error.stack);
	console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
	console.log('\u001b[0m');
};

module.exports = new ConsoleUtil();