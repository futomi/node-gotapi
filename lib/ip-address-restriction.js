/* ------------------------------------------------------------------
* node-gotapi - ip-address-restriction.js
*
* Copyright (c) 2017-2018, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2018-12-24
* ---------------------------------------------------------------- */
'use strict';

let IpAddressRestriction = function () { };

IpAddressRestriction.prototype.isArrowed = function (remote_addr, allowed_addr_list) {
	if (!remote_addr) {
		return false;
	}
	if (remote_addr === '::1') {
		return true;
	}
	remote_addr = remote_addr.replace(/^\:\:ffff\:/, '');
	if (remote_addr === '127.0.0.1') {
		return true;
	}
	if (!allowed_addr_list || !Array.isArray(allowed_addr_list) || allowed_addr_list.length === 0) {
		return false;
	}

	if (/\./.test(remote_addr)) {
		let allowed_addr_list4 = [];
		allowed_addr_list.forEach((addr) => {
			if (/\./.test(addr)) {
				allowed_addr_list4.push(addr);
			}
		});
		if (allowed_addr_list4.length === 0) {
			return false;
		} else {
			return this._isAllowed4(remote_addr, allowed_addr_list4);
		}
	} else if (/\:/.test(remote_addr)) {
		let allowed_addr_list6 = [];
		allowed_addr_list.forEach((addr) => {
			if (/\:/.test(addr)) {
				allowed_addr_list6.push(addr);
			}
		});
		if (allowed_addr_list6.length === 0) {
			return false;
		} else {
			return this._isAllowed6(remote_addr, allowed_addr_list6);
		}
	} else {
		return false;
	}
};

IpAddressRestriction.prototype._isAllowed6 = function (remote_addr, allowed_addr_list) {
	let allowed = false;
	allowed_addr_list.forEach((addr) => {
		if(remote_addr.indexOf(addr) === 0) {
			allowed = true;
		}
	});
	return allowed;
};

IpAddressRestriction.prototype._isAllowed4 = function (remote_addr, allowed_addr_list) {
	let remote_addr_n = this._convIpToNum4(remote_addr);
	if (!remote_addr_n) {
		return false;
	}

	let allowed = false;
	allowed_addr_list.forEach((addr) => {
		if(remote_addr.indexOf(addr) === 0) {
			allowed = true;
		}
	});
	if(allowed === true) {
		return allowed;
	}

	for (let i = 0; i < allowed_addr_list.length; i++) {
		let addr = allowed_addr_list[i];
		if (addr.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
			if (remote_addr === addr) {
				allowed = true;
				break;
			}
		} else if (addr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/)) {
			let ip = RegExp.$1;
			let msk = parseInt(RegExp.$2, 10);
			if (msk < 32) {
				let addr_n = this._convIpToNum4(ip);
				if ((remote_addr_n >> (32 - msk)) === (addr_n >> (32 - msk))) {
					allowed = true;
					break;
				}
			}
		}
	}
	return allowed;
};

IpAddressRestriction.prototype._convIpToNum4 = function (addr) {
	if (typeof (addr) === 'string' && addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) {
		let ip1 = parseInt(RegExp.$1, 10);
		let ip2 = parseInt(RegExp.$2, 10);
		let ip3 = parseInt(RegExp.$3, 10);
		let ip4 = parseInt(RegExp.$4, 10);

		if (ip1 > 255 || ip2 > 255 || ip3 > 255 || ip4 > 255) {
			return 0;
		} else {
			let buf = Buffer.from([ip1, ip2, ip3, ip4]);
			return buf.readUInt32BE(0);
		}
	} else {
		return 0;
	}
};

module.exports = new IpAddressRestriction();