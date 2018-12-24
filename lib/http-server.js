/* ------------------------------------------------------------------
* node-gotapi - http-server.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-12-23
* ---------------------------------------------------------------- */
'use strict';
let mWebContentProvider = require('./web-content-provider.js');

/* ------------------------------------------------------------------
* Constructor: HttpServer(config)
* ---------------------------------------------------------------- */
let HttpServer = function(config) {
	this.config = config;
	this.web_content_provider = null;
};

/* ------------------------------------------------------------------
* Method: start()
* ---------------------------------------------------------------- */
HttpServer.prototype.start = function() {
	var promise = new Promise((resolve, reject) => {
		this.web_content_provider = new mWebContentProvider(this.config);
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
					this.web_content_provider.receiveRequest(req, res);
				});
				resolve();
			});
		} catch(error) {
			reject(error);
		}
	});
	return promise;
};

module.exports = HttpServer;