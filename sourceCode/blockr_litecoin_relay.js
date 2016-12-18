var LTCBlockrRelay = function() {
    this._baseUrl =  'https://ltc.blockr.io/';
    this._name = 'Litecoin Blockr.io API';
    this._reliable = true;
    this._lastBlock = 0;
    this._relayManager = null;
    this._forceThisRelayToFail = false; // This is for testing purposes.
}

LTCBlockrRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

LTCBlockrRelay.prototype.getLastBlockHeight = function(){
    // This function shares a common interface with the other relays.
    return this._lastBlock;
}

LTCBlockrRelay.prototype.setLastBlockHeight = function(newHeight){
    this._lastBlock = newHeight;
}

LTCBlockrRelay.prototype.fetchLastBlockHeight = function(callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", passthroughParams);
        }, 100);

        return;
    }

    var self = this; // For references inside the callback function.
    this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl+'api/v1/coin/info', function(response, status, passthroughParams) {
        if(response.status == "success"){
            //this._lastBlock = response.data.last_block.nb;
            self.setLastBlockHeight(response.data.last_block.nb);
            self._relayManager.relayLog("Chain Relay :: Updated " + self._name + " :: height :: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
            // @Note: Potential problem with btcRelays on next line.
            //self._relayManager.relayLog("Chain Relay :: Updated Blockr.io height: " + this._lastBlock);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: No connection with " + self._name + ". Setting height to 0");
            self._lastBlock = 0;
        }

        callback(status, passthroughParams);
    }, true, passthroughParams);
}


LTCBlockrRelay.prototype.checkCurrentHeightForAnomalies = function() {
    if(this._lastBlock == 0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

//@note: this takes in an array of addresses.
LTCBlockrRelay.prototype.getTxList = function(addresses, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

    this._relayManager.relayLog("Chain Relay :: " + this._name+ " :: Requested txlist for :: " + addresses);

    var self = this;
    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/txs/' + addresses, function(response, status, addressPassthrough) {
        var returnTxList = null;

        if (status==='error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with " + self._name);

            callback(status, returnTxList, passthroughParams);
        } else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx List Raw response:"+JSON.stringify(response));

            var passthroughFromConfirmed = {response: response, callback: callback, addressList: addressPassthrough};

            RequestSerializer.getJSON(self._baseUrl + 'api/v1/address/unconfirmed/' + addresses, function (response, status, passthrough) {
                if (status === 'error'){
                    self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with " + self._name);
                } else {
                    self._relayManager.relayLog("Chain Relay :: " + self._name+ " Tx List (unconfirmed) Raw response:" + JSON.stringify(response));

                    returnTxList = self.getTxListParse(passthrough.response, response);
                }

                callback(status, returnTxList, passthroughParams);

                //                    console.log(passthrough.response)
                //                    console.log(passthrough.response.data)
            }, true, passthroughFromConfirmed);
        }
    }, true, addresses);
}

LTCBlockrRelay.prototype.getTxListParse = function(primaryTXListData, unconfirmedTXListData) {
    var txDictForAddresses = {};

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
            });
        }

        var newTxList = {
            address: curAddress,
            txs: txListItems,
            unconfirmed: []
        }

        //        var newTxList = {
        //            address: curAddress,
        //            txs: txListItems,
        //            unconfirmed: []
        //        }

        txDictForAddresses[curAddress] = newTxList;
    }

    var appendUnconfirmedTxLists = [];

    for (var addrIdx = 0; addrIdx < unconfirmedTXListData.data.length; addrIdx++) {
        var curAddrData = unconfirmedTXListData.data[addrIdx];

        var curAddress = curAddrData.address;

        var txListItems = [];

        for ( i = 0; i < curAddrData.unconfirmed.length; i++) {
            var txItem = curAddrData.unconfirmed[i];

            txListItems.push({
                //                amount: txItem.amount.toString(),
                //                confirmations: txItem.confirmations,
                //                time_utc: parseInt(new Date(txItem.time_utc).getTime()) / 1e3,
                txHash: txItem.tx
            });
        }

        var regTxList = null;

        if (txDictForAddresses[curAddress] !== 'undefined' &&
            txDictForAddresses[curAddress] !== null) {
            regTxList = txDictForAddresses[curAddress];
        } else {
            regTxList = {
                address: curAddress,
                txs: [],
                unconfirmed: []
            }

            txDictForAddresses[curAddress] = regTxList;
        }

        for (var i = 0; i < txListItems.length; i++) {
            regTxList.txs.push(txListItems[i]);
            regTxList.unconfirmed.push(txListItems[i]);
        }
    }

    var txListForAddresses = [];

    var allKeys = Object.keys(txDictForAddresses);

    for (var i = 0; i < allKeys.length; i++) {
        txListForAddresses.push(txDictForAddresses[allKeys[i]]);
    }
    //    console.log(txList);
    return {data: txListForAddresses};
}

LTCBlockrRelay.prototype.getTxCount = function(addresses, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", -1, passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name + " :: Requested txCount for :: " + addresses);

    var requestString = this._baseUrl + 'api/v1/address/txs/' + addresses + "?unconfirmed=1";

    this._relayManager.relayLog("relay :: " + this._name + " :: requesting :: " + requestString);

    RequestSerializer.getJSON(requestString, function (response,status, passthroughParams) {
        var txCount = -1;

        if (status === 'error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with "+ this._name);
        } else {
            var txCount = 0;

            for (var i = 0; i < response.data.length; i++) {
                txCount += response.data[i].nb_txs;
            }
        }

        callback(status, txCount, passthroughParams);

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
    }, true, passthroughParams);
}

LTCBlockrRelay.prototype.getTxDetails = function(txHash, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested tx details for "+txHash);
    // RequestSerializer.getJSON('https://btc.blockr.io/api/v1/tx/info/5a4cae32b6cd0b8146cbdf32dd746ddc42bdec89c574fa07b204ddea36549e65?amount_format=string', function(){console.log(arugments)})

    var requestString = this._baseUrl + 'api/v1/tx/info/' + txHash + '?amount_format=string';

    RequestSerializer.getJSON(requestString, function (response, status, passthroughParams) {
        var txDetails = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+ self._name);
        }
        else {

            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Details Raw response:" + JSON.stringify(response));

            txDetails = self.getTxDetailsParse(response);
            //            console.log(passthrough.response.data);
        }

        callback(status, txDetails, passthroughParams);
    },true, passthroughParams);
}

LTCBlockrRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
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

LTCBlockrRelay.prototype.getAddressBalance = function(address, callback, passthroughParams) {
    // @Note: For one address the server returns a balance at response.data.balance
    // @Note: For multiple addresses, response.data[i].balance has a balance.
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", -1, passthroughParams);
        }, 100);

        return;
    }

    var self = this;
    // https://ltc.blockr.io/api/v1/address/info/LhGYSWAabViCqsLiGKCwND7aC1yDC9TApd,LYsBRZqfme1hjTYPnxEm8hpYJaDZYZrky8
    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/info/' + address , function (response,status) {
        var balance = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));
            balance = response.data.balance
        }

        callback(status, balance, passthroughParams);
    });
}

LTCBlockrRelay.prototype.getFixedBlockHeight = function(address, callback, passthroughParams) {
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", -1, passthroughParams);
        }, 100);

        return;
    }

    var self = this

    RequestSerializer.getJSON(this._baseUrl + 'api/v1/address/info/' + address , function (response,status) {

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(response));

            var setBlockHeight = response.data.first_tx.block_nb;
            callback(status, parseInt(setBlockHeight), passthroughParams);
            //            console.log( self._name + " :: " + setBlockHeight);

        }
    });
}

LTCBlockrRelay.prototype.getUTXO = function(address, callback, passthroughParams) {
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

    var url = this._baseUrl+'api/v1/address/unspent/'+address+'?unconfirmed=1';
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address + " :: url :: " + url);
    var self = this;

    // https://ltc.blockr.io/api/v1/address/unspent/LcFAosSLzy9TuRRedcLVriVd8938P2o69p,LeL16MDWU5jS3oeHHwEZRBTDExwPbNgcvy?unconfirmed=1 // url: paste this in the browser
    RequestSerializer.getJSON(url, function (response,status, passthroughParams) {
        // "{"status":"success","data":[{"address":"LcFAosSLzy9TuRRedcLVriVd8938P2o69p","unspent":[],"with_unconfirmed":true},{"address":"LeL16MDWU5jS3oeHHwEZRBTDExwPbNgcvy","unspent":[],"with_unconfirmed":true}],"code":200,"message":""}" // ie. response
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(status, "The server returned an error", passthroughParams);
        }
        else if (response.data){
            //self._relayManager.relayLog("Chain Relay :: " + btcRelays.blockr.name+" UTXO Raw :"+JSON.stringify(response.data.unspent));

            var dataToReturn = self.getUTXOParse(response.data);

            self._relayManager.relayLog("Chain Relay :: " + self._name+" UTXO minified :"+JSON.stringify(dataToReturn));

            // test case 1 - assertion -
            callback("success", dataToReturn, passthroughParams);
            // "[{"unspent":[],"address":"LcFAosSLzy9TuRRedcLVriVd8938P2o69p"},{"unspent":[],"address":"LeL16MDWU5jS3oeHHwEZRBTDExwPbNgcvy"}]" // JSON.stringify(dataToReturn) - test case 1
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" : Cannot get UTXO. ");
            callback("error: cannot get utxo", {}, passthroughParams);
        }
    },true, passthroughParams);
}

LTCBlockrRelay.prototype.getUTXOParse = function(responseData){
    var returnData = {};
    if (Array.isArray(responseData)){
        for (var i = 0; i < responseData.length; i++){
            returnData[responseData[i].address] = this.getUTXOParseForOneAddress(responseData[i]);
            //returnData.push(this.getUTXOParseForOneAddress(responseData[i]));
        }
    } else {
        returnData[responseData.address] = this.getUTXOParseForOneAddress(responseData);
        // returnData.push(this.getUTXOParseForOneAddress(responseData));
    }

    return returnData;
}

LTCBlockrRelay.prototype.getUTXOParseForOneAddress = function(responseDataForOneAddress){
    var unspent = [];
    for (var i = 0 ; i < responseDataForOneAddress.unspent.length ; i++){
        var tempRemote = responseDataForOneAddress.unspent[i];
        var tempTx = { txid: tempRemote.tx , amount: tempRemote.amount, index: tempRemote.n, confirmations: tempRemote.confirmations };
        unspent[i] = tempTx;
    }
    return unspent;
}

LTCBlockrRelay.prototype.pushRawTx = function(hex, callback, passthroughParams) {
    //    this._relayManager.relayLog("Chain Relay :: " + this._name+ " pushing raw tx : " + hex);
    if (this._forceThisRelayToFail) {
        this._relayManager.relayLog("Chain Relay :: " + this._name + " :: getTxList :: Forcing Fail");

        setTimeout(function() {
            callback("error: forced error state", {}, passthroughParams);
        }, 100);

        return;
    }

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
            callback(status, JSON.parse(response), passthroughParams);
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

LTCBlockrRelay.prototype.getRelayType = function() {
    return 'LTCBlockrRelay';
}

LTCBlockrRelay.prototype.getRelayTypeWithCallback = function(callback, passthroughParams) {
    var relayName = 'LTCBlockrRelay';
    callback("success", relayName, passthroughParams);
    return relayName;
}

LTCBlockrRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
    var relayName = 'LTCBlockrRelay';
    callback(relayName);
    return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockr = LTCBlockrRelay;
}
