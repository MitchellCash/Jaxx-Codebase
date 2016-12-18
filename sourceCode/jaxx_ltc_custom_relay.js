var LTCJaxxCustomRelay = function() {
    this._baseUrl = "https://api.jaxx.io/api/ltc/";
    this._getTxListPrepend = 'transactions/';
    this._getTxListAppend = '';
    this._getTxDetailsPrepend = 'transactionParams/';
    this._getTxDetailsAppend = '';
    this._getAccountBalancePrepend = 'balance/';
    this._getAccountBalanceAppend = '';
    this._name = "Jaxx Litecoin Custom API";
    this._reliable = "true";
    this._lastBlock = 0;

    this._relayManager = null;
}

LTCJaxxCustomRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

LTCJaxxCustomRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

LTCJaxxCustomRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

LTCJaxxCustomRelay.prototype.fetchLastBlockHeight  = function(callback, passthroughParams) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl + 'status?q=getBlockCount', function (response, status, passthroughParams) {
        if(status === 'error'){
            self._relayManager.relayLog("Chain Relay :: No connection with " + this._name + ". Setting height to 0");
            self._lastBlock = 0;
        }
        else {
            //this._lastBlock = response.blockcount;
            //self._relayManager.relayLog("Chain Relay :: Updated blockrexplorer.com height: " + this._lastBlock);
			self.setLastBlockHeight(response.blockcount);
            self._relayManager.relayLog("Chain Relay :: Updated blockexplorer height: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
        }

        callback(status, passthroughParams);
    }, true, passthroughParams);
}

LTCJaxxCustomRelay.prototype.checkCurrentHeightForAnomalies  = function() {
    if(this._lastBlock ==0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

//@note: @here: this is using insight.io, which has the issue with the transactions not being associated to the proper addresses if using multiple.

LTCJaxxCustomRelay.prototype.getTxList  = function(addresses, callback) {
    this._relayManager.relayLog("Chain Relay :: " + this._name+ " - Requested txlist for " + addresses);

    var self = this;

    var passthroughParams = {addresses: addresses};

    var requestString = this._baseUrl + this._getTxListPrepend + addresses + this._getTxListAppend;

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function(response, status, passthroughParams) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with "+ this._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx List Raw response:" + JSON.stringify(response));

            returnTxList = self.getTxListParse(response, passthroughParams);
//            console.log(passthrough.response)
        }

        callback(status, returnTxList);
    }, true, passthroughParams);
}

LTCJaxxCustomRelay.prototype.getTxListParse = function(primaryTxListData, passthroughParams) {
    var returnData = {data: []};

    var allKeys = Object.keys(primaryTxListData);

    var txListForAddresses = [];

    for (var i = 0; i < allKeys.length; i++) {
        var newTxList = {
            address: allKeys[i],
            txs: primaryTxListData[allKeys[i]],
            unconfirmed: {}
        };

        txListForAddresses.push(newTxList);
    }

    returnData.data = txListForAddresses;

    return returnData;
}

LTCJaxxCustomRelay.prototype.getTxCount  = function(addresses, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested txCount for :: " + addresses);

    var requestString = this._baseUrl + 'addrs/' + addresses + "/txs";

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function (response,status) {
        var txCount = -1;

        if (status === 'error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with " + self._name);
        } else {
            txCount = response.totalItems;
//            console.log("found :: " + JSON.stringify(response));
        }
//        else if(response.txs.length) {
//            txCount = response.txs.length;
//            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Count :"+txCount);
//        }
//        else{
//            self._relayManager.relayLog("Chain Relay :: " + self._name+" cannot get Tx Count ");
//        }

        callback(status, txCount);
    },true);
}

LTCJaxxCustomRelay.prototype.getTxDetails  = function(txHashes, callback) {
    console.log("LTCJaxxCustomRelay :: getTxDetails :: currently unimplemented");
//    var self = this;
//
//    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested tx details for :: " + txHashes);
//
//    var txDetailsStatus = {numHashesTotal: txHashes.length, numHashesProcessed: 0, allHashes: txHashes, numHashRequestsSucceeded: 0, allTxDetails: []};
//
//    for (var i = 0; i < txHashes.length; i++) {
//        var curHash = txHashes[i];
//
//        var requestString = this._baseUrl + 'tx/' + curHash;
//
//        this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);
//
//        var passthroughParams = {curHash: curHash, txDetailsStatus: txDetailsStatus};
//
//        RequestSerializer.getJSON(requestString, function (response, status, passthroughParams) {
//            //        console.log("response :: " + JSON.stringify(response) + " :: status :: " + status);
//            if (status==='error') {
//                self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+ self._name);
//            } else {
//
//                self._relayManager.relayLog("Chain Relay :: " + self._name + " :: Tx Details Raw response :: " + JSON.stringify(response));
//
//                var txDetails = self.getTxDetailsParse(response);
//
//                passthroughParams.txDetailsStatus.numHashRequestsSucceeded++;
//                passthroughParams.txDetailsStatus.numHashesProcessed++;
//                passthroughParams.txDetailsStatus.allTxDetails.push(txDetails);
//
//                if (passthroughParams.txDetailsStatus.numHashesProcessed === passthroughParams.txDetailsStatus.numHashesTotal) {
//                    var finalStatus = "success";
//
//                    if (passthroughParams.txDetailsStatus.numHashRequestsSucceeded !== passthroughParams.txDetailsStatus.numHashesTotal) {
//                        finalStatus = "error";
//                    }
//
//                    passthroughParams.txDetailsStatus.allTxDetails.sort(function(a, b) {
//                       return a.txid > b.txid;
//                    });
//
//                    callback(finalStatus, passthroughParams.txDetailsStatus.allTxDetails);
//                }
//            }
//        }, true, passthroughParams);
//    }
}

LTCJaxxCustomRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
//    console.log(primaryTxDetailData)

    var outputs = [];
    var inputs = [];

    for (i = 0; i < primaryTxDetailData.vout.length; i++) {
        var output = primaryTxDetailData.vout[i];

        outputs.push({
            address: output.scriptPubKey.addresses[0],
            amount: output.value,
            index: i,
            spent: !(output.spentTxId === 'null'),
            standard: !(primaryTxDetailData.vin[0].scriptPubKey === 'null')
        });
    }

    for (i = 0; i < primaryTxDetailData.vin.length; i++) {
        var input = primaryTxDetailData.vin[i];

        inputs.push({
            address: input.addr,
            amount: parseFloat(-input.value).toFixed(8),
            index: i,
            previousTxid: input.txid,
            previousIndex: input.vout,
            standard: !(input.scriptSig === 'null')
        })
    }

    var tx = {
        txid: primaryTxDetailData.txid,
        block: primaryTxDetailData.blockheight,
        confirmations: primaryTxDetailData.confirmations,
        time_utc: primaryTxDetailData.time,
        inputs: inputs,
        outputs: outputs

    }
//    console.log(tx)
    return tx;
}

LTCJaxxCustomRelay.prototype.getAddressBalance = function(address, callback) {

    var self = this;

    RequestSerializer.getJSON(this._baseUrl + 'api/addr/' + address , function (response,status) {
        var balance = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

            balance = response.balance;
        }

        callback(status, balance);
    });
}

LTCJaxxCustomRelay.prototype.getFixedBlockHeight = function( address, callback ) {
    var self = this;

    RequestSerializer.getJSON(this._baseUrl + 'api/txs/?address=' + address , function (response,status) {

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
        }
        else {
            var setBlockHeight = response.txs[1].blockheight;

            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(setBlockHeight));

            callback(setBlockHeight)
//            console.log(self._name + "  :: " + setBlockHeight);

        }
    });
}

LTCJaxxCustomRelay.prototype.getUTXO  = function(address, callback) {
    if (!callback) { throw new Error('missing callback'); }
    var url=this._baseUrl+'api/addr/'+address+'/utxo';
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address + " :: url :: " + url);
	var self = this;

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

            callback("success", dataToReturn);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " : Cannot get UTXO. ");
            callback(new Error("Chain Relay :: " + self._name + " : Cannot get UTXO. "));
        }
    },true);
}

LTCJaxxCustomRelay.prototype.pushRawTx  = function(hex, callback) {
//    this._relayManager.relayLog("Chain Relay :: " + this._name+ " pushing raw tx : " + hex);
//    $.ajax(this._baseUrl+'api/tx/send', {
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
//			callback(status, JSON.parse(response));
//        },
//        contentType: 'application/x-www-form-urlencoded',
//        data: "rawtx="+ hex,
//        type: 'POST'
//    });
    var urlToCall = this._baseUrl + 'api/tx/send';
    var dataToSend = "rawtx=" + hex;

    BTCRelayHelper.pushRawTx(this._name, urlToCall, dataToSend, callback, null);
}

// *******************************************************
// Some test stubs:
// *******************************************************

LTCJaxxCustomRelay.prototype.getRelayType = function() {
    return 'LTCJaxxCustomRelay';
}

LTCJaxxCustomRelay.prototype.getRelayTypeWithCallback = function(callback) {
    var relayName = 'LTCJaxxCustomRelay';
	callback("success", relayName);
	return relayName;
}

LTCJaxxCustomRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'LTCJaxxCustomRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayJaxxCustom = LTCJaxxCustomRelay;
}
