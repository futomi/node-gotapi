/* ------------------------------------------------------------------
* node-gotapi - gotapi-plugin-loader.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2017-01-08
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mPath = require('path');
const mConsole = require('./console-util.js');
const mMessageChannel = require('./mesage-channels.js');
const mPluginUtil = require('./gotapi-plugin-util.js');

/* ------------------------------------------------------------------
* Constructor: GotapiPluginLoader()
* ---------------------------------------------------------------- */
const GotapiPluginLoader = function(config) {
	this.plugin_root_path = config.plugin_root_path;
	this.plugins = {};
};

/* ------------------------------------------------------------------
* Method: load()
* ---------------------------------------------------------------- */
GotapiPluginLoader.prototype.load = function(callback) {
	this.plugins = {};
	// Get the node module search paths
	let module_search_path_list = [];
	if(this.plugin_root_path) {
		module_search_path_list.unshift(this.plugin_root_path);
	}
	module_search_path_list = module_search_path_list.concat(require.main.paths);
	module_search_path_list = module_search_path_list.concat(require("module").globalPaths);
	// Search module names for the GotAPI Plug-in
	let plugin_module_path_list = this._getPluginModulePathList(module_search_path_list);
	// Load the found modules sequentially
	this._loadPlugins(plugin_module_path_list, callback);
};

GotapiPluginLoader.prototype._loadPlugins = function(plugin_module_path_list, callback) {
	let plugin_module_path = plugin_module_path_list.shift();
	if(!plugin_module_path) {
		callback(this.plugins);
		return;
	}

	let plugin = null;
	try {
		let PlugIn = require(plugin_module_path);
		let module_info = require(mPath.join(plugin_module_path, 'package.json'));
		let message_channel = new mMessageChannel();
		let plugin_util = new mPluginUtil(message_channel.port2);
		plugin = new PlugIn(plugin_util);
		// Check if the loaded module is a GotAPI Plug-in
		if(this._isGotapiPlugin(plugin)) {
			plugin.init((info) => {
				this.plugins[plugin_module_path] = {
					id      : plugin_module_path,
					info    : info,
					channel : message_channel.port1,
					name    : module_info.name,
					version : module_info.version
				};
				this._loadPlugins(plugin_module_path_list, callback);
			});
		}
	} catch(e) {
		mConsole.error('[Plug-In ERROR] ' + plugin_module_path, e);
		delete this.plugins[plugin_module_path];
		this._loadPlugins(plugin_module_path_list, callback);
	}
};

GotapiPluginLoader.prototype._getPluginModulePathList = function(module_search_path_list) {
	let module_path_list = [];
	module_search_path_list.forEach((module_search_path) => {
		if(mFs.existsSync(module_search_path) && mFs.statSync(module_search_path).isDirectory()) {
			let entry_list = mFs.readdirSync(module_search_path);
			entry_list.forEach((name) => {
				if(name.match(/^node\-gotapi\-plugin\-([a-zA-Z].*)$/)) {
					module_path_list.push(mPath.join(module_search_path, name));
				}
			});
		}
	});
	return module_path_list;
};

GotapiPluginLoader.prototype._isGotapiPlugin = function(o) {
	if(typeof(o) !== 'object') {
		return false;
	}
	let flag = true;
	let method_name_list = ['init'];
	for(let i=0; i<method_name_list.length; i++) {
		let method_name = method_name_list[i];
		if(!(o[method_name] && typeof(o[method_name]) === 'function')) {
			flag = false;
			break;
		}
	}
	return flag;
};

module.exports = GotapiPluginLoader;
