#!/usr/bin/env node
/* ------------------------------------------------------------------
* node-gotapi - index.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-11-17
* ---------------------------------------------------------------- */
'use strict';
process.chdir(__dirname);
let mPath = require('path');
let mFs = require('fs-extra');
let mHttp = require('http');

// Command line options
let enable_debug = false;
let disable_auth = false;
let disable_monitor = false;
if(process.argv.length > 2) {
	for(let i=2; i<process.argv.length; i++) {
		let opt = process.argv[i];
		if(opt === '--enable-debug') {
			enable_debug = true;
		} else if(opt === '--disable-auth') {
			disable_auth = true;
		} else if(opt === '--disable-monitor') {
			disable_monitor = true; 
		} else {
			console.log('Unknow option: ' + opt);
			process.exit();
		}
	}
}
if(enable_debug === false) {
	disable_auth = false;
	disable_monitor = true;
}

if(!_isExistFile('./config.js')) {
	try {
		mFs.copySync('./config-default.js', './config.js');
	} catch(e) {
		_errorExit('Failed to copy `config-default.js` to `config.js`: ' + e.message);
	}
}

if(!_isExistFile('./html')) {
	try {
		mFs.copySync('./html-default', './html');
	} catch(e) {
		_errorExit('Failed to copy `html-default` to `html`: ' + e.message);
	}
}

if(!_isExistFile('./plugins')) {
	try {
		mFs.copySync('./plugins-default', './plugins');
	} catch(e) {
		_errorExit('Failed to copy `plugins-default` to `plugins`: ' + e.message);
	}
}

try {
	mFs.ensureDirSync('./ssl');
} catch(e) {
	_errorExit('Failed to make a directory `ssl`: ' + e.message);
}

let config = null;
try {
	config = require('./config.js');
} catch(error) {
	_errorExit('Failed to load `config.js`: ' + error.message);
}

['plugin_root_path', 'http_server_document_root'].forEach((k) => {
	config[k] = mPath.resolve(mPath.join(__dirname, config[k]));
});

if(config['ssl_engine'] === true) {
	if(config['ssl_key_file'] && config['ssl_crt_file']) {
		let key_res = _loadSSLFile(config['ssl_key_file']);
		let crt_res = _loadSSLFile(config['ssl_crt_file']);
		if(key_res['error']) {
			_errorExit('Failed to load the `ssl_key_file`: ' + key_res['error'].message);
		} else if(crt_res['error']) {
			_errorExit('Failed to load the `ssl_crt_file`: ' + crt_res['error'].message);
		} else {
			config['ssl_key_data'] = key_res['data'];
			config['ssl_crt_data'] = crt_res['data'];
		}
		if(config['ssl_ca_file_path']) {
			let ca_res = _loadSSLFile(config['ssl_ca_file']);
			if(ca_res['error']) {
				_errorExit('Failed to load the `ssl_ca_file`: ' + ca_res['error'].message);
			} else {
				config['ssl_ca_data'] = ca_res['data'];
			}
		}
		startServer();
	} else {
		let key_file = mPath.resolve(mPath.join(__dirname, './ssl/server.key'));
		let crt_file = mPath.resolve(mPath.join(__dirname, './ssl/server.crt'));;
		let key_res = _loadSSLFile(key_file);
		let crt_res = _loadSSLFile(crt_file);
		if(!key_res['error'] && !crt_res['error']) {
			config['ssl_key_data'] = key_res['data'];
			config['ssl_crt_data'] = crt_res['data'];
			startServer();
		} else {
			let pem = null;
			try {
				pem = require('pem');
			} catch(err) {
				_errorExit(err.message);
			}
			pem.createCertificate({days:3650, selfSigned:true}, (err, keys) => {
				if(err) {
					_errorExit(err.message);
				} else {
					config['ssl_key_data'] = keys.serviceKey;
					config['ssl_crt_data'] = keys.certificate;
					try {
						mFs.writeFileSync(key_file, keys.serviceKey, 'ascii');
						mFs.writeFileSync(crt_file, keys.certificate, 'ascii');
					} catch(error) {
						_errorExit(error.message);
					}
					startServer();
				}
			});
		}
	}
} else {
	startServer();
}

function startServer() {
	let GotapiServer = require('./lib/gotapi-server.js');
	let gotapi_server = new GotapiServer(config);

	if(disable_monitor === false) {
		gotapi_server.oncommunication = (m) => {
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
					console.log(m['code'] + ' ' + mHttp.STATUS_CODES[m['code']]);
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

	gotapi_server.start({
		enable_console: enable_debug,
		disable_auth: disable_auth
	}, () => {
		// For debug
		/*
		if(global.gc) {
			setInterval(() => {
				global.gc();
				console.log(process.memoryUsage());
			}, 60000);
		}
		*/
	});
}

function _errorExit(message) {
	console.log('[ERROR] ' + message);
	process.exit(1);
}

function _loadSSLFile(path) {
	let res = {data: null, error: null};
	if(_isExistFile(path)) {
		try {
			res['data'] = mFs.readFileSync(path, 'ascii');
		} catch(e) {
			res['error'] = e;
		}
	} else {
		res['error'] = new Error('Not found `' + path + '`.');
	}
	return res;
}

function _isExistFile(f) {
	let exist = false;
	try {
		mFs.statSync(f);
		exist = true;
	} catch(e) {
		exist = false;
	}
	return exist;
}