var BTCBlockExplorerRelay = function() {
    this._baseUrl = "https://blockexplorer.com/";
    this._name = "Blockexplorer.com API";
    this._reliable = "true";
    this._lastBlock = 0;

    this._relayManager = null;
}

BTCBlockExplorerRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

BTCBlockExplorerRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

BTCBlockExplorerRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

BTCBlockExplorerRelay.prototype.fetchLastBlockHeight  = function(callback, passthroughParam) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl + 'api/status?q=getBlockCount', function (response, status, passthroughParam) {
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

        callback(status, passthroughParam);
    }, true, passthroughParam);
}

BTCBlockExplorerRelay.prototype.checkCurrentHeightForAnomalies  = function() {
    if(this._lastBlock ==0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

BTCBlockExplorerRelay.prototype.getTxList  = function(address, callback) {
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested txlist for "+address);

    var self = this,
        passthrough = {};

    RequestSerializer.getJSON(this._baseUrl + 'api/txs/?address=' + address, function (response, status) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with "+ this._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + this._name + " Tx List Raw response:"+JSON.stringify(response));

            returnTxList = self.getTxListParse(response);
//            console.log(passthrough.response)
        }

        callback(status, returnTxList);
    },true);
}

BTCBlockExplorerRelay.prototype.getTxListParse = function(primaryTxDetailData) {
    var txListItems = [];

    for ( i = 0; i < primaryTxDetailData.txs.length; i++) {
        var txItem = primaryTxDetailData.txs[i];

        txListItems.push({
            amount: txItem.valueIn.toString(),
            confirmations: txItem.confirmations,
            time_utc: txItem.time,
            txHash: txItem.txid
        })
    }

    var txList = {
        txList: txListItems
    }

//    console.log(txList)
    return txList
}

BTCBlockExplorerRelay.prototype.getTxCount  = function(address, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested txCount for "+address);
    RequestSerializer.getJSON(this._baseUrl+'api/txs/?address='+address, function (response,status) {
        var txCount = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with "+ this._name);
        }
        else if(response.txs.length) {
            txCount = response.txs.length;
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Count :"+txCount);
        }
        else{
            self._relayManager.relayLog("Chain Relay :: " + self._name+" cannot get Tx Count ");
        }

        callback(status, txCount);
    },true);
}

BTCBlockExplorerRelay.prototype.getTxDetails  = function(txHash, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested tx details for "+txHash);
    console.log(this._baseUrl+'api/tx/'+txHash);

    RequestSerializer.getJSON(this._baseUrl+'api/tx/'+txHash, function (response,status) {
//        console.log("response :: " + JSON.stringify(response) + " :: status :: " + status);
        var txDetails = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Details Raw response:"+JSON.stringify(response));

            txDetails = self.getTxDetailsParse(response);
        }

        callback(status, txDetails);
    },true);
}

BTCBlockExplorerRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
//    console.log(primaryTxDetailData)

    var outputs = [],
        input = [];

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

    input.push({
        address: primaryTxDetailData.vin[0].addr,
        amount: primaryTxDetailData.vin[0].value.toString(),
        previousTxid: primaryTxDetailData.vin[0].txid,
        previousIndex: primaryTxDetailData.vin[0].vout,
        standard: !(primaryTxDetailData.vin[0].scriptSig === 'null')
    })

    var tx = {
        txid: primaryTxDetailData.txid,
        block: primaryTxDetailData.blockheight,
        confirmations: primaryTxDetailData.confirmations,
        time_utc: primaryTxDetailData.time,
        inputs: input,
        outputs: outputs

    }
    console.log(tx)
    return tx;
}

BTCBlockExplorerRelay.prototype.getAddressBalance = function(address, callback) {

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

BTCBlockExplorerRelay.prototype.getFixedBlockHeight = function( address, callback ) {
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

BTCBlockExplorerRelay.prototype.getUTXO  = function(address, callback) {
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

BTCBlockExplorerRelay.prototype.pushRawTx  = function(hex, callback) {
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

BTCBlockExplorerRelay.prototype.getRelayType = function() {
	return 'BTCBlockExplorerRelay';
}

BTCBlockExplorerRelay.prototype.getRelayTypeWithCallback = function(callback) {
	var relayName = 'BTCBlockExplorerRelay';
	callback("success", relayName);
	return relayName;
}

BTCBlockExplorerRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'BTCBlockExplorerRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockExplorer = BTCBlockExplorerRelay;
}
