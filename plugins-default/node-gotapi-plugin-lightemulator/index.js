/* ------------------------------------------------------------------
* node-gotapi - node-gotapi-plugin-lightemulator/index.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2016-01-04
* ---------------------------------------------------------------- */
'use strict';

let GotapiPlugin = function(util) {
  this.util = util;
  this.info = {
    name: 'Light Emulator',
    services: [
      {
        serviceId : 'com.github.futomi.lightemulator.light',
        name      : 'Light',
        online    : true,
        scopes    : ['light']
      }
    ]
  };
  this.configurations = {
    '1': {name: '1', color: '#ffffff', brightness: 1.0, flashing: 0, power: false}, 
    '2': {name: '1', color: '#ffffff', brightness: 1.0, flashing: 0, power: false}, 
    '3': {name: '1', color: '#ffffff', brightness: 1.0, flashing: 0, power: false} 
  };
};

GotapiPlugin.prototype.init = function(callback) {
  this.util.init(this.info);
  this.util.onmessage = this.receiveMessage.bind(this);
  callback(this.info);
};

GotapiPlugin.prototype.receiveMessage = function(message) {
  if(message['profile'] === 'light') {
    this.handleLight(message);
  } else {
    message['result'] = 400;
    message['errorMessage'] = 'Unknow profile was requested.';
    this.util.returnMessage(message);
  }
};

GotapiPlugin.prototype.handleLight = function(message) {
  if(message['method'] === 'post') {
    this.turnOn(message);
  } else if(message['method'] === 'put') {
    this.setConfigurations(message);
  } else if(message['method'] === 'delete') {
    this.turnOff(message);
  } else {
    this.returnError(message, 400, 'The HTTP Method `' + message['method'] + '` is not supported.');
  }
};

GotapiPlugin.prototype.setConfigurations = function(message) {
  let c = this.saveConfigurations(message);
  if(c) {
    console.log('[Light Emulator] Set the configurations: ' + JSON.stringify(c));
    this.returnSuccess(message);
  } else {
    this.returnError(message, 400, 'The specified lightId is unknown.');
  }
};

GotapiPlugin.prototype.saveConfigurations = function(message) {
  let lightId = message['params']['lightId'];
  let c = this.configurations[lightId];
  if(lightId in this.configurations) {
    this.configurations[lightId] = {
      lightId    : lightId,
      name       : message['params']['name'],
      color      : message['params']['color'],
      brightness : message['params']['brightness'],
      flashing   : message['params']['flashing'],
      power      : c['power']
    };
    return this.configurations[lightId];
  } else {
    return null;
  }
};

GotapiPlugin.prototype.turnOn = function(message) {
  let lightId = message['params']['lightId'];
  let c = this.saveConfigurations(message);
  if(c) {
    c['power'] = true;
    console.log('[Light Emulator] Turned on the light-' + lightId + ': ' + JSON.stringify(c));
    this.returnSuccess(message);
  } else {
    this.returnError(message, 400, 'The specified lightId is unknown.');
  }
};

GotapiPlugin.prototype.turnOff = function(message) {
  let lightId = message['params']['lightId'];
  let c = this.configurations[lightId];
  if(c) {
    c['power'] = false;
    console.log('[Light Emulator] Turned off the light-' + lightId + ': ' + JSON.stringify(c));
    this.returnSuccess(message);
  } else {
    this.returnError(message, 400, 'The specified lightId is unknown.');
  }
};

GotapiPlugin.prototype.returnSuccess = function(message) {
  message['result'] = 0;
  message['data'] = null;
  this.util.returnMessage(message);
};

GotapiPlugin.prototype.returnError = function(message, code, err) {
  message['result'] = code;
  message['data'] = null;
  message['errorMessage'] = err;
  this.util.returnMessage(message);
};

module.exports = GotapiPlugin;