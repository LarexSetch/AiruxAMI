/**
 * Created by 1 on 06.03.2017.
 */


var fs = require('fs');
var uniqid = require('uniqid');
var EventManager = require('./EventManager');

var WebSocket = {
	"connections": {},
	"Server": function (config) {
		var self = this;
		var server;
		var EVT_INIT = "init";
		var EVT_NEW_CONNECTION = "newConnection";
		var EVT_CLOSE_CONNECTION = "closeConnection";
		this.events = new EventManager();

		if (typeof config["ssl"] != "undefined") {
			var https = require('https');
			var privateKey = fs.readFileSync(config["ssl"]["key"], 'utf8');
			var certificate = fs.readFileSync(config["ssl"]["crt"], 'utf8');
			var credentials = {key: privateKey, cert: certificate};
			server = https.createServer(credentials);
			server.listen(config["port"]);
		} else {
			var http = require('http');
			server = https.createServer(credentials);
			server.listen(config["port"]);
		}
		var ws = new require('ws');
		var webSocketServer = new ws.Server({
			server: server
		});

		webSocketServer.on('connection', function (ws) {
			var connectionId = uniqid();
			var connectionOptions = {
				"id": connectionId,
				"ws": ws,
				"dbConnection": (typeof config["dbConnection"] == "undefined") ? null : config["dbConnection"]
			};
			WebSocket.connections[connectionId] = new WebSocket.Connection(connectionOptions);
			console.log('[WebSocket.Server]: open new connection with id ' + connectionId);

			ws.on('close', function () {
				console.log('[WebSocket.Server]: close connection with id ' + connectionId);
				WebSocket.connections[connectionId].events.trigger("close", [WebSocket.connections[connectionId]]);
				self.events.trigger(EVT_CLOSE_CONNECTION, [WebSocket.connections[connectionId]]);
				delete WebSocket.connections[connectionId];
			});
			self.events.trigger(EVT_NEW_CONNECTION, [WebSocket.connections[connectionId]]);
		});
		this.events.trigger(EVT_INIT, [this]);
	},
	"Connection": function (options) {
		var self = this;
		var EVT_AUTH = 'auth';
		var EVT_MESSAGE = 'message';
		var EVT_SET_SCRIPT_HISTORY = 'setScriptHistory';

		this.events = new EventManager();
		this.id = options["id"];
		this.spaceId = null;
		this.accountId = null;
		this.ws = options["ws"];
		this.telephonyConfigs = null;
		this.insideNumber = null;
		this.timeZone = null;

		this.send = function (data) {
			if (typeof data != "object") {
				data = JSON.stringify(data);
			}
			self.ws.send(JSON.stringify(data));
		};

		this.auth = function (apiKey) {
			if (options["dbConnection"] == null) {
				console.log('[WebSocket.Connection.auth]: не передано подключение к БД');
				return;
			}
			var dbConnection = options["dbConnection"];
			dbConnection.query("SELECT acs.*, a.`first_name`, a.`time_zone`, tc.`data` FROM `account_space` AS acs " +
				"LEFT JOIN `account` AS a ON a.`id` = acs.`account_id` " +
				"LEFT JOIN `telephony_config` AS tc ON tc.`space_id` = acs.`space_id` " +
				"WHERE acs.`api_key` = '" + apiKey + "';", function (error, accountSpaces) {
				if (error) {
					console.log("[WebSocket.Connection.auth]: ", error);
					self.ws.close();
				}
				if (accountSpaces.length != 1) {
					console.log("[WebSocket.Connection.auth]: forbidden");
					self.send({"type": "error", "message": "Forbidden"});
					self.ws.close();
				} else {
					self.isAuth = true;
					self.spaceId = accountSpaces[0]["space_id"];
					self.accountId = accountSpaces[0]["account_id"];
					self.insideNumber = accountSpaces[0]["inside_phone_number"];
					console.log("[WebSocket.Connection.auth]: success for {accountId: " + self.accountId + ", spaceId:" + self.spaceId + ", insideNumber: " + self.insideNumber + "}");
					self.ws.send(JSON.stringify({"type": "message", "message": "Authentication success"}));
					if (accountSpaces[0]["time_zone"] != "0") {
						dbConnection.query("SET time_zone = \"" + accountSpaces[0]["time_zone"] + "\"");
						self.timeZone = accountSpaces[0]["time_zone"];
					}
					if (accountSpaces[0]["data"] != null) {
						self.telephonyConfigs = JSON.parse(accountSpaces[0]["data"]);
					} else {
						console.log("[WebSocket.Connection.auth]: нет настроек телефонии");
						self.ws.send(JSON.stringify({"type": "error", "message": "No configs"}));
					}
					self.events.trigger(EVT_AUTH, [self]);
				}
			});

		};
		this.setScriptHistory = function (data) {
			if (options["dbConnection"] == null) {
				console.log('[WebSocket.Connection.setScriptHistory]: не передано подключение к БД');
				return;
			}
			var dbConnection = options["dbConnection"];
			dbConnection.query("UPDATE `telephony_call` SET `script_history_id` = " + data["script_history_id"] + " WHERE `call_id` = '" + data["call_id"] + "';", function (error) {
				if (error) {
					console.log('[WebSocket.Connection.setScriptHistory]: ', error);
					return;
				}
				self.events.trigger(EVT_SET_SCRIPT_HISTORY, [data]);
			});
		};

		var wsMessageHandler = function (message) {
			console.log('[WebSocket.Connection.wsMessageHandler]: ' + message);
			var messageData = JSON.parse(message);
			if (messageData["action"] == "auth") {
				self.auth(messageData["data"]["key"]);
			}
			if (messageData["action"] == "setScriptHistory") {
				self.setScriptHistory(messageData["data"]);
			}
			self.events.trigger(EVT_MESSAGE, [message]);
		};
		self.ws.on('message', wsMessageHandler);

	}
};

module.exports = WebSocket;