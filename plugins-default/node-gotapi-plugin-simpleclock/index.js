/* ------------------------------------------------------------------
* node-gotapi - node-gotapi-plugin-simpleclock/index.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2016-01-02
* ---------------------------------------------------------------- */
'use strict';

let GotapiPlugin = function(util) {
  this.util = util;
  this.info = {
    name: 'Simple Clock',
    services: [
      {
        serviceId : 'com.github.futomi.hello-clock.clock',
        name      : 'Simple Clock',
        online    : true,
        scopes    : ['clock']
      }
    ]
  };
  this.ticktack_timer_id = 0;
};

GotapiPlugin.prototype.init = function(callback) {
  this.util.init(this.info);
  this.util.onmessage = this.receiveMessage.bind(this);
  callback(this.info);
};

GotapiPlugin.prototype.receiveMessage = function(message) {
  if(message['profile'] === 'clock' && message['attribute'] === 'ticktack') {
    this.ticktack(message);
  } else {
    message['result'] = 400;
    message['errorMessage'] = 'Unknow profile was requested.';
    this.util.returnMessage(message);
  }
};

GotapiPlugin.prototype.ticktack = function(message) {
  if(message['method'] === 'put') {
    this.startTicktack(message);
  } else if(message['method'] === 'delete') {
    this.stopTicktack(message);
  } else {
    message['result'] = 400;
    message['data'] = null;
    message['errorMessage'] = 'The HTTP Method `' + message['method'] + '` is not supported.';
    this.util.returnMessage(message);
  }
};

GotapiPlugin.prototype.startTicktack = function(message) {
  message['result'] = 0;
  message['data'] = null;
  this.util.returnMessage(message);

  this.ticktack_timer_id = setInterval(() => {
    message['result'] = 0;
    message['data'] = (new Date()).toLocaleString();
    this.util.pushMessage(message);
  }, 1000);
};

GotapiPlugin.prototype.stopTicktack = function(message) {
  if(this.ticktack_timer_id) {
    clearInterval(this.ticktack_timer_id);
    this.ticktack_timer_id = 0;
  }
  message['result'] = 0;
  message['data'] = null;
  this.util.returnMessage(message);
};

module.exports = GotapiPlugin;