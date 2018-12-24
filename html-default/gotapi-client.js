/* ------------------------------------------------------------------
* node-gotapi - gotapi-client.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-12-23
* ---------------------------------------------------------------- */
'use strict';

/*-------------------------------------------------------------------
* Constructor: GotapiClient()
* ---------------------------------------------------------------- */
let GotapiClient = function() {
	let is_ssl = window.location.protocol.match(/^https/) ? true : false;
	let hostname = window.location.hostname;
	let port = is_ssl ? 4036 : 4035;
	this.if1_base_url = (is_ssl ? 'https' : 'http') + '://' + hostname + ':' + port;
	this.if5_base_url = (is_ssl ? 'wss' : 'ws') + '://' + hostname + ':' + port + '/gotapi/websocket';

	this.key = '';
	this.client_id = '';
	this.access_token = '';
	this.services = [];
	this.onmessage = null;
	this.ws = null;
	// For Debug
	this.oncommunication = null;
};

/*-------------------------------------------------------------------
* Plulic Method: disconnect()
* ---------------------------------------------------------------- */
GotapiClient.prototype.disconnect = function() {
	if(this.ws) {
		this.ws.close();
		this.ws = null;
	}
	this.key = '';
	this.client_id = '';
	this.access_token = '';
	this.services = [];
	this.onmessage = null;
	this.oncommunication = null;
};

/*-------------------------------------------------------------------
* Plulic Method: connect()
* ---------------------------------------------------------------- */
GotapiClient.prototype.connect = function() {
	let promise = new Promise((resolve, reject) => {
		if(this._prepareWebCrypto()) {
			this._requestAvailabilityApi().then((key) => {
				this.key = key;
				return this._requestAppAuthorization();
			}).then((client_id) => {
				this.client_id = client_id;
				return this._requestAccessToken();
			}).then((access_token) => {
				this.access_token = access_token;
				return this.requestServiceDiscovery();
			}).then((services) => {
				this.services = services;
				return this._establishIf5Connection();
			}).then(() => {
				resolve(this.services);
			}).catch((error) => {
				reject(error);
			});
		} else {
			reject(new Error('Your browser does not support the Web Cryptography API.'));
		}
	});
	return promise;
};

GotapiClient.prototype._prepareWebCrypto = function() {
	if(window.crypto) {
		if(!window.crypto.subtle) {
			if(window.crypto.webkitSubtle) {
				window.crypto.subtle = window.crypto.webkitSubtle;
			}
		}
	}
	return (window.crypto && window.crypto.subtle) ? true : false;
};

GotapiClient.prototype._requestAvailabilityApi = function() {
	let promise = new Promise((resolve, reject) => {
		let key = this._createRandomString();
		//let url = this.if1_base_url + '/gotapi/availability?key=' + key;
		let url = this.if1_base_url + '/gotapi/availability?' + this._createQueryString({key: key});
		this._httpRequest('GET', url).then((o) => {
			resolve(key);
		}).catch((error) => {
			reject(new Error('[AVAILABILITY ERROR] ' + error.message));
		});
	});
	return promise;
};

GotapiClient.prototype._createQueryString = function(o) {
	let pair_list = [];
	Object.keys(o).forEach((k) => {
		pair_list.push(k + '=' + encodeURIComponent(o[k]));
	});
	return pair_list.join('&');
};

GotapiClient.prototype._createRandomString = function(len) {
	if(!len) {
		len = 32;
	}
	let key_array = new Uint8Array(len);
	window.crypto.getRandomValues(key_array);
	let key_hex_list = [];
	for (let i=0; i<key_array.length; i++) {
		let hex = ('0' + key_array[i].toString(16)).slice(-2)
		key_hex_list.push(hex);
	}
	let key = key_hex_list.join('');
	return key;
};

GotapiClient.prototype._isOnCommunicationSet = function() {
	if(this.oncommunication && typeof(this.oncommunication) === 'function') {
		return true;
	} else {
		false;
	}
};

GotapiClient.prototype._httpRequest = function(method, url, data) {
	let promise = new Promise((resolve, reject) => {
		let xhr = new XMLHttpRequest();
		xhr.onload = () => {
			let o = xhr.response;
			if(this._isOnCommunicationSet()) {
				this.oncommunication({if:1, dir:2, body:JSON.stringify(o)});
			}
			if(xhr.status >= 200 && xhr.status < 300) {
				resolve(o);
			} else if(o && o.result !== 0) {
				let e = new Error(xhr.status + ' ' + xhr.statusText + ' (' + o.errorMessage + ')');
				for(let k in o) {
					if(!(k in e)) {
						e[k] = o[k];
					}
				}
				reject(e);
			} else {
				reject(new Error(xhr.status + ' ' + xhr.statusText));
			}
		};
		xhr.onerror = (error) => {
			reject(new Error('HTTP connection was refused.'));
		};
		xhr.open(method, url);
		if(data) {
			xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		}
		xhr.responseType = 'json';
		xhr.send(data);
		if(this._isOnCommunicationSet()) {
			this.oncommunication({if:1, dir:1, method:method, url: url});
		}
	});
	return promise;
};

/*-------------------------------------------------------------------
* Request application authorization (Grant)
* ---------------------------------------------------------------- */
GotapiClient.prototype._requestAppAuthorization = function() {
	let promise = new Promise((resolve, reject) => {
		let nonce = this._createRandomString();
		//let url = this.if1_base_url + '/gotapi/authorization/grant?nonce=' + nonce;
		let url = this.if1_base_url + '/gotapi/authorization/grant?' + this._createQueryString({nonce: nonce});
		let res = null;
		this._httpRequest('GET', url).then((o) => {
			res = o;
			return this._generateHmac(this.key, nonce);
		}).then((hmac) => {
			if(res.hmac === hmac) {
				resolve(res.clientId);
			} else {
				reject(new Error('[AUTH ERROR] The response is not trusted.'));
			}
		}).catch((error) => {
			reject(new Error('[AUTH ERROR] ' + error.message));
		});
	});
	return promise;
};

GotapiClient.prototype._generateHmac = function(key, nonce) {
	let promise = new Promise((resolve, reject) => {
		let key_buf = this._createArrayBufferFromString(key);
		let nonce_buf = this._createArrayBufferFromString(nonce);
		window.crypto.subtle.importKey(
			'raw', key_buf, {name:'HMAC', hash:{name:'SHA-256'}}, true, ['sign', 'verify']
		).then((key_obj) => {
			return window.crypto.subtle.sign({name:'HMAC', hash:{name:'SHA-256'}}, key_obj, nonce_buf);
		}).then((signature) => {
			let view = new Uint8Array(signature);
			let len = signature.byteLength;
			let hmac = '';
			for(let i=0; i<len; i++) {
				let v = view[i].toString(16);
				hmac += ('0' + v).slice(-2);
			}
			resolve(hmac);
		}).catch((e) => {
			reject(e);
		});
	});
	return promise;
};

GotapiClient.prototype._createArrayBufferFromString = function(string) {
	let len = string.length;
	let view = new Uint8Array(len);
	for(let i=0; i<len; i++) {
		view[i] = string.codePointAt(i);
	}
	return view.buffer;
}

/*-------------------------------------------------------------------
* Request Access Token
* ---------------------------------------------------------------- */
GotapiClient.prototype._requestAccessToken = function() {
	let promise = new Promise((resolve, reject) => {
		let nonce = this._createRandomString();
		//let url = this.if1_base_url + '/gotapi/authorization/accesstoken?clientId=' + this.client_id + '&scope=all&nonce=' + nonce;

		// The url parameter `scope` is a dummy parameter here.
		// Though the GotAPI spec defines the `scope` parameter,
		// it is not necessary for the node-gotapi because it is
		// not suitable for likely use cases of the node-gotapi.
		// The `scope` is designed for smartphone users to permit
		// an app to use the scope (functions) which the app want
		// to use.

		let url = this.if1_base_url + '/gotapi/authorization/accesstoken?';
		url += this._createQueryString({
			clientId : this.client_id,
			scope    : 'all',
			nonce    : nonce
		});
		let res = null;
		this._httpRequest('GET', url).then((o) => {
			res = o;
			return this._generateHmac(this.key, nonce);
		}).then((hmac) => {
			if(res.hmac === hmac) {
				resolve(res.accessToken);
			} else {
				reject(new Error('[TOKEN ERROR] The response is not trusted.'));
			}
		}).catch((error) => {
			reject(new Error('[TOKEN ERROR] ' + error.message));
		});
	});
	return promise;
};

/*-------------------------------------------------------------------
* Request Service Discovery
* ---------------------------------------------------------------- */
/*-------------------------------------------------------------------
* Plulic Method: requestServiceDiscovery()
* ---------------------------------------------------------------- */
GotapiClient.prototype.requestServiceDiscovery = function() {
	let promise = new Promise((resolve, reject) => {
		let nonce = this._createRandomString();
		let url = this.if1_base_url + '/gotapi/servicediscovery?';
		url += this._createQueryString({
			accessToken : this.access_token,
			nonce       : nonce
		});
		let res = null;
		this._httpRequest('GET', url).then((o) => {
			res = o;
			return this._generateHmac(this.key, nonce);
		}).then((hmac) => {
			if(res.hmac === hmac) {
				resolve(res.services);
			} else {
				reject(new Error('[DISCOVERY ERROR] The response is not trusted.'));
			}
		}).catch((error) => {
			reject(new Error('[DISCOVERY ERROR] ' + error.message));
		});
	});
	return promise;
};

/*-------------------------------------------------------------------
* Establish a WebSocket connection
* ---------------------------------------------------------------- */
GotapiClient.prototype._establishIf5Connection = function() {
	let promise = new Promise((resolve, reject) => {
		let ws = new WebSocket(this.if5_base_url);
		ws.onopen = () => {
			let data = JSON.stringify({
				accessToken: this.access_token
			});
			ws.send(data);
			if(this._isOnCommunicationSet()) {
				this.oncommunication({if:5, dir:1, body:data});
			}
		};
		ws.onclose = (event) => {
			//
		};
		ws.onerror = (error) => {
			reject(new Error('Failed to establish a WebSocket connection.'));
		};
		ws.onmessage = (res) => {
			resolve();
			ws.onmessage = (res) => {
				if(this.onmessage && typeof(this.onmessage) === 'function') {
					let o = null;
					try {
						o = JSON.parse(res.data);
					} catch(e) {}
					if(o) {
						if(o['result'] === 0) {
							this.onmessage(o);
						} else {
							let e = new Error(o['errorCode'] + ' ' + o['errorText'] + ' (' + o['errorMessage'] + ')');
							for(let k in o) {
								if(!(k in e)) {
									e[k] = o[k];
								}
							}
							this.onmessage(e);
						}
					} else {
						var error_message = '500 Internal Server Error (JSON parse error.)';
						let e = new Error(error_message);
						e['result'] = 500;
						e['errorCode'] = 500;
						e['errorText'] = 'Internal Server Error';
						e['errorMessage'] = error_message;
						this.onmessage(e);
					}
				}
				if(this._isOnCommunicationSet()) {
					this.oncommunication({if:5, dir:2, body:res.data});
				}
			};
		};
		this.ws = ws;
	});
	return promise;
};

/*-------------------------------------------------------------------
* Plulic Method: request(params)
* ---------------------------------------------------------------- */
GotapiClient.prototype.request = function(params) {
	let promise = new Promise((resolve, reject) => {
		let error = this._checkArgumentsForRequest(params);
		if(error) {
			reject(new Error(error));
		}

		let nonce = this._createRandomString();
		let url = this.if1_base_url + '/gotapi/';
		url += params['profile'] + '/' + params['attribute'];

		let q = {
			accessToken : this.access_token,
			nonce       : nonce
		};

		for(let k in params) {
			if(!k.match(/^(profile|attribute|method)$/)) {
				q[k] = params[k];
			}
		}

		let qstring = this._createQueryString(q);

		let method = params['method'].toLowerCase();
		let data = null;
		if(method === 'post' || method === 'put') {
			data = qstring;
		} else {
			if(q) {
				url += '?' + qstring;
			}
		}

		let res = null;
		this._httpRequest(params['method'], url, data).then((o) => {
			res = o;
			return this._generateHmac(this.key, nonce);
		}).then((hmac) => {
			if(res.hmac === hmac) {
				resolve(res);
			} else {
				reject(new Error('[AUTH ERROR] The response is not trusted.'));
			}
		}).catch((error) => {
			reject(error);
		});
	});
	return promise;
};

GotapiClient.prototype._checkArgumentsForRequest = function(params) {
	if(!params) {
		return 'The argument `params` is required.';
	} else if(typeof(params) !== 'object') {
		return 'The argument `params` must be an Object object.';
	}
	let method = params['method'];
	if(!method) {
		return 'The property `method` is required.';
	} else if(typeof(method) !== 'string' || !method.match(/^(get|post|put|delete)$/i)) {
		return 'The value of the property `method` is invalid.';
	}

	let profile = params['profile'];
	if(!profile) {
		return 'The property `profile` is required.';
	} else if(typeof(profile) !== 'string' || profile.match(/[^a-zA-Z0-9\-\_\.]/)) {
		return 'The value of the property `profile` is invalid.';
	}

	let attribute = params['attribute'];
	if(attribute) {
		if(typeof(attribute) !== 'string' || attribute.match(/[^a-zA-Z0-9\-\_\.]/)) {
			return 'The value of the property `attribute` is invalid.';
		}
	}

	let service_id = params['serviceId'];
	if(!service_id) {
		return 'The property `serviceId` is required.';
	} else if(typeof(service_id) !== 'string' || service_id.match(/[^a-zA-Z0-9\-\_\.\:\*\+]/)) {
		return 'The value of the property `serviceId` is invalid.';
	}

	for(let k in params) {
		let v = params[k];
		if(!k.match(/^[^\d][a-zA-Z0-9\-\_]*/)) {
			return 'The property name in the `params` is invalid.';
		}
	}

	return '';
}
