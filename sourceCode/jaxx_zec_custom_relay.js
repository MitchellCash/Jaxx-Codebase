var ZECJaxxCustomRelay = function() {
//    this._baseUrl = "http://52.36.145.169:3006/api/zec/";
    this._baseUrl = "https://api.jaxx.io/api/zec/";
    this._getTxListPrepend = 'transactions/';
    this._getTxListAppend = '';
    this._getTxDetailsPrepend = 'transactionParams/';
    this._getTxDetailsAppend = '';
    this._getAccountBalancePrepend = 'balance/';
    this._getAccountBalanceAppend = '';
    this._name = "Jaxx ZCash Custom API";
    this._reliable = "true";
    this._lastBlock = 0;

    this._relayManager = null;

    this._fixedBlockHeight = false;
}

ZECJaxxCustomRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

ZECJaxxCustomRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

ZECJaxxCustomRelay.prototype.setLastBlockHeight = function(newHeight){
	if (this._fixedBlockHeight){
        this._lastBlock = this._fixedBlockHeight;
    } else {
        this._lastBlock = newHeight;
    }
}

ZECJaxxCustomRelay.prototype.fetchLastBlockHeight  = function(callback, passthroughParams) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl + 'blockchainInfo', function (response, status, passthroughParams) {
        if (status === 'error'){
            self._relayManager.relayLog("Chain Relay :: No connection with " + self._name + ". Setting height to 0");
            if (self._fixedBlockHeight) {
                self._lastBlock = self._fixedBlockHeight;
            } else {
                self._lastBlock = 0;
            }
        }
        else {
            //this._lastBlock = response.blockcount;
            //self._relayManager.relayLog("Chain Relay :: Updated blockrexplorer.com height: " + this._lastBlock);
            self.setLastBlockHeight(response.height);
            self._relayManager.relayLog("Chain Relay :: Updated " + self._name + " :: blockheight :: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
        }

        callback(status, passthroughParams);
    }, true, passthroughParams);
}

ZECJaxxCustomRelay.prototype.checkCurrentHeightForAnomalies  = function() {
    if(this._lastBlock ==0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

//@note: @here: this is using insight.io, which has the issue with the transactions not being associated to the proper addresses if using multiple.

ZECJaxxCustomRelay.prototype.getTxList  = function(addresses, callback, passthroughParams) {
    this._relayManager.relayLog("Chain Relay :: " + this._name+ " - Requested txlist for " + addresses);

    var self = this;

    //var passthroughAddresses = {addresses: addresses};

    var requestString = this._baseUrl + this._getTxListPrepend + addresses + this._getTxListAppend;

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function(response, status, passthroughParams) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with "+ this._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx List Raw response:" + JSON.stringify(response));

            returnTxList = self.getTxListParse(response);
//            console.log(passthrough.response)
        }

        callback(status, returnTxList, passthroughParams);
    }, true, passthroughParams);
}

ZECJaxxCustomRelay.prototype.getTxListParse = function(primaryTxListData) {
    var returnData = {data: []};

    var allKeys = Object.keys(primaryTxListData);

    var txListForAddresses = [];

    for (var i = 0; i < allKeys.length; i++) {
        var sourceTxs = primaryTxListData[allKeys[i]];
        var targetTxs = [];
        for (var j = 0; j < sourceTxs.length; j++){
            targetTxs.push({"txHash" : sourceTxs[j]});
        }
        var newTxList = {
            address: allKeys[i],
            txs: targetTxs,
            unconfirmed: {}
        };

        txListForAddresses.push(newTxList);
    }

    returnData.data = txListForAddresses;

    return returnData;
}

ZECJaxxCustomRelay.prototype.getTxCount = function(addresses, callback, passthroughParams) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested txCount for :: " + addresses);

    var requestString = this._baseUrl + 'transactions/' + addresses;

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function (response,status, passthroughParams) {
        var txCount = -1;

        if (status === 'error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with " + self._name);
        } else {
            txCount = 0;

            var allKeys = Object.keys(response);

            for (var i = 0; i < allKeys.length; i++) {
                var allTxKeys = Object.keys(response[allKeys[i]]);

                txCount += allTxKeys.length;
            }
//            console.log("found :: " + JSON.stringify(response));
        }

        //@note: @here: @todo: get unconfirmed tx?
        ///api/ltc/unconfirmedTransactions/LhGYSWAabViCqsLiGKCwND7aC1yDC9TApd,LYsBRZqfme1hjTYPnxEm8hpYJaDZYZrky8

        callback(status, txCount, passthroughParams);
    },true, passthroughParams);
}

ZECJaxxCustomRelay.prototype.getTxDetails = function(txHashes, callback, passthroughParams) {

//    console.log("ZECJaxxCustomRelay :: getTxDetails :: currently unimplemented");
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested tx details for :: " + txHashes);

    //var txDetailsStatus = {numHashesTotal: txHashes.length, numHashesProcessed: 0, allHashes: txHashes, numHashRequestsSucceeded: 0, allTxDetails: []};

    var requestString = this._baseUrl + 'transactionInfo/' + txHashes.join(',');
    // Sample requestString: http://52.41.118.219:3004/api/zec/transactionInfo/ebd4982cf3ac622689e26ceb44b5cec4c04085450f37049e80e67ac7dc2accef,e35533b64a9e686be58484aeb15131de52f4f4e2c0efbd2ba4f42645fdb0a841 // https://api.jaxx.io/api/ltc/transactionInfo/3b40250a08e7cb493981adfc6637235835998347e059565eb24f9d6268cea70f,9f4da4554f02c209e98040cc478720c922b50edb14f4071f8c4c73e74a9243bf


    // http://52.41.118.219:3004/api/zec/transactionInfo/2430dec07fd27c4dc637303f3e3e35d4580099f55ff1f0eee7f6e5f27836897c,2430dec07fd27c4dc637303f3e3e35d4580099f55ff1f0eee7f6e5f27836897c
    RequestSerializer.getJSON(requestString, function (response, status) {
        var data = [];
        if (status === 'error'){

        } else {
            callbackData = self.getTxDetailsParse(response);
        }

        callback(status, callbackData, passthroughParams);
    });
}

ZECJaxxCustomRelay.prototype.getTxDetailsParse = function(response) {

//{
//    "1df9a5db8f3dbeac96d3b20cab807634b34ecea5915d5dbdadca95b1c8ec8c41": {
//        "hash": "1df9a5db8f3dbeac96d3b20cab807634b34ecea5915d5dbdadca95b1c8ec8c41",
//        "vin": [],
//        "vout": [
//            {
//                "standard": true,
//                "address": "LMTGkzHF6d2HpKrcoGGqrAMtKpDBLmUhRs",
//                "value": "50",
//                "spent": true
//            }
//        ],
//        "blockheight": 124,
//        "time_utc": "2011-10-13T03:07:20.000Z",
//        "standard": false,
//        "confirmations": 1079282
//    },
//        "caaeb42a2367f9d0dcd5bfdb6d90fb7d9fef0bffbf147a9775a0f5d831e4b780": {
//        "hash": "caaeb42a2367f9d0dcd5bfdb6d90fb7d9fef0bffbf147a9775a0f5d831e4b780",
//        "vin": [
//            {
//                "address": "LNDfDcG5hDwqXSMo6nK8RdfvtUegSD3mqi",
//                "amount": "-12.29454249",
//                "previousTxId": "ee67e7fcc582503082d69dcb625a583b5c21c55cd62b6db89e157d9ee2e2dfad",
//                "previousIndex": 1,
//                "standard": true
//            }
//        ],
//        "vout": [
//            {
//                "standard": true,
//                "address": "LTvsAa42uedYggGnHP5Zk3tZ91jXuws6rL",
//                "value": "1.27889497",
//                "spent": true
//            },
//            {
//                "standard": true,
//                "address": "LQquUJvPFoKzM8PozDRA7edcZvSpxbGmZm",
//                "value": "11.01464752",
//                "spent": true
//            }
//        ],
//        "blockheight": 1078431,
//        "time_utc": "2016-10-12T19:30:32.000Z",
//        "confirmations": 975
//    }
//}

    var allTxDetails = [];

    var allAddressData = response;

    var addressKeys = Object.keys(response);

    for (var idx = 0; idx < addressKeys.length; idx++) {
        var curAddress = addressKeys[idx];

        var curData = response[curAddress];


        var outputs = [];
        var inputs = [];

        for (i = 0; i < curData.vout.length; i++) {
            var output = curData.vout[i];

            outputs.push({
                address: output.address,
                amount: parseFloat(output.amount).toFixed(8),
                index: i,
                spent: output.spent,
                standard: output.standard
            });
        }

        for (i = 0; i < curData.vin.length; i++) {
            var input = curData.vin[i];

            inputs.push({
                address: input.address,
                //@note: @here: @todo: balance calculation bug?
                amount: parseFloat(input.amount).toFixed(8),
                index: i,
                previousTxid: input.previousTxId,
                previousIndex: input.previousIndex,
                standard: input.standard
            })
        }

        var tx = {
            txid: curData.hash,
            block: curData.blockheight,
            confirmations: curData.confirmations,
            time_utc: new Date(curData.time_utc).getTime() / 1000.0,
            inputs: inputs,
            outputs: outputs
        }

        allTxDetails.push(tx);
    }

    return allTxDetails;
}

ZECJaxxCustomRelay.prototype.getAddressBalance = function(address, callback, passthroughParams) {
    // @TODO: Program Blockr and Custom Relay for multiple addresses
    var self = this;

    var requestString = this._baseUrl + 'balance/' + address;
    // https://api.jaxx.io/api/ltc/balance/LhGYSWAabViCqsLiGKCwND7aC1yDC9TApd,LYsBRZqfme1hjTYPnxEm8hpYJaDZYZrky8

    try {

        RequestSerializer.getJSON(requestString, function (response,status) {
            var balance = -1;

            if(status==='error'){
                self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
            }
            else {
                self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

                balance = parseInt(response[Object.keys(response)[0]].confirmed.amount);
            }

            callback(status, balance, passthroughParams);
        });
    } catch (error) {
        callback("ZECJaxxCustomRelay :: getAddressBalance :: Request serializer exception." ,0, passthroughParams);
    }
}

ZECJaxxCustomRelay.prototype.getFixedBlockHeight = function( address, callback, passthroughParams) {
    var self = this;

    var requestString = this._baseUrl + 'api/txs/?address=' + address;

    RequestSerializer.getJSON(requestString, function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
        }
        else {
            var setBlockHeight = response.txs[1].blockheight;

            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(setBlockHeight));

            callback(setBlockHeight, passthroughParams);
//            console.log(self._name + "  :: " + setBlockHeight);

        }
    });
}

ZECJaxxCustomRelay.prototype.getUTXO  = function(address, callback, passthroughParams) {
    if (!callback) { throw new Error('missing callback'); }
    var url=this._baseUrl+'api/addr/'+address+'/utxo';
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address + " :: url :: " + url);
	var self = this;
    // http://52.41.118.219:3004/api/zec/api/addr/tmRqAQWsY37h2FYr7cueRTNEiSkz1TkuHoD,tmDBA6bZRGVwA6tSduJPpZQQJyjMbkkJV44/utxo // url to paste in browser
    RequestSerializer.getJSON(url, function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(new Error("Chain Relay :: Cannot get txCount: No connection with " + self._name));
        }
        else if(response){
            //self._relayManager.relayLog("Chain Relay :: " + btcRelays.blockexplorer.name+" UTXO Raw :"+JSON.stringify(response));

            var unspent = [];

            for(i=0;i<response.length;i++){
                var tempRemote = response[i];

                var tempTx = { tx: tempRemote.txid , amount: tempRemote.amount, n: tempRemote.vout, confirmations: tempRemote.confirmations };
                unspent[i] = tempTx;
            }
            var dataToReturn = {data : { unspent: unspent}};

            self._relayManager.relayLog("Chain Relay :: " + self._name + " UTXO minified :" + JSON.stringify(dataToReturn));

            callback("success", dataToReturn, passthroughParams);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " : Cannot get UTXO. ");
            callback(new Error("Chain Relay :: " + self._name + " : Cannot get UTXO. "), "", passThroughParams);
        }
    },true, passthroughParams);
}

ZECJaxxCustomRelay.prototype.pushRawTx  = function(hex, callback) {
    var requestString = this._baseUrl + 'rawTransaction';

    this._relayManager.relayLog("Chain Relay :: " + this._name + " pushing raw tx : " + hex);

    $.ajax(requestString, {
        complete: function(ajaxRequest, status) {
			var response;
			var responseText;
            if (status === 'success') {
                response = '{"status": "success"}';
            }
            else {
				responseText = JSON.stringify(ajaxRequest.responseText)
                response = '{"status": "fail" , "message": ' + responseText + '}';
            }
			callback(status, JSON.parse(response));
        },
        contentType: 'application/x-www-form-urlencoded',
        data: "transaction="+ hex,
        type: 'PUT'
    });
}

// *******************************************************
// Some test stubs:
// *******************************************************

ZECJaxxCustomRelay.prototype.getRelayType = function() {
    return 'ZECJaxxCustomRelay';
}

ZECJaxxCustomRelay.prototype.getRelayTypeWithCallback = function(callback, passthroughParams) {
    var relayName = 'ZECJaxxCustomRelay';
	callback("success", relayName, passthroughParams);
	return relayName;
}

ZECJaxxCustomRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'ZECJaxxCustomRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayJaxxCustom = ZECJaxxCustomRelay;
}
