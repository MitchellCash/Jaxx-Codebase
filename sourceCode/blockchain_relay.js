var BTCBlockChainRelay = function() {
    this._baseUrl = "https://blockchain.info/";
    this._name = "Blockchain.info API";
    this._reliable = "true";
    this._lastBlock = 0;

    this._relayManager = null;
}

BTCBlockChainRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

BTCBlockChainRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

BTCBlockChainRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

BTCBlockChainRelay.prototype.fetchLastBlockHeight  = function(callback, passthroughParam) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl + 'q/getblockcount/', function(response, status, passthroughParam) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: No connection with " + this._name + ". Setting height to 0");
            self._lastBlock=0;
        }
        else {
            //this._lastBlock = response;
            //self._relayManager.relayLog("Chain Relay :: Updated Blockchain.info height: " + self._lastBlock);
			self.setLastBlockHeight(response);
            self._relayManager.relayLog("Chain Relay :: Updated Blockchain.info height: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
        }

        callback(status, passthroughParam);
    },true, passthroughParam);
}

BTCBlockChainRelay.prototype.checkCurrentHeightForAnomalies  = function() {
    if(this._lastBlock==0 || typeof this._lastBlock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}

BTCBlockChainRelay.prototype.getTxList = function(addresses, callback) {
    var self = this;
    //this._relayManager.relayLog("Chain Relay :: " + btcRelays.blockchain.name+" - Requested txlist for "+address);

    var formattedAddresses = addresses.join('|');
    var requestString = this._baseUrl + 'multiaddr?active=' + formattedAddresses;
//    var requestString = 'http://cors.io/?u=' + this._baseUrl + 'multiaddr?active=' + formattedAddresses;

    //@note: @here: @todo: this is still a wip, cors is offline at the moment.
    console.log("relay :: " + this._name + " :: requesting :: " + requestString);
	// 'address'
    RequestSerializer.getJSON(requestString, function(response, status) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with " + self._name + " :: response :: " + JSON.stringify(response));
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx List Raw response:" + JSON.stringify(response));
            //@note: @here: @todo:
            returnTxList = {};
        }

        callback(status, returnTxList);
    },true);
}

BTCBlockChainRelay.prototype.getUTXO = function(address, callback) {
    if (!callback) { throw new Error('missing callback'); }
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address);
	var self = this;
    RequestSerializer.getJSON('http://cors.io/?u='+this._baseUrl+'unspent?active='+address, function (response,status) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(new Error("Chain Relay :: Cannot get txCount: No connection with " + self._name));
        }
        else if(response.unspent_outputs){
            self._relayManager.relayLog("Chain Relay :: " + self._name+" UTXO Raw :"+JSON.stringify(response));

            var unspent = [];

            for(i=0;i<response.unspent_outputs.length;i++){
                var tempRemote = response.unspent_outputs[i];
                var tempTx = { tx: tempRemote.tx_hash , amount: HDWalletHelper.convertSatoshisToBitcoins(tempRemote.value), n: tempRemote.tx_output_n, confirmations: tempRemote.confirmations };
                unspent[i] = tempTx;
            }
            var dataToReturn = {data : { unspent: unspent}};


            self._relayManager.relayLog("Chain Relay :: " + self._name+" UTXO minified :"+JSON.stringify(dataToReturn));

            callback("success", dataToReturn);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" : Cannot get UTXO. ");
            callback(new Error("Chain Relay :: " + self._name+" : Cannot get UTXO. "));
        }
    },true);
}

BTCBlockChainRelay.prototype.getTxCount = function(address, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested txCount for "+address);
    RequestSerializer.getJSON('http://cors.io/?u='+this._baseUrl+'address/'+address+'?format=json', function (response,status) {
        var txCount = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount: No connection with "+ self._name);
        } else if (response.n_tx){
            txCount = response.n_tx;
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Count :"+txCount);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" : Cannot get Tx count. ");
        }

        callback(status, txCount);
    },true);
}

BTCBlockChainRelay.prototype.getTxDetails = function(txHash, callback) {
    var self = this;

    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested tx details for "+txHash);
    RequestSerializer.getJSON(this._baseUrl+'rawtx/'+txHash+'?format=json&cors=true', function (response,status) {
        var txDetails = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+ this._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Details Raw response:"+JSON.stringify(response));

            //@note: @todo: @next:
            txDetails = 0;
            //TODO @@parse the tx in this form
            //TX OBJECT :
            //transaction.tx (id)
            //transaction.confirmations
            //transaction.block
            //transaction.time_utc

            //transaction.vouts []
            //transaction.vouts.is_spent
            //transaction.vouts.address
            //transaction.vouts.is_nonstandard
            //transaction.vouts.amount (BTC)
            //transaction.vouts.address

            //transaction.vins []
            //transaction.vins.address
            //transaction.vins.amount (btc)
            //transaction.vins.vout_tx
            //transaction.vins.n

        }

        callback(status, txDetails);
    },true);
}

BTCBlockChainRelay.prototype.getAddressBalance = function(address, callback) {
    var self = this;

    //@note: @here: @todo: /address/...?format=json&cors=true doesn't work.
    //@note: @todo: @next: disable round robin for failed requests.
//    'http://cors.io/?u='+
    RequestSerializer.getJSON('http://cors.io/?u='+this._baseUrl+'address/'+address+'b?format=json', function (response) {
        var status = "error";
        var balance = -1;

        var val = parseFloat(response);
        console.log("got :: " + JSON.stringify(response) + " :: val :: " + val + " :: isNaN :: " + isNaN(val));

        if (isNaN(val) === true) {
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        } else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

            status = 'success';
            balance = val / 100000000;
        }

        callback(status, balance);
    }, true);
}

BTCBlockChainRelay.prototype.pushRawTx = function(hex, callback) {
//    this._relayManager.relayLog("Chain Relay :: " + this._name+ " pushing raw tx : " + hex);
//    $.ajax(this._baseUrl+'pushtx?cors=true', {
//        complete: function(ajaxRequest, status) {
//            var response;
//			var responseText;
//            if (status === 'success') {
//                response = '{"status": "success"}';
//            }
//            else {
//                responseText = JSON.stringify(ajaxRequest.responseText)
//				response = '{"status": "fail" , "message": ' + responseText + '}';
//            }
//            callback(JSON.parse(response));
//        },
//        contentType: 'application/x-www-form-urlencoded',
//        data: "tx="+ hex,
//        type: 'POST'
//    });
    var urlToCall = this._baseUrl+'pushtx?cors=true';
    var dataToSend = "tx=" + hex;

    BTCRelayHelper.pushRawTx(this._name, urlToCall, dataToSend, callback, null);
}

// *******************************************************
// Some test stubs:
// *******************************************************

BTCBlockChainRelay.prototype.getRelayType = function() {
	return 'BTCBlockChainRelay';
}

BTCBlockChainRelay.prototype.getRelayTypeWithCallback = function(callback) {
	var relayName = 'BTCBlockChainRelay';
	callback("status", relayName);
	return relayName;
}

BTCBlockChainRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'BTCBlockChainRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockChainInfo = BTCBlockChainRelay;
}
