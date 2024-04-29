/**
 * Helper for connecting to Titler Live server and providing API endpoints.
 */
var ServiceHandler = {
    
    DEBUGMODE: true, // set to true to enable printing debugging information to console; set to false in release

    /**
     * Scheduler API object. Available after onready() callback fires.  */
    scheduler: undefined,

    /**
     * Web socket server url used to communicate with the server (i.e. "ws://localhost:4321") */
    serverUrl: undefined,

    /**
     * User callback to execute when connection to server is established. */
    onready: function () { },

    /**
     * User callback to execute when connection to server is terminated. */
    onclose: function () { },

    /**
     * User callback to execute when an error is encountered trying to communicate with the server. */
    onerror: function (error) { },

    /**
     * Initializes the connection to the Titler Live API server. */
    init: function (url) {
        ServiceHandler.serverUrl = url;
        if (typeof url === 'undefined') {
            // Use the local server environment as the socket server.
            // When hosted by the Titler HTTP server, socket port is stored as a global session cookie.
            var cookie = document.cookie;
            if (cookie != '') {
                var serverPort = (/channel=([0-9]+)/.exec(cookie)[1]);
                ServiceHandler.serverUrl = "ws://" + window.location.hostname + ":" + serverPort;
            } else {
                console.error("No server cookie set; use built-in Titler HTTP server or provide an url argument");
            }
        }

        if (ServiceHandler.DEBUGMODE) {
            console.log("Connecting to", ServiceHandler.serverUrl);
        }

        var socket = new WebSocket(ServiceHandler.serverUrl);
        socket.onclose = function () {
            if (ServiceHandler.DEBUGMODE)
                console.warn("WebSocket closed");
            if (typeof ServiceHandler.onclose === 'function')
                ServiceHandler.onclose();
        };

        socket.onerror = function (error) {
            if (ServiceHandler.DEBUGMODE)
                console.error("WebSocket error", error);
            if (typeof ServiceHandler.onerror === 'function')
                ServiceHandler.onerror(error);
        };

        socket.onopen = function () {
            if (ServiceHandler.DEBUGMODE)
                console.log("WebSocket connected, setting up QWebChannel");

            // Establish API connection.
            new QWebChannel(socket, function (channel) {
                if (ServiceHandler.DEBUGMODE)
                    console.log("QWebChannel connected");
                ServiceHandler.scheduler = channel.objects.scheduler;
                if (typeof ServiceHandler.onready === 'function')
                    ServiceHandler.onready();
            });
        };
    }
}