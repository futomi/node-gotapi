(function() {

$(document).ready(function() {
	(new OnvifManager()).init();
});

/*-------------------------------------------------------------------
* Constructor
* ---------------------------------------------------------------- */
function OnvifManager() {
	this.ws = null; // WebSocket object
	this.el = { // jQuery objects for the HTML elements
		'frm_con' : $('#connect-form'),
		'sel_dev' : $('#connect-form select[name="device"]'),
		'dcv_btn' : $('#connect-form button[name="discover"]'),
		'inp_usr' : $('#connect-form input[name="user"]'),
		'inp_pas' : $('#connect-form input[name="pass"]'),
		'btn_con' : $('#connect-form button[name="connect"]'),
		'div_pnl' : $('#connected-device'),
		'img_snp' : $('#connected-device img.snapshot'),
		'btn_dcn' : $('#connected-device button[name="disconnect"]'),
		'mdl_msg' : $('#message-modal'),
		'ptz_spd' : $('input[name="ptz-speed"]'),
		'btn_hme' : $('#connected-device button.ptz-goto-home'),
		'ptz_pad' : $('#connected-device div.ptz-pad-box'),
		'zom_in'  : $('#connected-device div.ptz-zom-ctl-box button.ptz-zom-in'),
		'zom_out' : $('#connected-device div.ptz-zom-ctl-box button.ptz-zom-ot'),
	};
	this.selected_address = '';
	this.device_connected = false;
	this.ptz_moving = false;
	this.snapshot_w = 400;
	this.snapshot_h = 300;
	this.gotapi = new GotapiClient();
}

OnvifManager.prototype.init = function() {
	this.connectGotapiServer();
	$(window).on('resize', this.adjustSize.bind(this));
	this.el['dcv_btn'].on('click', this.startDiscovery.bind(this));
	this.el['btn_con'].on('click', this.pressedConnectButton.bind(this));
	this.el['btn_dcn'].on('click', this.pressedConnectButton.bind(this));
	$(document.body).on('keydown', this.ptzMove.bind(this));
	$(document.body).on('keyup', this.ptzStop.bind(this));
	this.el['btn_hme'].on('click', this.ptzGotoHome.bind(this));
	this.el['btn_hme'].on('touchstart', this.ptzGotoHome.bind(this));
	this.el['btn_hme'].on('touchend', this.ptzGotoHome.bind(this));
	this.el['ptz_pad'].on('mousedown', this.ptzMove.bind(this));
	this.el['ptz_pad'].on('mouseup', this.ptzStop.bind(this));
	this.el['ptz_pad'].on('touchstart', this.ptzMove.bind(this));
	this.el['ptz_pad'].on('touchend', this.ptzStop.bind(this));
	this.el['zom_in'].on('mousedown', this.ptzMove.bind(this));
	this.el['zom_in'].on('mouseup', this.ptzStop.bind(this));
	this.el['zom_in'].on('touchstart', this.ptzMove.bind(this));
	this.el['zom_in'].on('touchend', this.ptzStop.bind(this));
	this.el['zom_out'].on('mousedown', this.ptzMove.bind(this));
	this.el['zom_out'].on('mouseup', this.ptzStop.bind(this));
	this.el['zom_out'].on('touchstart', this.ptzMove.bind(this));
	this.el['zom_out'].on('touchend', this.ptzStop.bind(this));
};

OnvifManager.prototype.connectGotapiServer = function() {
	this.el['sel_dev'].empty();
	this.el['sel_dev'].append($('<option>now searching...</option>'));
	this.gotapi.connect().then((services) => {
		this.showDeviceList(services);
	}).catch((error) => {
		this.showMessageModal('Error', 'Failed to establish a connection with the GotAPI Server: ' + error.message);
	});
};

OnvifManager.prototype.startDiscovery = function() {
	this.el['sel_dev'].empty();
	this.el['sel_dev'].append($('<option>now searching...</option>'));
	this.gotapi.requestServiceDiscovery().then((services) => {
		this.showDeviceList(services);
	}).catch((error) => {
		this.showMessageModal('Error', 'The service discovery process failed: ' + error.message);
	})
};

OnvifManager.prototype.showDeviceList = function(services) {
	this.el['sel_dev'].empty();
	//this.el['sel_dev'].append($('<option>Select a device</option>'));
	let devices = {};
	for(let i=0; i<services.length; i++) {
		let s = services[i];
		let sid = s['serviceId'];
		if(sid.match(/^com\.github\.futomi\.onvif/)) {
			devices[sid] = s;
		}
	}
	let n = 0;
	for(let id in devices) {
		let device = devices[id];
		let option_el = $('<option></option>');
		option_el.val(id);
		option_el.text(device.name);
		this.el['sel_dev'].append(option_el);
		n ++;
	}
	this.disabledLoginForm(false);
	if(Object.keys(devices).length === 0) {
		this.el['btn_con'].prop('disabled', true);
	}
};

OnvifManager.prototype.adjustSize = function() {
	let div_dom_el = this.el['div_pnl'].get(0);
	let rect = div_dom_el.getBoundingClientRect() ;
	let x = rect.left + window.pageXOffset;
	let y = rect.top + window.pageYOffset;
	let w = rect.width;
	let h = window.innerHeight - y - 10;
	div_dom_el.style.height = h + 'px';
	let aspect_ratio = w / h;
	let snapshot_aspect_ratio = this.snapshot_w / this.snapshot_h;
	let img_dom_el = this.el['img_snp'].get(0);

	if(snapshot_aspect_ratio > aspect_ratio) {
		img_w = w;
		img_h = (w / snapshot_aspect_ratio);
		img_dom_el.style.width = img_w + 'px';
		img_dom_el.style.height = img_h + 'px';
		img_dom_el.style.left = '0px';
		img_dom_el.style.top = ((h - img_h) / 2) + 'px';
	} else {
		img_h = h;
		img_w = (h * snapshot_aspect_ratio);
		img_dom_el.style.height = img_h + 'px';
		img_dom_el.style.width = img_w + 'px';
		img_dom_el.style.left = ((w - img_w) / 2) + 'px';
		img_dom_el.style.top = '0px';
	}
};

OnvifManager.prototype.pressedConnectButton = function(event) {
	if(this.device_connected === true) {
		this.disconnectDevice();
	} else {
		this.connectDevice();
	}
};

OnvifManager.prototype.disconnectDevice = function() {
	this.el['img_snp'].removeAttr('src');
	this.el['div_pnl'].hide();
	this.el['frm_con'].show();
	this.device_connected = false;
	this.disabledLoginForm(false);
	this.el['btn_con'].text('Connect');
};

OnvifManager.prototype.connectDevice = function() {
	this.disabledLoginForm(true);
	this.el['btn_con'].text('Connecting...');
	let p = {
		method: 'get',
		serviceId: this.el['sel_dev'].val(),
		profile: 'onvif',
		attribute: 'userAuth',
		user: this.el['inp_usr'].val(),
		pass: this.el['inp_pas'].val()
	};
	this.gotapi.request(p).then((res) => {
		this.el['btn_con'].prop('disabled', false);
		this.selected_address = this.el['sel_dev'].val();
		this.showConnectedDeviceInfo(res['data']);
		this.el['btn_con'].text('Disconnect');
		this.el['frm_con'].hide();
		this.el['div_pnl'].show();
		this.device_connected = true;
	}).catch((error) => {
		this.el['btn_con'].prop('disabled', false);
		this.el['div_pnl'].hide();
		this.el['sel_dev'].prop('disabled', false);
		this.el['inp_usr'].prop('disabled', false);
		this.el['inp_pas'].prop('disabled', false);
		this.el['btn_con'].text('Connect');
		this.el['frm_con'].show();
		this.showMessageModal('Error', 'Failed to connect to the device.' + error.message);
		this.device_connected = false;
	});
};

OnvifManager.prototype.disabledLoginForm = function(disabled) {
	this.el['sel_dev'].prop('disabled', disabled);
	this.el['inp_usr'].prop('disabled', disabled);
	this.el['inp_pas'].prop('disabled', disabled);
	this.el['btn_con'].prop('disabled', disabled);
};

OnvifManager.prototype.showMessageModal = function(title, message) {
	this.el['mdl_msg'].find('.modal-title').text(title);
	this.el['mdl_msg'].find('.modal-message').text(message);
	this.el['mdl_msg'].modal('show');
};

OnvifManager.prototype.showConnectedDeviceInfo = function(data) {
	this.el['div_pnl'].find('span.name').text(data['Manufacturer'] + ' ' + data['Model']);
	this.fetchSnapshot();
};

OnvifManager.prototype.fetchSnapshot = function() {
	let p = {
		method: 'get',
		serviceId: this.selected_address,
		profile: 'onvif',
		attribute: 'fetchSnapshot'
	};
	this.gotapi.request(p).then((res) => {
		this.el['img_snp'].attr('src', res.data);
		return this.promiseWait(10);
	}).then(() => {
		this.snapshot_w = this.el['img_snp'].get(0).naturalWidth;
		this.snapshot_h = this.el['img_snp'].get(0).naturalHeight;
		this.adjustSize();
		if(this.device_connected === true) {
			this.fetchSnapshot();
		}
	}).catch((error) => {
		console.dir(error);
	});
};

OnvifManager.prototype.promiseWait = function(ms) {
	return new Promise((resolve, reject) => {
		window.setTimeout(() => {
			resolve();
		}, ms);
	});
};

OnvifManager.prototype.ptzGotoHome = function(event) {
	if(event.type === 'touchstart') {
		return;
	}
	if(this.device_connected === false || this.ptz_moving === true) {
		return;
	}
	this.ptz_moving = true;
	if(!this.selected_address) {
		return;
	}
	let p = {
		method: 'get',
		serviceId: this.selected_address,
		profile: 'onvif',
		attribute: 'ptzGotoHome'
	};
	this.gotapi.request(p).then((res) => {
		
	}).catch((error) => {
		console.dir(error);
	});
	event.preventDefault();
	event.stopPropagation();
};

OnvifManager.prototype.ptzMove = function(event) {
	if(this.device_connected === false || this.ptz_moving === true) {
		return;
	}
	this.ptz_moving = true;
	let pos = {x: 0, y: 0, z: 0};
	let speed = 1.0;

	if(event.type === 'keydown') {
		this.el['ptz_spd'].each(function(index, el) {
			if($(el).prop('checked') === true) {
				speed = parseFloat($(el).val());
			}
		}.bind(this));
		let c = event.keyCode;
		let s = event.shiftKey;
		if(c === 38) { // Up
			pos.y = speed;
		} else if(c === 40) { // Down
			pos.y = 0 - speed;
		} else if(c === 37) { // Left
			pos.x = 0 - speed;
		} else if(c === 39) { // Right
			pos.x = speed;
		} else if((c === 107) || c === 187) { // Zoom in
			pos.z = speed;
		} else if(c === 109 || c === 189) { // Zoom out
			pos.z = 0 - speed;
		} else {
			return;
		}
	} else if(event.type.match(/^(mousedown|touchstart)$/)) {
		if(event.currentTarget.classList.contains('ptz-pad-box')) {
			let rect = event.currentTarget.getBoundingClientRect();
			let cx = event.clientX;
			let cy = event.clientY;
			if(event.type === 'touchstart') {
				if(event.targetTouches[0]) {
					cx = event.targetTouches[0].clientX;
					cy = event.targetTouches[0].clientY;
				} else if(event.changedTouches[0]) {
					cx = event.changedTouches[0].clientX;
					cy = event.changedTouches[0].clientY;
				}
			}
			let mx = cx - rect.left;
			let my = cy - rect.top;
			let w = rect.width;
			let h = rect.height;
			let r = Math.max(w, h) / 2;
			let x = mx - r;
			let y = r - my;
			let d = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) / r;
			let rad = Math.atan2(y, x);
			pos.x = d * Math.cos(rad);
			pos.y = d * Math.sin(rad);
		} else if(event.currentTarget.classList.contains('ptz-zom')) {
			if(event.currentTarget.classList.contains('ptz-zom-ot')) {
				pos.z = -1.0;
			} else if(event.currentTarget.classList.contains('ptz-zom-in')) {
				pos.z = 1.0;
			} else {
				return;
			}
		} else {
			return;
		}
	} else {
		return;
	}

	let p = {
		method: 'get',
		serviceId: this.selected_address,
		profile: 'onvif',
		attribute: 'ptzMove',
		x: pos.x,
		y: pos.y,
		z: pos.z
	};
	this.gotapi.request(p).then((res) => {

	}).catch((error) => {
		console.dir(error);
	});
	event.preventDefault();
	event.stopPropagation();
};

OnvifManager.prototype.ptzStop = function(event) {
	if(!this.selected_address) {
		return;
	}
	let p = {
		method: 'get',
		serviceId: this.selected_address,
		profile: 'onvif',
		attribute: 'ptzStop'
	};
	this.gotapi.request(p).then((res) => {
		this.ptz_moving = false;
	}).catch((error) => {
		console.dir(error);
	});
};

})();
