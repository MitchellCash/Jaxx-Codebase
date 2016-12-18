var BTCRelayHelper = function(){};

BTCRelayHelper.pushRawTx = function(relayName, urlToCall, dataToSend, callback, passThrough) {
    g_JaxxApp.getBitcoinRelays().relayLog("BTCRelayHelper :: pushRawTx :: " + relayName + " :: pushing raw tx :: dataToSend :: " + dataToSend + " :: urlToCall :: " + urlToCall);


    console.log("BTCRelayHelper :: pushRawTx :: " + relayName + " :: pushing raw tx :: dataToSend :: " + dataToSend + " :: urlToCall :: " + urlToCall);

//    $.ajax(urlToCall, {
//        complete: function(ajaxRequest, status) {
//			var response;
//			var responseText;
//            if (status === 'success') {
//                response = '{"status": "success"}';
//            }
//            else {
//				responseText = JSON.stringify(ajaxRequest.responseText)
//                response = '{"status": "fail" , "message": ' + responseText + '}';
//            }
//
//			callback(status, JSON.parse(response));
//        },
//        contentType: 'application/x-www-form-urlencoded',
//        data: callData,
//        type: 'POST'
//    });

    RequestSerializer.postUrlEncoded(urlToCall, dataToSend, function(data, status, passThrough) {
        console.log(relayName + " :: sendtx post :: received status :: " + status + " :: data :: " + JSON.stringify(data));

        callback(status, JSON.parse(data), passThrough);
    }, true, passThrough);
}

//BTCRelayHelper.getTxList = function(address, relayName, urlToCall){
//    g_JaxxApp.getBitcoinRelays().relayLog("Chain Relay :: " + this._name+" - Requested txlist for "+address);
//    RequestSerializer.getJSON(this._baseUrl+'api/v1/address/txs/'+address, function (response,status) {
//        if(status==='error'){
//            g_JaxxApp.getBitcoinRelays().relayLog("Chain Relay :: Cannot get txList : No connection with " + );
//            //btcRelays.doRoundRobin();
//        }
//        else {
//            g_JaxxApp.getBitcoinRelays().relayLog("Chain Relay :: " + this._name+" Tx List Raw response:"+JSON.stringify(response));
//        }
//    },true);
//
//    RequestSerializer.getJSON(this._baseUrl+'api/v1/address/unconfirmed//'+address, function (response,status) {
//        if(status==='error'){
//            g_JaxxApp.getBitcoinRelays().relayLog("Chain Relay :: Cannot get txList : No connection with "+ this._name);
//        }
//        else {
//            g_JaxxApp.getBitcoinRelays().relayLog("Chain Relay :: " + this._name+" Tx List (unconfirmed) Raw response:"+JSON.stringify(response));
//        }
//    },true);
//}
