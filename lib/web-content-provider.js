/* ------------------------------------------------------------------
* node-gotapi - web-content-provider.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-12-23
* ---------------------------------------------------------------- */
'use strict';
let mFs = require('fs');
let mPath = require('path');
let mIPRest = require('./ip-address-restriction.js');

/* ------------------------------------------------------------------
* Constructor: WebContentProvider(config)
* ---------------------------------------------------------------- */
let WebContentProvider = function (config) {
	this.config = config;
	this.directory_index = ['index.html', 'index.htm'];

	// Load the data of mime types
	this.mime_type_ext_map = require('./mime-types.js');
	this.ext_mime_type_map = {};
	for (let mime in this.mime_type_ext_map) {
		this.mime_type_ext_map[mime].forEach((ext) => {
			this.ext_mime_type_map[ext] = mime;
		});
	}
};

/* ------------------------------------------------------------------
* Method: receiveRequest(req, res)
* ---------------------------------------------------------------- */
WebContentProvider.prototype.receiveRequest = function (req, res) {
	let ip_allowed = mIPRest.isArrowed(req.connection.remoteAddress, this.config['allowed_address_list']);
	if (!ip_allowed) {
		res.writeHead(403, { 'Content-Type': 'text/plain' });
		res.write('403 Forbidden');
		res.end();
		return;
	}

	let path = req.url.replace(/\?.*$/, '');
	if (path.match(/[^a-zA-Z\d\_\-\.\/]/)) {
		this._response404(req.url, res);
		return;
	}
	let fpath = this.config['http_server_document_root'] + path;
	fpath = mPath.normalize(fpath);

	// Check if the file path is in the document root
	if (fpath.indexOf(this.config['http_server_document_root']) !== 0) {
		this._response404(req.url, res);
		return;
	}

	// Check whther the target of the file path is a file or a directory
	this._determineFileTarget([fpath], (target_fpath) => {
		mFs.readFile(target_fpath, (err, data) => {
			if (err) {
				this._response404(req.url, res);
			} else {
				let ctype = this._getContentType(target_fpath);
				res.writeHead(200, { 'Content-Type': ctype });
				res.write(data);
				res.end();
			}
		});
	});
};

WebContentProvider.prototype._fileExists = function (path) {
	let flag = false;
	try {
		mFs.statSync(path);
		flag = true;
	} catch (e) {
	}
	return flag;
};

WebContentProvider.prototype._determineFileTarget = function (fpath_list, callback) {
	let fpath = fpath_list.shift();
	if (!fpath) {
		callback('');
		return;
	}
	mFs.stat(fpath, (err, stats) => {
		if (err) {
			if (fpath_list.length > 0) {
				this._determineFileTarget(fpath_list, callback);
			} else {
				callback('');
			}
		} else if (stats.isFile()) {
			callback(fpath);
		} else if (stats.isDirectory()) {
			this.directory_index.forEach((f) => {
				let new_fpath = mPath.normalize(mPath.join(fpath, f));
				fpath_list.unshift(new_fpath);
			});
			this._determineFileTarget(fpath_list, callback);
		}
	});
};

WebContentProvider.prototype._getContentType = function (fpath) {
	let ext = fpath.split('.').pop().toLowerCase();
	let ctype = this.ext_mime_type_map[ext];
	if (!ctype) {
		ctype = 'application/octet-stream';
	}
	return ctype;
}

WebContentProvider.prototype._response404 = function (url, res) {
	res.writeHead(404, { 'Content-Type': 'text/plain' });
	res.write('404 Not Found: ' + url);
	res.end();
}

module.exports = WebContentProvider;