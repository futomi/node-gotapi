/* ------------------------------------------------------------------
* node-gotapi - node-gotapi-plugin-helloworld/index.js
*
* Copyright (c) 2017, Futomi Hatano, All rights reserved.
* Released under the MIT license
* Date: 2016-01-02
* ---------------------------------------------------------------- */
'use strict';

let GotapiPlugin = function(util) {
  this.util = util;
  this.info = {
    name: 'Hello World',
    services: [
      {
        serviceId : 'com.github.futomi.hello-world.echo',
        name      : 'hello world',
        online    : true,
        scopes    : ['echo']
      }
    ]
  };
};

GotapiPlugin.prototype.init = function(callback) {
  this.util.init(this.info);
  this.util.onmessage = this.receiveMessage.bind(this);
  callback(this.info);
};

GotapiPlugin.prototype.receiveMessage = function(message) {
  if(message['profile'] === 'echo') {
    message['result'] = 0;
    message['data'] = message['params']['msg'];
  } else {
    message['result'] = 400;
    message['errorMessage'] = 'Unknow profile was requested.';
  }
  this.util.returnMessage(message);
};

module.exports = GotapiPlugin;