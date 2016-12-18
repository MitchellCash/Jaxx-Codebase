var BTCJaxxInsightRelay = function() {
    this._baseUrl = "http://api.jaxx.io:2082/insight-api/";
    this._name = "Jaxx Bitcoin Insight API";
    this._reliable = "true";
    this._lastBlock = 0;
    this._relayManager = null;
    this._forceThisRelayToFail = false; // This is for testing purposes.
}

BTCJaxxInsightRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

BTCJaxxInsightRelay.prototype.isForceThisRelayToFail = function(){
    return this._forceThisRelayToFail;
}

BTCJaxxInsightRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

BTCJaxxInsightRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

BTCJaxxInsightRelay.prototype.fetchLastBlockHeight  = function(callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: fetchLastBlockHeight :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", passthroughParams);
        }, 100);

        return;
    }

    var self = this;

	this._relayManager.relayLog("Fetching the block height for " + this._name);

    RequestSerializer.getJSON(this._baseUrl + 'status?q=getBlockCount', function(response, status, passthroughParams) {
        if (status === 'error'){
            self._relayManager.relayLog("Chain Relay :: No connection with " + this._name + ". Setting height to 0");
            self._lastBlock = 0;
        }
        else {
            //this._lastBlock = response.blockcount;
            //self._relayManager.relayLog("Chain Relay :: Updated blockrexplorer.com height: " + this._lastBlock);
			self.setLastBlockHeight(response.info.blocks);
            self._relayManager.relayLog("Chain Relay :: Updated :: " + self._name + " :: height: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
        }

        callback(status, passthroughParams);
    }, true, passthroughParams);
}

BTCJaxxInsightRelay.prototype.checkCurrentHeightForAnomalies  = function() {
    if(this._lastBlock ==0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

//@note: @here: this is using insight.io, which has the issue with the transactions not being associated to the proper addresses if using multiple.

BTCJaxxInsightRelay.prototype.getTxList = function(addresses, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

    this._relayManager.relayLog("Chain Relay :: " + this._name+ " - Requested txlist for " + addresses);

    var self = this;

    var passthroughAddresses = {addresses: addresses};

    var requestString = this._baseUrl + 'addrs/' + addresses + "/txs?group=1";
    //


    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function(response, status, passthroughAddresses) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with "+ this._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx List Raw response:" + JSON.stringify(response));

            returnTxList = self.getTxListParse(response, passthroughAddresses);
            //            console.log(passthrough.response)
        }

        self._relayManager.relayLog("relay :: " + this._name + " :: getTxList :: Request Serializer :: " + JSON.stringify(response));

        callback(status, returnTxList, passthroughParams);
    }, true, passthroughAddresses);
}

BTCJaxxInsightRelay.prototype.getTxListParse = function(primaryTxDetailData, passthroughParams) {
    var txListForAddresses = [];
    var inputDataByAddress = primaryTxDetailData['byAddress'];
    var keysAddresses = Object.keys(inputDataByAddress); // ie. ['1NoMhneypFEt2VvPBkn8cUXxb7vhhUBKLE', '156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve']
    for (var i = 0; i < keysAddresses.length; i++){
        var currentAddress = keysAddresses[i]; // ie. 1NoMhneypFEt2VvPBkn8cUXxb7vhhUBKLE
        var outputDataAddress = {};
        outputDataAddress['address'] = currentAddress;
        outputDataAddress['txs'] = [];
        var inputDataCurrentAddressArray = inputDataByAddress[currentAddress];
        for (var j = 0; j < inputDataCurrentAddressArray.length; j++){
            var txid = inputDataCurrentAddressArray[j]['txid']; // ie. bc7597f3f0c170cb8966dc37250eca1b8dab169702299c464b3a82185c2227e7
            outputDataAddress['txs'].push({'txHash' : txid});
        }
        outputDataAddress['unconfirmed'] = {};
        txListForAddresses.push(outputDataAddress);
    }
    return {data : txListForAddresses};
}

BTCJaxxInsightRelay.prototype.getTxCount = function(addresses, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxCount :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", 0, passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested txCount for :: " + addresses);

    var requestString = this._baseUrl + 'addrs/' + addresses + "/txs";

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function(response,status) {
        var txCount = -1;
        if (status === 'error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with " + self._name);
        } else {
            txCount = response.totalItems;
            //            console.log("found :: " + JSON.stringify(response));
        }

        callback(status, txCount, passthroughParams);
    },true);
}

BTCJaxxInsightRelay.prototype.getTxDetails  = function(txHashes, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxDetails :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", [], passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: requested tx details for :: " + txHashes);

    var txDetailsStatus = {numHashesTotal: txHashes.length, numHashesProcessed: 0, allHashes: txHashes, numHashRequestsSucceeded: 0, allTxDetails: []};

    for (var i = 0; i < txHashes.length; i++) {
        var curHash = txHashes[i];

        var requestString = this._baseUrl + 'tx/' + curHash;

        this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

        var passthroughTxDetails = {curHash: curHash, txDetailsStatus: txDetailsStatus};

        RequestSerializer.getJSON(requestString, function (response, status, passthroughTxDetails) {
            passthroughTxDetails.txDetailsStatus.numHashesProcessed++;

            if (status === 'error') {
                self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with " + self._name);
            } else {
                self._relayManager.relayLog("Chain Relay :: " + self._name + " :: Tx Details Raw response :: " + JSON.stringify(response));

                var txDetails = self.getTxDetailsParse(response);

                passthroughTxDetails.txDetailsStatus.numHashRequestsSucceeded++;
                passthroughTxDetails.txDetailsStatus.allTxDetails.push(txDetails);
            }

            if (passthroughTxDetails.txDetailsStatus.numHashesProcessed === passthroughTxDetails.txDetailsStatus.numHashesTotal) {
                var finalStatus = "success";

                if (passthroughTxDetails.txDetailsStatus.numHashRequestsSucceeded !== passthroughTxDetails.txDetailsStatus.numHashesTotal) {
                    finalStatus = "error";
                }

                passthroughTxDetails.txDetailsStatus.allTxDetails.sort(function(a, b) {
                    return a.txid > b.txid;
                });

                callback(finalStatus, passthroughTxDetails.txDetailsStatus.allTxDetails, passthroughParams);
            }
        }, true, passthroughTxDetails);
    }
}

BTCJaxxInsightRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
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

BTCJaxxInsightRelay.prototype.getAddressBalance = function(address, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getAddressBalance :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", 0, passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    var requestString = this._baseUrl + 'addr/' + address + '/balance';

    RequestSerializer.getJSON(requestString, function (response,status) {
        var balance = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

            balance = parseInt(response)/100000000.0;
        }
        callback(status, balance, passthroughParams);
    });
}

BTCJaxxInsightRelay.prototype.getFixedBlockHeight = function(address, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getFixedBlockHeight :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", -1, passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    RequestSerializer.getJSON(this._baseUrl + 'api/txs/?address=' + address , function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
            callback(-1, passthroughParams);
        }
        else {
            var setBlockHeight = response.txs[1].blockheight;

            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(setBlockHeight));

            callback(setBlockHeight, passthroughParams);
            //            console.log(self._name + "  :: " + setBlockHeight);

        }
    });
}

BTCJaxxInsightRelay.prototype.getUTXO  = function(address, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getUTXO :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

    if (!callback) {
        throw new Error('missing callback');
    }

    var url=this._baseUrl+'api/addr/'+address+'/utxo';
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address + " :: url :: " + url);

	var self = this;

    RequestSerializer.getJSON(url, function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(status, {}, passthroughParams);
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
            callback("error: cannot get utxo", {}, passthroughParams);
        }
    },true);
}

BTCJaxxInsightRelay.prototype.pushRawTx  = function(hex, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: pushRawTx :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

    var requestString = this._baseUrl + 'tx/send';

    this._relayManager.relayLog("Chain Relay :: " + this._name+ " pushing raw tx : " + hex);

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

            callback(status, JSON.parse(response), passthroughParams);
        },
        contentType: 'application/x-www-form-urlencoded',
        data: "rawtx="+ hex,
        type: 'POST'
    });


    // var dataToSend = "rawtx=" + hex;
    /*
    if (this._forceThisRelayToFail) {
        callback("We want this relay to fail.", passthroughParams);
    } else {
        $.ajax(requestString, {
            complete: function(ajaxRequest, status) {
                var response;
                var responseText;
                if (status === 'success') {
                    response = '{"status": "success"}';
                }
                else {
                    responseText = JSON.stringify(ajaxRequest.responseText);
                    response = '{"status": "fail" , "message": ' + responseText + '}';
                }
                callback(status, JSON.parse(response));
            },
            contentType: 'application/x-www-form-urlencoded',
            data: '{"rawtx": "' + hex + '"}',
            type: 'POST'
        });

    }
    */
    //BTCRelayHelper.pushRawTx(this._name, urlToCall, dataToSend, callback, null);
}

// *******************************************************
// Some test stubs:
// *******************************************************

BTCJaxxInsightRelay.prototype.getRelayType = function() {
	return 'BTCJaxxInsightRelay';
}

BTCJaxxInsightRelay.prototype.getRelayTypeWithCallback = function(callback) {
	var relayName = 'BTCJaxxInsightRelay';
	callback("success", relayName);
	return relayName;
}

BTCJaxxInsightRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'BTCJaxxInsightRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockExplorer = BTCJaxxInsightRelay;
}
