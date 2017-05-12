/**
 * Created by 1 on 20.10.2016.
 */

var net = require("net");
var fs = require('fs');
var uniqid = require('uniqid');
var airux = require("./airux");
var AiruxAsteriskAMI = airux.AsteriskAMI;
var AiruxWebSocket = airux.WebSocket;
var wsToAmi = airux.WSToAMI;
var mysql = require("mysql");

var configs = JSON.parse(fs.readFileSync(__dirname + '/../node-config.json', 'utf8'));


console.log('[server]: Create db connection');
var dbConnectionData = JSON.parse(fs.readFileSync(__dirname + '/../config-db.json', 'utf8'));
configs["dbConnection"] = mysql.createConnection({
	"host": dbConnectionData["dbHost"],
	"user": dbConnectionData["dbUser"],
	"password": dbConnectionData["dbPassword"],
	"database": dbConnectionData["dbName"]
});
configs["dbConnection"].connect();


console.log('[server]: Create web socket (WSS) server (AiruxWebSocket.Server)');
var wsServer = new AiruxWebSocket.Server(configs);
wsServer.events.on("newConnection", function (connection) {
	var gateway;
	var authHandler = function () {
		if (!(connection.telephonyConfigs != null)) {
			console.log('[server.newConnection]: нет настроек телефонии');
			return;
		}
		if (connection.insideNumber == null) {
			console.log('[server.newConnection]: не указан внутренний номер');
			return;
		}
		var connectionData = connection.telephonyConfigs;
		var connectionId = connectionData["host"] + "-" + connectionData["port"] + "-" + connectionData["username"] + connectionData["secret"];

		if (typeof AiruxAsteriskAMI.connections[connectionId] == "undefined") {
			console.log("[server.AMI] Create new connection");
			AiruxAsteriskAMI.connections[connectionId] = new AiruxAsteriskAMI.connection({
				"id": connectionId,
				"host": connectionData["host"],
				"port": connectionData["port"],
				"username": connectionData["username"],
				"secret": connectionData["secret"]
			});
		} else {
			console.log("[server.AMI] Use existed connection");
		}
		gateway = new wsToAmi.Gateway({
			"ami": AiruxAsteriskAMI.connections[connectionId],
			"ws": connection,
			"dbConnection": configs["dbConnection"]
		});
	};
	var closeHandler = function () {
		gateway = null;
		connection.events.remove("auth", authHandler);
		connection.events.remove("close", closeHandler);
	};
	connection.events.on("auth", authHandler);
	connection.events.on("close", closeHandler);
});
