/**
 * Created by 1 on 06.03.2017.
 */

var WSToAMI = {
	"Gateway": function (options) {
		var ami = options["ami"];
		var ws = options["ws"];
		var dbConnection = options["dbConnection"];

		var connectHandler = function () {
			console.log("[airux.WSToAMI.Gateway.connectHandler]: ami connect");
		};
		var calls = {};
		var callHandler = function (call) {
			console.log("[airux.WSToAMI.Gateway.callHandler(" + call["status"] + ")]: WSData(" + ws.insideNumber + "," + ws.accountId + "," + ws.spaceId + ") CallerNumber(" + call["callerNumber"] + ") DestionationNumber(" + call["destinationNumber"] + ")");
			if (!(ws.insideNumber != null && (call["callerNumber"] == ws.insideNumber || call["destinationNumber"] == ws.insideNumber))) {
				console.log("[airux.WSToAMI.Gateway.eventCallHandler]: Unknown insidePhone(" + ws.insideNumber + ")", call["callerNumber"], call["destinationNumber"]);
				return;
			}
			var data = {
				"action": "call",
				"data": call
			};
			dbConnection.query("INSERT INTO `telephony_call` " +
				"(`space_id`, `account_id`, `call_id`, `status`, `source_number`, `destination_number`, `date_begin`, `date_answer`, `date_end`, `record_link`) " +
				"VALUES " +
				"(" + ws["spaceId"] + "," +
				"" + ws["accountId"] + "," +
				"'" + call["id"] + "'," +
				"'" + call["status"] + "'," +
				"'" + call["callerNumber"] + "'," +
				"'" + call["destinationNumber"] + "'," +
				"CONVERT_TZ('" + call["dateStart"] + "','" + ami["timeZone"] + "','" + ws["timeZone"] + "')," +
				"CONVERT_TZ('" + call["dateAnswer"] + "','" + ami["timeZone"] + "','" + ws["timeZone"] + "')," +
				"CONVERT_TZ('" + call["dateEnd"] + "','" + ami["timeZone"] + "','" + ws["timeZone"] + "')," +
				"'" + call["record_link"] + "'" +
				");", function (error) {
				if (error) {
					console.log("[airux.WSToAMI.Gateway.eventCallHandler]: ", error);
				}
			});
			ws.send(data);
		};
		ami.on("connect", connectHandler);
		ami.on("call", callHandler);
		ws.events.on("close", function () {
			console.log("[airux.WSToAMI.Gateway.wsClose] close ws connection");
			ami.events.remove("connect", connectHandler);
			ami.events.remove("call", callHandler);
		});
		console.log("[airux.WSToAMI.Gateway]: Create new Gateway between WebSocket.Connection (" + ws.id + ") and AsteriskAMI.Connection (" + ami.id + ")");
	}
};


module.exports = WSToAMI;