node-gotapi Changelog
======================

## Version 0.4

### 0.4.3 (2019-10-21)

- Fixed the bug that the service discovery process on a certain condition caused memory leak.

### 0.4.2 (2019-10-19)

- Refactored the following scripts:
  - `gotapi-server.js`
  - `gotapi-interface-1.js`
  - `gotapi-interface-4.js`

### 0.4.1 (2018-12-24)

- Fixed the bug that the handling of the Plug-In response timeout did not work well.
- Changed the HTTP response code for timeout from `408 Request Timeout` to `500 Internal Server Error`. This is a workaround for Chrome. If Chrome receives `408 Request Timeout`, it retries the request troublingly.

### 0.4.0 (2018-12-24)

- Changed the HTTP port number for web apps from 10880 to 4035 (same as the GotAPI Interface-1) and changed the HTTPS port number for web apps from 10443 to 4036 (same as the GotAPI Interface-1).
- Supported IPv6 experimentally. Now you can access to the web app and GotAPI Interface-1 using IPv6 address. (e.g., `https://[2000:312:f32e:2a00:2a00:1bf7:1234:5678]:4036/`)

## Version 0.3

### 0.3.7 (2018-11-17)

- Fixed the bug that the gotapi server dies if the `ssl_engine` in the `config.js` is set to `false`.

### 0.3.6 (2018-05-13)

- Supported binary files as web app contents. Now, the web server for web apps can serve image files.

### 0.3.5 (2018-05-12)

- Fixed the bug that an error occurred when the GotAPI-1 Interface was accessed by an user agent other than web browser (such as crul).

### 0.3.4 (2018-05-10)

- Fixed the bug that an error occurred when the GotAPI-1 Interface was accessed by an user agent other than web browser (such as crul).

### 0.3.3 (2017-07-18)

- Allowed `serviceinformation` as the profile name of the service information API even if Plug-Ins return `serviceInformation` in the scopes. The GotAPI Server checks if the profile name in a request exists in the scopes reported by the targeted Plug-In. Basically, the profile name in the scopes is case-sensitive. However, `serviceinformation` is not case-sensitive now. Requests whose profile name is `serviceinformation` or `serviceInformation` will be passed to the targeted Plug-In if the Plug-In has one of the two in the scopes. If your Plug-In does not support the service information API, you do not need to care about this change.

### 0.3.2 (2017-05-11)

- Allowed `serviceDiscovery` as the profile name of the service discovery. Now, both of `servicediscovery` and `serviceDiscovery` can be used for the profile name of the service discovery on the GotAPI-1 Interface. Basically, you do not have to care about this update because the `gotapi-client.js` (the helper JS library for front-end applications) handles the service discvoery request instead of you.

### 0.3.1 (2017-05-10)

- Fixed the `errorCode` bug. If a Plug-In set a value to the `errorCode` property for a response, the process of the Plug-In died. Now the node-gotapi accepts an `errorCode` property as expected.

### 0.3.0 (2017-04-22)

- Changed the type of the `errorCode` property in the `Error` object from `Number` to `String` to be compliant to the OMA GotAPI 1.1 specification.
  - In the node-gotapi v0.2.2 or earlier, the `errorCode` was used for a HTTP response status code on the GotAPI-1 Interface. Now, you can specify your favorite costom code to the `errorCode` property in your Plug-In module. Note that the type of the value must be `String` (e.g., `"E-0F2A"`).
- Newly added the `statusCode` property in the `Response` object and the `Error` object.
  - This property is used for a HTTP status code set in a response on the GotAPI-1 Interface instead of the `errorCode` property.
  - In the node-gotapi v0.2.2 or earlier, the HTTP response code was set to `200` automatically if the response is not an error. Now you can use your favorite HTTP status code even if the response is not an error. That is, you can specify `201` (Created), `202` (Accepted), and so on.
- Deleted the `errorCode`, `errorMessage`, `errorText` properties from the `Response` object to be compliant to the OMA GotAPI 1.1 specification.
  - In the node-gotapi v0.2.2 or earlier, such properties were set in a `Response` object regardless they were useless. As that was confusing, they were removed.

## Version 0.2

### 0.2.2 (2017-04-14)

- Added error handling when a request URI is malformed (when failed to parse the query string in the request URI or form data in the request body).


### 0.2.1 (2017-04-05)

- Fixed (again) the bug that the node-gotapi prosess was down if the query string in the request URL includes non-UTF-8 characters. Now the node-gotapi returns an error.

### 0.2.0 (2017-04-03)

- Now the GotAPI Server supports `application/x-www-form-urlencoded` requests for front-end applications. You can send data to the GotAPI Server as form data instead of a query string in a request URL.

- Now the front-end JS helper library `gotapi-client.js` sends request parameters using `application/x-www-form-urlencoded` automatically when the method of the request is `POST` or `PUT`.

## Version 0.1

### 0.1.8 (2017-03-30)

- Fixed the bug in the debug mode. If there is no query string in the request URL, then the node-gotapi died. Now this bug is fixed.

### 0.1.7 (2017-03-29)

- Fixed the bug that the node-gotapi prosess was down if the query string in the request URL includes non-UTF-8 characters. Now the node-gotapi returns an error.

### 0.1.6 (2017-03-29)

- Fixed the bug which Plug-Ins could not set a custom error code to the `result` property in a response.

### 0.1.5 (2017-03-07)

- Fixed the bug which any accesses on the GotAPI-1 Interface are allowed in the production mode if the `allowed_address_list` is empty in the `config.js`.
- Changed the error message reported when the access from the front-end application on the GotAPI-1 Interface is denied, so that you can get the reason why the access was denied: the IP address or the origin.

### 0.1.4 (2017-03-06)

- Fixed the bug which the GotAPI-1 Interface always denied any accesses from the localhost in some Linux environments in the production mode (not the debug mode).

### 0.1.3 (2017-03-05)

- Changed line break from CRLF to LF in some files.

### 0.1.2 (2017-03-04)

- Removed the script `start-gotapi-debug.js` which starts the node-gotapi for debugging. Instead, `start-gotapi.js` supports some command options for debugging.

### 0.1.1 (2017-02-26)
- Changed the WebSocket module from the [websocket.io](https://github.com/LearnBoost/websocket.io) to the [WebSocket-Node](https://github.com/theturtle32/WebSocket-Node). The reason for this is that the [websocket.io](https://github.com/LearnBoost/websocket.io) has not been updated for a few years and it does not support Node 6 for now.

### 0.1.0 (2017-02-18)
- Added a debug mode
  - The `start-gotapi-debug.js` now supports a mode which ignores the grant and access token mechanism. In this mode, you can debug Plug-Ins easily.
- Extended the name space of property names for response from Plug-Ins
  - The property name for response for Plug-Ins was limited to `data`, now any property names are allowed except the prohibited property names for response.
- Disabled the `console.log()`, `console.dir()` and `console.error()` methods in the `start-gotapi.js`
  - If you want to check the outputs generated by the GotAPI Server and the Plug-Ins on your shell, use the `start-gotapi-debug.js` instead of the `start-gotapi.js`.