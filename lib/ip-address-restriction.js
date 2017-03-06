/* ------------------------------------------------------------------
* node-gotapi - ip-address-restriction.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-03-07
* ---------------------------------------------------------------- */
'use strict';

let IpAddressRestriction = function() {};

IpAddressRestriction.prototype.isArrowed = function(remote_addr, allowed_addr_list) {
	if(!remote_addr) {
		return false;
	}
	if(remote_addr === '::1') {
		return true;
	}
	remote_addr = remote_addr.replace(/^\:\:ffff\:/, '');
	if(remote_addr === '127.0.0.1') {
		return true;
	}
	let remote_addr_n = this._convIpToNum(remote_addr);
	if(!remote_addr_n) {
		return false;
	}

	if(!allowed_addr_list || !Array.isArray(allowed_addr_list) || allowed_addr_list.length === 0) {
		return false;
	}

	let allowed = false;
	for(let i=0; i<allowed_addr_list.length; i++) {
		let addr = allowed_addr_list[i];
		if(addr.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
			if(remote_addr === addr) {
				allowed = true;
				break;
			}
		} else if(addr.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/)) {
			let ip = RegExp.$1;
			let msk = parseInt(RegExp.$2, 10);
			if(msk < 32) {
				let addr_n = this._convIpToNum(ip);
				if((remote_addr_n >> (32 - msk)) === (addr_n >> (32 - msk))) {
					allowed = true;
					break;
				}
			}
		}
	}
	return allowed;
};

IpAddressRestriction.prototype._convIpToNum = function(addr) {
	if(typeof(addr) === 'string' && addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)) {
		let ip1 = parseInt(RegExp.$1, 10);
		let ip2 = parseInt(RegExp.$2, 10);
		let ip3 = parseInt(RegExp.$3, 10);
		let ip4 = parseInt(RegExp.$4, 10);

		if(ip1 > 255 || ip2 > 255 || ip3 > 255 || ip4 > 255) {
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