'use strict';

function GotapiMonitor(gotapi) {
	this.gotapi = gotapi;
}

GotapiMonitor.prototype.init = function() {
	gotapi.oncommunication = this.onCommunication.bind(this);
};

GotapiMonitor.prototype.onCommunication = function(message) {
	let tmpl = $.templates("#comm-tmpl");
	let html = tmpl.render({
		dir    : (message['dir'] === 1) ? '>> ' : '<< ',
		if     : message['if'],
		method : message['method'],
		url    : message['url'],
		body   : message['body']
	});
	$('#comm-monitor').append(html);
	$('#comm-monitor').animate({scrollTop: $('#comm-monitor')[0].scrollHeight}, 'fast');
};
