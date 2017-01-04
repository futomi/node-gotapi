/* ------------------------------------------------------------------
* node-gotapi - http-server.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-03
* ---------------------------------------------------------------- */
'use strict';
let mFs = require('fs');
let mPath = require('path');
let mIPRest = require('./ip-address-restriction.js');

/* ------------------------------------------------------------------
* Constructor: HttpServer(config)
* ---------------------------------------------------------------- */
let HttpServer = function(config) {
	this.config = config;
	this.ext_mime_type_map = {};
	this.directory_index = ['index.html', 'index.htm'];
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
HttpServer.prototype.start = function() {
	var promise = new Promise((resolve, reject) => {
		// Load the data of mime types
		this.mime_type_ext_map = require('./mime-types.js');
		for(let mime in this.mime_type_ext_map) {
			this.mime_type_ext_map[mime].forEach((ext) => {
				this.ext_mime_type_map[ext] = mime;
			});
		}
		// Start the HTTP server for web apps
		try {
			let server = null;
			let port = 0;
			if(this.config['ssl_engine'] === true) {
				let https = require("https");
				server = https.createServer({
					key  : this.config['ssl_key_data'],
					cert : this.config['ssl_crt_data'], 
					ca   : this.config['ssl_ca_data']
				});
				port = this.config['https_server_port'];
			} else {
				let http = require('http');
				server = http.createServer();
				port = this.config['http_server_port'];
			}
			server.listen(port, () => {
				server.on('request', (req, res) => {
					this._receiveRequest(req, res);
				});
				resolve();
			});
		} catch(error) {
			reject(error);
		}
	});
	return promise;
};

HttpServer.prototype._fileExists = function(path) {
	let flag = false;
	try {
		mFs.statSync(path);
		flag = true;
	} catch(e) {
	}
	return flag;
};

/* ------------------------------------------------------------------
* Method: _receiveRequest(req, res)
* ---------------------------------------------------------------- */
HttpServer.prototype._receiveRequest = function(req, res) {
	let ip_allowed = mIPRest.isArrowed(req.connection.remoteAddress, this.config['allowed_address_list']);
	if(!ip_allowed) {
		res.writeHead(403, {'Content-Type': 'text/plain'});
		res.write('403 Forbidden');
		res.end();
		return;
	}

	let path = req.url.replace(/\?.*$/, '');
	if(path.match(/[^a-zA-Z\d\_\-\.\/]/)) {
		this._response404(req.url, res);
		return;
	}
	let fpath = this.config['http_server_document_root'] + path;
	fpath = mPath.normalize(fpath);

	// Check if the file path is in the document root
	if(fpath.indexOf(this.config['http_server_document_root']) !== 0) {
		this._response404(req.url, res);
		return;
	}

	// Check whther the target of the file path is a file or a directory
	this._determineFileTarget([fpath], (target_fpath) => {
		mFs.readFile(target_fpath, 'utf-8', (err, data) => {
			if(err) {
				this._response404(req.url, res);
			} else {
				let ctype = this._getContentType(target_fpath);
				res.writeHead(200, {'Content-Type': ctype});
				res.write(data);
				res.end();
			}
		});
	});
};

HttpServer.prototype._determineFileTarget = function(fpath_list, callback) {
	let fpath = fpath_list.shift();
	if(!fpath) {
		callback('');
		return;
	}
	mFs.stat(fpath, (err, stats) => {
		if(err) {
			if(fpath_list.length > 0) {
				this._determineFileTarget(fpath_list, callback);
			} else {
				callback('');
			}
		} else if(stats.isFile()) {
			callback(fpath);
		} else if(stats.isDirectory()) {
			this.directory_index.forEach((f) => {
				let new_fpath = mPath.normalize(mPath.join(fpath, f));
				fpath_list.unshift(new_fpath);
			});
			this._determineFileTarget(fpath_list, callback);
		}
	});
};

HttpServer.prototype._getContentType = function(fpath) {
	let ext = fpath.split('.').pop().toLowerCase();
	let ctype = this.ext_mime_type_map[ext];
	if(!ctype) {
		ctype = 'application/octet-stream';
	}
	return ctype;
}

HttpServer.prototype._response404 = function(url, res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
	res.write('404 Not Found: ' + url);
	res.end();
}

module.exports = HttpServer;