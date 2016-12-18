var BTCBlockrRelay = function() {
    this._baseUrl =  'https://btc.blockr.io/';
    this._name = 'Bitcoin Blockr.io API';
    this._reliable = true;
    this._lastBlock = 0;

    this._relayManager = null;
}

BTCBlockrRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

BTCBlockrRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

BTCBlockrRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

BTCBlockrRelay.prototype.fetchLastBlockHeight = function(callback, passthroughParam) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl+'api/v1/coin/info', function(response, status, passthroughParam) {
        if(response.status == "success"){
            //this._lastBlock = response.data.last_block.nb;
			self.setLastBlockHeight(response.data.last_block.nb);
            self._relayManager.relayLog("Chain Relay :: Updated blockr height: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
			// @Note: Potential problem with btcRelays on next line.
            //self._relayManager.relayLog("Chain Relay :: Updated Blockr.io height: " + this._lastBlock);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: No connection with " + this._name + ". Setting height to 0");
            self._lastBlock = 0;
        }

        callback(status, passthroughParam);
    }, true, passthroughParam);
}


BTCBlockrRelay.prototype.checkCurrentHeightForAnomalies = function() {
    if(this._lastBlock == 0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

//@note: this takes in an array of addresses.
BTCBlockrRelay.prototype.getTxList = function(addresses, callback) {
    this._relayManager.relayLog("Chain Relay :: " + this._name+ " :: Requested txlist for :: " + addresses);

    var self = this;
    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/txs/' + addresses, function(response, status, passthroughParams) {
        var returnTxList = null;

        if (status==='error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with " + self._name);

            callback(status, returnTxList);
        } else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx List Raw response:"+JSON.stringify(response));

            var passthrough = {response: response, callback: callback, addressList: passthroughParams};

            RequestSerializer.getJSON(self._baseUrl + 'api/v1/address/unconfirmed/ '+ addresses, function (response, status, passthrough) {
                if (status === 'error'){
                    self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with "+ self._name);
                } else {
                    self._relayManager.relayLog("Chain Relay :: " + self._name+ " Tx List (unconfirmed) Raw response:" + JSON.stringify(response));

                    returnTxList = self.getTxListParse(passthrough.response, response);
                }

                callback(status, returnTxList);

//                    console.log(passthrough.response)
//                    console.log(passthrough.response.data)
            }, true, passthrough);
        }
    }, true, addresses);
}

BTCBlockrRelay.prototype.getTxListParse = function(primaryTXListData, unconfirmedTXListData) {
    var txListForAddresses = [];

    for (var addrIdx = 0; addrIdx < primaryTXListData.data.length; addrIdx++) {
        var curAddrData = primaryTXListData.data[addrIdx];

        var curAddress = curAddrData.address;

        var txListItems = [];

        for ( i = 0; i < curAddrData.txs.length; i++) {
            var txItem = curAddrData.txs[i];

            txListItems.push({
//                amount: txItem.amount.toString(),
//                confirmations: txItem.confirmations,
//                time_utc: parseInt(new Date(txItem.time_utc).getTime()) / 1e3,
                txHash: txItem.tx
            })
        }

        var newTxList = {
            address: curAddress,
            txs: txListItems,
            unconfirmed: unconfirmedTXListData
        }

        txListForAddresses.push(newTxList);
    }

//    console.log(txList);
    return {data: txListForAddresses};
}

BTCBlockrRelay.prototype.getTxCount = function(addresses, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: Requested txCount for :: " + addresses);

    var requestString = this._baseUrl + 'api/v1/address/txs/' + addresses + "?unconfirmed=1";

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function (response,status) {
        var txCount = -1;

        if (status === 'error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with "+ this._name);
        } else {
            var txCount = 0;

            for (var i = 0; i < response.data.length; i++) {
                txCount += response.data[i].nb_txs;
            }
        }

        callback(status, txCount);

            //@note: @here: unconfirmed transactions doesn't have a multi-address check.

//            var passthroughParams = {txCount: txCount};
//
//            self._relayManager.relayLog("Chain Relay :: " + self._name + " :: (confirmed) txCount :: " + txCount);
//
//            var requestString = this._baseUrl + 'api/v1/address/unconfirmed/' + addresses;
//
//            this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);
//
//            RequestSerializer.getJSON(requestString, function (response, status, passthroughParams) {
//                if (status==='error'){
//                    self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with "+self._name);
//                } else {
//                    console.log("found response :: " + JSON.stringify(response));
//                }
//
////                else if(response.data.unconfirmed){
////                    passthroughParams.txCount += response.data.unconfirmed.length;
////                    self._relayManager.relayLog("Chain Relay :: " + this._name+" (unconfirmed) Tx Count :"+txCount);
////                }
////                else{
////                    self._relayManager.relayLog("Chain Relay :: " + self._name + "Cannot get tx count (unconfirmed)");
////                }
//
//                callback(status, passthroughParams.txCount);
//            }, true, passthroughParams);
//        } else {
//            self._relayManager.relayLog("Chain Relay :: " + self._name + "Cannot get tx count (confirmed)");
//
//            callback(status, txCount);
//        }
    }, true);
}

BTCBlockrRelay.prototype.getTxDetails = function(txHash, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested tx details for "+txHash);
    // RequestSerializer.getJSON('https://btc.blockr.io/api/v1/tx/info/5a4cae32b6cd0b8146cbdf32dd746ddc42bdec89c574fa07b204ddea36549e65?amount_format=string', function(){console.log(arugments)})

    RequestSerializer.getJSON(this._baseUrl+'api/v1/tx/info/'+txHash+'?amount_format=string', function (response,status) {
        var txDetails = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+ self._name);
        }
        else {

            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Details Raw response:" + JSON.stringify(response));

            txDetails = self.getTxDetailsParse(response);
//            console.log(passthrough.response.data);
        }

        callback(status, txDetails);
    },true);
}

BTCBlockrRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
    var txArray = [];
    var dataArray = [];

    if (Array.isArray(primaryTxDetailData.data)) {
        dataArray = primaryTxDetailData.data;
    } else {
        dataArray = [primaryTxDetailData.data];
    }

    for (var i = 0; i < dataArray.length; i++) {
        var curData = dataArray[i];

        var outputs = [];
        var inputs = [];

        for (var j = 0; j < curData.vouts.length; j++) {
            var output = curData.vouts[j];

            outputs.push({

                address: output.address,
                amount: output.amount,
                index: j,
                spent: (output.is_spent === 1),
                standard: !(output.is_nonstandard),
            });
        }


        for (var j = 0; j < curData.vins.length; j++) {
            var input = curData.vins[j];

            inputs.push({

                address: input.address,
                amount: input.amount,
                index: j,
                previousTxid: input.vout_tx,
                previousIndex: input.n,
                standard: !(output.is_nonstandard),
            });
        }

        var tx = {
            txid: curData.tx,
            block: curData.block,
            confirmations: curData.confirmations,
            time_utc: parseInt(new Date(curData.time_utc).getTime()) / 1e3,
            inputs: inputs,
            outputs: outputs
        }

        txArray.push(tx);
    }

    return txArray;
}

BTCBlockrRelay.prototype.getAddressBalance = function(address, callback) {
    var self = this;

    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/info/' + address , function (response,status) {
        var balance = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

            balance = response.data.balance
        }

        callback(status, balance);
    });
}

BTCBlockrRelay.prototype.getFixedBlockHeight = function( address, callback ) {
    var self = this

    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/info/' + address , function (response,status) {

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(response));

            var setBlockHeight = response.data.first_tx.block_nb;
            callback(parseInt(setBlockHeight));
//            console.log( self._name + " :: " + setBlockHeight);

        }
    });
}

BTCBlockrRelay.prototype.getUTXO = function(address, callback) {
    if (!callback) { throw new Error('missing callback'); }
    var url=this._baseUrl+'api/v1/address/unspent/'+address+'?unconfirmed=1';
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address + " :: url :: " + url);
	var self = this;
    RequestSerializer.getJSON(url, function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(new Error("Chain Relay :: Cannot get txCount: No connection with "+ self._name));
        }
        else if (response.data){
            //self._relayManager.relayLog("Chain Relay :: " + btcRelays.blockr.name+" UTXO Raw :"+JSON.stringify(response.data.unspent));

            var unspent = [];

            for(i=0;i<response.data.unspent.length;i++){
                var tempRemote = response.data.unspent[i];
                var tempTx = { tx: tempRemote.tx , amount: tempRemote.amount, n: tempRemote.n, confirmations: tempRemote.confirmations };
                unspent[i] = tempTx;
            }
            var dataToReturn = {data : { unspent: unspent}};

            self._relayManager.relayLog("Chain Relay :: " + self._name+" UTXO minified :"+JSON.stringify(dataToReturn));

            callback("success", dataToReturn);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" : Cannot get UTXO. ");
            callback(new Error("Chain Relay :: " + self._name + " : Cannot get UTXO. "));
        }
    },true);
}

BTCBlockrRelay.prototype.pushRawTx = function(hex, callback) {
//    this._relayManager.relayLog("Chain Relay :: " + this._name+ " pushing raw tx : " + hex);
    $.ajax(this._baseUrl+'api/v1/tx/push', {
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
        data: '{"hex": "' + hex + '"}',
        type: 'POST'
    });

    //@note: @todo: @here: @next: figure out why this works and the helper doesn't.

//    var urlToCall = this._baseUrl + 'api/v1/tx/push';
//    var dataToSend = '{"hex":"' + encodeURIComponent(hex) + '"}';
//
//    BTCRelayHelper.pushRawTx(this._name, urlToCall, dataToSend, callback, null);
}

// *******************************************************
// Some test stubs:
// *******************************************************

BTCBlockrRelay.prototype.getRelayType = function() {
	return 'BTCBlockrRelay';
}

BTCBlockrRelay.prototype.getRelayTypeWithCallback = function(callback) {
	var relayName = 'BTCBlockrRelay';
	callback("success", relayName);
	return relayName;
}

BTCBlockrRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'BTCBlockrRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockr = BTCBlockrRelay;
}
