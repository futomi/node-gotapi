/* ------------------------------------------------------------------
* node-gotapi - node-gotapi-plugin-onvif/index.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-03
* ---------------------------------------------------------------- */
'use strict';

/* ------------------------------------------------------------------
* Constructor
*   The name of the constructor must be add the prefix `GotapiPlugin`.
* ---------------------------------------------------------------- */
let GotapiPlugin = function(util) {
	this.util = util;
	this.info = {
		name: 'ONVIF Network Camera',
		services: []
	};
	this.ticktack_timer_id = 0;
	this.onvif = require('node-onvif');
	this.devices = {};
	this.services = [];
	this.last_request_time = 0;

	this.service_tmpl = {
		serviceId   : 'com.github.futomi.onvif',
		name        : 'ONVIF Network Camera',
		online      : true,
		scopes      : ['onvif'],
		manufacturer: '',
		version     : '0.0.1',
		type        : ''
	};
};

/* ------------------------------------------------------------------
* Method: init(callback)
*   This method initializes this module, called when the GotAPI
*   Server loads this module.
* ---------------------------------------------------------------- */
GotapiPlugin.prototype.init = function(callback) {
	this.util.init(this.info);
	this.util.onservicediscoverry = this._serviceDiscovery.bind(this);
	this.util.onmessage = this._receiveMessage.bind(this);
	this._startDiscoveryBackground();
	callback(this.info);
};

GotapiPlugin.prototype._startDiscoveryBackground = function() {
	var now = Date.now();
	var t = 60000 - (now - this.last_request_time);
	if(t > 0) {
		setTimeout(this._startDiscoveryBackground.bind(this), t);
		return;
	}
	let devices = {};
	this.onvif.startDiscovery((info) => {
		let service = JSON.parse(JSON.stringify(this.service_tmpl));
		service.serviceId = service.serviceId + '.' + info.urn;
		service.name = info.name;
		devices[service.serviceId] = {
			discovery  : info, // The information from the service discovery
			information: null, // The information from the getInformation command
			onvifDevice: null, // The OnvifDevice object of the node-onvif
			service    : service
		};
	});
	setTimeout(() => {
		this.devices = devices;
		this.onvif.stopDiscovery(() => {
			let service_list = [];
			for(let id in this.devices) {
				service_list.push(this.devices[id]['service']);
			}
			this.info.services = service_list;
		});
		setTimeout(this._startDiscoveryBackground.bind(this), 60000);
	}, 5000);

};

GotapiPlugin.prototype._serviceDiscovery = function(message) {
	message['services'] = JSON.parse(JSON.stringify(this.info.services));
	this.util.returnServiceDiscovery(message);
};

GotapiPlugin.prototype._receiveMessage = function(message) {
	if(message.profile === 'onvif') {
		if(message.attribute === 'userAuth') {
			this.userAuth(message);
		} else if(message.attribute === 'fetchSnapshot') {
			this.fetchSnapshot(message);
		} else if(message.attribute === 'ptzMove') {
			this.ptzMove(message);
		} else if(message.attribute === 'ptzStop') {
			this.ptzStop(message);
		} else if(message.attribute === 'ptzGotoHome') {
			this.ptzGotoHome(message);
		} else {
			this.returnError(message['requestCode'], 501, 'The specified attribute `' + message.attribute + '` is unknown.');
		}
		this.last_request_time = Date.now();
	} else {
		this.returnError(message['requestCode'], 501, 'The specified profile `' + message.profile + '` is unknown.');
	}
};

GotapiPlugin.prototype.userAuth = function(message) {
	let sid = message['params']['serviceId'];
	let dev = this.devices[sid];
	if(!dev) {
		this.returnError(message['requestCode'], 404, 'The specified serviceId is not found.');
		return;
	}
	let user = message['params']['user'];
	let pass = message['params']['pass'];
	dev['onvifDevice'] = new this.onvif.OnvifDevice({
		xaddr: dev['discovery']['xaddrs'][0],
		user : user,
		pass : pass
	});
	dev['onvifDevice'].init((e) => {
		if(e) {
			this.returnError(message['requestCode'], 401, 'The specified NVT denied the user.');
		} else {
			dev['information'] = dev['onvifDevice'].getInformation();
			this.returnSuccess(message['requestCode'], JSON.parse(JSON.stringify(dev['information'])));
		}
	});
};

GotapiPlugin.prototype.fetchSnapshot = function(message) {
	let sid = message['params']['serviceId'];
	let dev = this.devices[sid];
	if(!dev) {
		this.returnError(message['requestCode'], 404, 'The specified serviceId is not found.');
		return;
	}
	dev['onvifDevice'].fetchSnapshot((e, res) => {
		if(e) {
			this.returnError(message['requestCode'], 401, 'The specified NVT denied the user.');
		} else {
			let ct = res['headers']['content-type'];
			let buffer = res['body'];
			let b64 = buffer.toString('base64');
			let uri = 'data:' + ct + ';base64,' + b64;
			this.returnSuccess(message['requestCode'], uri);
		}
	});
};

GotapiPlugin.prototype.ptzMove = function(message) {
	let sid = message['params']['serviceId'];
	let dev = this.devices[sid];
	if(!dev) {
		this.returnError(message['requestCode'], 404, 'The specified serviceId is not found.');
		return;
	}
	let speed = {x: 0, y: 0, z: 0};
	['x', 'y', 'z'].forEach((k) => {
		let v = message['params'][k];
		if(typeof(v) === 'string' && v.match(/^[\d\.\-]+$/)) {
			speed[k] = parseFloat(v);
		}
	});
	let p = {
		speed: speed,
		timeout: 30
	};

	dev['onvifDevice'].ptzMove(p, (e) => {
		if(e) {
			this.returnError(message['requestCode'], 401, 'The specified NVT denied the user.');
		} else {
			this.returnSuccess(message['requestCode'], null);
		}
	});
};

GotapiPlugin.prototype.ptzStop = function(message) {
	let sid = message['params']['serviceId'];
	let dev = this.devices[sid];
	if(!dev) {
		this.returnError(message['requestCode'], 404, 'The specified serviceId is not found.');
		return;
	}
	dev['onvifDevice'].ptzStop((e) => {
		if(e) {
			this.returnError(message['requestCode'], 401, 'The specified NVT denied the user.');
		} else {
			this.returnSuccess(message['requestCode'], null);
		}
	});
};

GotapiPlugin.prototype.ptzGotoHome = function(message) {
	let sid = message['params']['serviceId'];
	let dev = this.devices[sid];
	if(!dev) {
		this.returnError(message['requestCode'], 404, 'The specified serviceId is not found.');
		return;
	}
	let ptz = dev['onvifDevice'].services.ptz;
	if(!ptz) {
		this.returnError(message['requestCode'], 501, 'The specified NVT does not support PTZ.');
		return;
	}
	let profile = dev['onvifDevice'].getCurrentProfile();
	let params = {
		'ProfileToken': profile['token'],
		'Speed'       : 1
	};
	ptz.gotoHomePosition(params, (e, res) => {
		if(e) {
			this.returnError(message['requestCode'], 401, 'The specified NVT denied the user.');
		} else if(res) {
			this.returnSuccess(message['requestCode'], null);
		}
	});
};


GotapiPlugin.prototype.returnSuccess = function(request_code, data) {
	this.util.returnMessage({
		requestCode  : request_code,
		result       : 0,
		data         : data
	});
};

GotapiPlugin.prototype.returnError = function(request_code, result, error_message) {
	this.util.returnMessage({
		requestCode  : request_code,
		result       : result,
		data         : null,
		errorMessage : error_message
	});
};

module.exports = GotapiPlugin;