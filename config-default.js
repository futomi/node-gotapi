module.exports = {

	/* **************************************************************
	* Access Restrictions
	* ************************************************************ */

	/* --------------------------------------------------------------
	* - List of allowed IP address.
	*     The `node-gotapi` checks the IP address of client.
	*     By default, `127.0.0.1` is allowed to access. If you want
	*     external clients to be arrawed to access, add the IP address
	*     here.
	*
	*     [Example]
	*      "allowed_address_list": ['192.168.10.0/24', '2408:212:2e2e:2a00']
	*
	*     Note: IPv6 addresses are evaluated just by forward matching for now.
	* ------------------------------------------------------------ */
	"allowed_address_list": [],

	/* --------------------------------------------------------------
	* - List of allowed origins.
	*     The `node-gotapi` checks the `Origin` header of a request
	*     on the GotAPI-1 Interface from a front-end web application.
	*     The front-end web applications served by the HTTP server
	*     of the `node-gotapi` are allowed to access by default.
	*     If you want to add web applications served by other web
	*     servers, define the origins here.
	*
	*     [Example]
	*       "allowed_origin_list": ["https://192.168.0.13:4036"],
	* ------------------------------------------------------------ */
	"allowed_origin_list": [],

	/* **************************************************************
	* HTTP server for web applications
	* ************************************************************ */

	/* --------------------------------------------------------------
	* - Port number for the http server for web applications
	* ------------------------------------------------------------ */
	"http_server_port": 4035,

	/* --------------------------------------------------------------
	* - The path of the document root for web applications.
	*     Set the path relative to the `node-gotapi` directory.
	* ------------------------------------------------------------ */
	"http_server_document_root": "./html",


	/* **************************************************************
	* The GotAPI-Interfaces
	* ************************************************************ */

	/* --------------------------------------------------------------
	* - The port number for the GotAPI-1/5 Interface
	*     The GotAPI specification defines that the port number is
	*     4035. Basically, this value should not be changed.
	* ------------------------------------------------------------ */
	"gotapi_if_port": 4035,

	/* --------------------------------------------------------------
	* - Maximum number of acceptable WebSocket connections
	*     The web application establishes a WebSocket connection with
	*     the GotAPI Server. If multiple web applications runs 
	*     simultaneously, change this value to a number of web apps
	*     which are run simultaneously.
	* ------------------------------------------------------------ */
	"ws_connection_limit": 1,


	/* **************************************************************
	* The Plug-Ins
	* ************************************************************ */
	
	/* --------------------------------------------------------------
	* - The path of the directry for the Plug-In modules.
	*     Set a path relative to the `gotapi-server` directory.
	* ------------------------------------------------------------ */
	"plugin_root_path": "./plugins",

	/* --------------------------------------------------------------
	* - The timeout for Plug-Ins
	*     This is the period which the GotAPI Server waits for the
	*     response from the Plug-In. The unit is second.
	*     The value must be equal to or less than 60 (seconds).
	* ------------------------------------------------------------ */
	"plugin_response_timeout": 60,

	/* --------------------------------------------------------------
	* - The application ID of this GotAPI Server
	*     This value is sent to all Plug-Ins. Each Plug-In may use
	*     it to permit the GotAPI Server to access.
	* ------------------------------------------------------------ */
	"gotapi_server_app_id": "com.github.futomi.node-gotapi",


	/* **************************************************************
	* SSL Support
	* ************************************************************ */

	/* --------------------------------------------------------------
	* - SSL Engine Operation Switch
	*     true: on, false: off
	* ------------------------------------------------------------ */
	"ssl_engine": true,

	/* --------------------------------------------------------------
	* - Port number for the https server for web applications
	* ------------------------------------------------------------ */
	"https_server_port": 4036,

	/* --------------------------------------------------------------
	* - The port number for the GotAPI-1/5 Interface for SSL
	*     The GotAPI specification defines that the port number is 4036.
	*     Basically, this value should not be changed.
	* ------------------------------------------------------------ */
	"gotapi_if_ssl_port": 4036,

	/* --------------------------------------------------------------
	* If the node module `pem` and the openssl are installed, the
	* node-gotapi automatically generates a key pair (a certificate
	* and a private key). Therefore you don't need to prepere a key
	* pair.
	* If you want to use your own key pair, set the file pathes below.
	* ------------------------------------------------------------ */

	/* --------------------------------------------------------------
	* - The PEM-encoded private key file
	*     If the `ssl_engin` is set to `true`, this is required.
	* ------------------------------------------------------------ */
	//"ssl_key_file": "/etc/httpd/ssl.key/server.key",

	/* --------------------------------------------------------------
	* - PEM-encoded X.509 certificate data file
	*     If the `ssl_engin` is set to `true`, this is required.
	* ------------------------------------------------------------ */
	//"ssl_crt_file": "/etc/httpd/ssl.crt/server.crt",

	/* --------------------------------------------------------------
	* - The file of PEM-encoded Server CA Certificates
	*     This is optional.
	* ------------------------------------------------------------ */
	//"ssl_ca_file": "/etc/httpd/ssl.crt/server.ca"

};