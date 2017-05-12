/**
 * Created by 1 on 22.02.2017.
 */

var net = require("net");
var uniqid = require("uniqid");
var EventManager = require('./EventManager');
var amiConfigs = {
	"crm.perscheron22.ru": {
		"recordpath": "/var/spool/asterisk/monitor",
		"regfile": "/[0-9]{4}/[0-9]{2}/[0-9]{2}/.*\.wav",
		"url": "http://crm.perscheron22.ru/records",
		"timezone": "Asia/Barnaul"
	},
	"192.168.0.104": {
		"recordpath": "/var/records",
		"regfile": "/[0-9]{4}/[0-9]{2}/[0-9]{2}/.*\.wav",
		"url": "http://asterisk.local/records",
		"timezone": "Asia/Barnaul"
	}
};


var AsteriskAMI = {
	"connections": {},
	"connection": function (options, callback) {
		var self = this;
		var _options = {
			"host": null,
			"port": null,
			"username": null,
			"secret": null,
			"debug": false
		};
		var EVT_CONNECT = 'connect';
		var EVT_EVENT = 'event';
		var EVT_ERROR = 'error';
		var EVT_EVENT_CALL = 'eventCall';
		var EVT_CALL = 'call';
		this.id = options['id'];
		this.isConnected = false;
		this.events = new EventManager();
		this.timeZone = null;

		var calls = {};


		this.on = function (eventName, handler, target) {
			self.events.on(eventName, handler, target);
		};

		this.makeCall = function (from, to, context) {
			if (typeof context == "undefined") {
				context = "call-out";
			}
			socket.write(toAmiString("Originate", {
				"Channel": "SIP/" + from,
				"Exten": to,
				"Priority": "1",
				"Context": context,
				"Callerid": from
			}));
		};

		var toAmiString = function (actionName, obj) {
			var string = "Action: " + actionName + "\r\n";
			for (var i in obj) {
				if (obj.hasOwnProperty(i)) {
					string += i + ": " + obj[i] + "\r\n";
				}
			}
			return string + "\r\n";
		};


		for (var i in _options) {
			if (_options.hasOwnProperty(i) && typeof options[i] != "undefined") {
				_options[i] = options[i];
			}
		}
		console.log("[airux.AsteriskAMI.connection] open socket");
		var socket = new net.Socket();
		socket.on("error", function () { // todo reconnect with timeout
			console.log(arguments);
		});
		this.timeZone = amiConfigs[_options["host"]]["timezone"];
		socket.connect(_options["port"], _options["host"], function () {
			var sendData = "Action: Login\r\nUsername: " + _options["username"] + "\r\nSecret: " + _options["secret"] + "\r\n\r\n";
			console.log("[AMI(Action:Login)]: login to ami ", _options);
			console.log("[AMI(SendData)]: \n", sendData);
			socket.write(sendData);
		});
		var getCall = function (id, cdrEvent) {
			var call = null;
			if (typeof calls[id] == "undefined") {
				call = calls[id] = new AsteriskAMI.call(id);
			} else {
				call = calls[id];
			}
			/**
			 * 1. Много разговоров в одном проходе
			 * 2. Может быть подключенных много пользователей (указывается несколько авторов)
			 * 3. Открывается несколько подключений к AMI
			 * 4. Нужно разобраться с идентификаторами каналов
			 */
			call.status = cdrEvent["Disposition"];
			call.callerNumber = cdrEvent["Source"];
			call.destinationNumber = cdrEvent["Destination"];
			call.dateStart = cdrEvent["StartTime"];
			call.dateAnswer = cdrEvent["AnswerTime"];
			call.dateEnd = cdrEvent["EndTime"];
			// console.log("CDR_EVENT:", cdrEvent);
			var regRecPath = new RegExp(amiConfigs[_options["host"]]["recordpath"] + "(" + amiConfigs[_options["host"]]["regfile"] + ")");
			if (typeof cdrEvent["recordingpath"] != "undefined") {
				var resultRecPath = cdrEvent["recordingpath"].match(regRecPath);
				if (resultRecPath) {
					call.record_link = amiConfigs[_options["host"]]["url"] + resultRecPath[1];
				}
			}
			console.log("CALL:", call);
			return call;
		};
		socket.on("data", function (buf) {
			var evt, callEvent, call;
			var data = AsteriskAMI.parseData(buf);
			for (var i = 0; i < data.length; i++) {
				evt = null;
				if (!self.isConnected && data[i]["Response"] == "Success" && data[i]["Message"] == "Authentication accepted") {
					console.log("[AsteriskAMI]: authentication accepted");
					self.events.trigger(EVT_CONNECT, [self]);
					self.isConnected = true;
				} else if (!self.isConnected && data[i]["Response"] == "Error" && data[i]["Message"] == "Authentication failed") {
					console.log("[AsteriskAMI]: authentication failed", data);
					self.events.trigger(EVT_ERROR, [data[i]['Message']]);
				}
				if (typeof data[i]["Event"] != "undefined") {
					evt = new AsteriskAMI.event(data[i]);
					self.events.trigger(EVT_EVENT, [evt]);
				}
				if (evt != null) {
					var uniqueId = null;
					if (typeof evt["Uniqueid"] != "undefined") {
						uniqueId = evt["Uniqueid"];
					} else if (typeof evt["UniqueID"] != "undefined") {
						uniqueId = evt["UniqueID"];
					}
					if (evt["Event"] == "Cdr") {
						self.events.trigger(EVT_CALL, [getCall(uniqueId, evt)]);
					}
				}
			}
		});
	},
	"parseData": function (buf) {
		var returnDataArray = [];
		var dataArray = buf.toString().split("\r\n\r\n");
		var eventData, dataKeyValStrings, dataKeyVal;
		for (var i = 0; i < dataArray.length; i++) {
			if (dataArray[i] == "") {
				continue;
			}
			dataKeyValStrings = dataArray[i].split("\r\n");
			eventData = {};
			for (var j = 0; j < dataKeyValStrings.length; j++) {
				dataKeyVal = dataKeyValStrings[j].split(": ");
				if (dataKeyVal.length == 1) {
					if (dataKeyVal[0] != "") {
						eventData["asteriskVersion"] = dataKeyVal[0].split("/")[1];
					}
					continue;
				}
				eventData[dataKeyVal[0]] = dataKeyVal[1];
			}
			returnDataArray.push(eventData);
		}
		return returnDataArray;
	},
	"call": function (id) {
		this.id = id;
		var eventsStack = [];
		this.pushEventsStack = function (callEvent) {
			if (callEvent["type"] != "HANGUP") {
				this.processEvent(callEvent);
			}
			eventsStack.push(callEvent);
		};
		this.processEvent = function (callEvent) {
			if (this.callerNumber == null) {
				this.callerNumber = callEvent["callerNumber"];
			}
			if (this.callerName == null) {
				this.callerName = callEvent["callerName"];
			}
			if (this.destinationNumber == null) {
				this.destinationNumber = callEvent["destinationNumber"];
			}
			if (this.destinationName == null) {
				this.destinationName = callEvent["destinationName"];
			}
		};
		// /**
		//  * ANSWER
		//  * CANCEL
		//  * BUSY
		//  * NOANSWER
		//  *
		//  * @type {null}
		//  */
		this.status = null;

		this.callerNumber = null;
		this.callerName = null;
		this.destinationNumber = null;
		this.destinationName = null;
		this.record_link = null;

		this.dateStart = null;
		this.dateAnswer = null;
		this.dateEnd = null;
	},
	"event": function (data) {
		for (var i in data) {
			this[i] = data[i];
		}
	},
	"eventCall": function () {
		/**
		 * Уникальный идентификатор события
		 * @type {null}
		 */
		this.id = null;
		this.callId = null;

		/**
		 * Тип события звонка
		 * CALL начало звонка
		 * BUSY - Занят
		 * HANG_UP прошена трубка
		 * CANCEL = сброшен
		 * ANSWER ответ
		 * @type {null}
		 */
		this.type = null;

		this.callerNumber = null;
		this.callerName = null;
		this.destinationNumber = null;
		this.destinationName = null;


		this.record_link = null;

	}
};
module.exports = AsteriskAMI;