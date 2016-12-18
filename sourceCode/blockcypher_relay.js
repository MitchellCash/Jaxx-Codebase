var BTCBlockcypherRelay = function() {
    this._baseUrl = "https://api.blockcypher.com/";
    this._name = "Blockcypher API";
    this._reliable = "true";
    this._lastBlock = 0; // This is the block height.

    this._relayManager = null;
}

BTCBlockcypherRelay.prototype.initialize = function(relayManager) {
    this._relayManager = relayManager;
}

BTCBlockcypherRelay.prototype.getLastBlockHeight = function(){
	// This function shares a common interface with the other relays.
	return this._lastBlock;
}

BTCBlockcypherRelay.prototype.setLastBlockHeight = function(newHeight){
	this._lastBlock = newHeight;
}

BTCBlockcypherRelay.prototype.fetchLastBlockHeight = function(callback, passthroughParam) {
    var self = this; // For references inside the callback function.
	this._relayManager.relayLog("Fetching the block height for " + this._name);
    RequestSerializer.getJSON(this._baseUrl+'v1/btc/main', function(response, status, passthroughParams) {
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: No connection with "+this._name+". Setting height to 0");
            self._lastBlock=0;
        }
        else {
			self.setLastBlockHeight(response.height);
            self._relayManager.relayLog("Chain Relay :: Updated blockcypher height: " + self.getLastBlockHeight()); // We cannot use 'this' since the function is contained inside a callback.
        }

        callback(status, passthroughParam);
    }, true, passthroughParam);
}

BTCBlockcypherRelay.prototype.checkCurrentHeightForAnomalies = function() {
    if(this._lastblock==0 || typeof this._lastblock == "undefined"){
        this._reliable=false;
    }
    else{
        this._reliable=true;
    }
}


//@note: @here: @todo: blockcypher doesn't do multiple addresses, but does have a wallet api.
BTCBlockcypherRelay.prototype.getTxList = function(addresses, callback) {
    this._relayManager.relayLog("Chain Relay :: " + this._name + " - Requested txlist for " + addresses);

    var self = this;
    RequestSerializer.getJSON(this._baseUrl+'v1/btc/main/addrs/' + addresses, function (response,status) {
        var returnTxList = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txList : No connection with " + self._name);
        } else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx List Raw response:"+JSON.stringify(response));

            returnTxList = self.getTxListParse( response );
        }

        callback(status, returnTxList);
    }, true);
}

BTCBlockcypherRelay.prototype.getTxListParse = function(primaryTxListData) {
    var txListItems = [];

    for ( i = 0; i <  primaryTxListData.txrefs.length; i++) {
        var txItem  = primaryTxListData.txrefs[i];

        txListItems.push({
            amount: ((txItem.value) /  100000000).toString(),
            confirmations: txItem.confirmations,
            time:parseInt( new Date(txItem.confirmed).getTime()) / 1e3,
            txHash: txItem.tx_hash
        })
    }

    var txList = {
        txList: txListItems,
        unconfirmed: primaryTxListData.unconfirmed_n_tx
    }

    return txList;
}

BTCBlockcypherRelay.prototype.getTxCount = function(address, callback) {
    var self = this;

    this._relayManager.relayLog(this._name+" - Requested txCount for "+address);
    RequestSerializer.getJSON(this._baseUrl+'v1/btc/main/addrs/'+address, function (response,status) {
        var txCount = -1;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get txCount : No connection with "+ this._name);
        }
        else if(response.n_tx){
            txCount = response.n_tx;
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Count :"+txCount);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" cannot get Tx Count");
        }

        callback(status, txCount);
    },true);
}

BTCBlockcypherRelay.prototype.getTxDetails = function(txHash, callback) {
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested tx details for "+txHash);
    console.log( this._baseUrl+'v1/btc/main/txs/'+txHash )

    var self = this;
    RequestSerializer.getJSON(this._baseUrl+'v1/btc/main/txs/'+txHash, function (response,status) {
//        console.log("response :: " + JSON.stringify(response) + " :: status :: " + status);
        var txDetails = null;

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get tx details : No connection with "+self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name+" Tx Details Raw response:"+JSON.stringify(response));

            txDetails = self.getTxDetailsParse(response);
        }

        callback(status, txDetails);
    },true);
}

BTCBlockcypherRelay.prototype.getTxDetailsParse = function(primaryTxDetailData) {
    var outputs = [],
        input = [];


    for (var i = 0; i < primaryTxDetailData.outputs.length; i++) {
        var output = primaryTxDetailData.outputs[i];

        outputs.push({
            address:   output.addresses[0],
            amount: ((output.value) / 100000000).toString(),
            index: i,
            spent: !(output.spent_by === 'null' ),
            standard: !(primaryTxDetailData.inputs[0].script_type === null)
        })
    }

    //@note: @here: @bug: only one input is super bad.. this needs to be a exhaustive loop.
    input.push({
        address: primaryTxDetailData.inputs[0].addresses[0],
        amount: ((primaryTxDetailData.inputs[0].output_value) / 100000000).toString(),
        previousTxid: primaryTxDetailData.inputs[0].prev_hash,
        previousIndex: primaryTxDetailData.inputs[0].output_index,
        standard: !(primaryTxDetailData.inputs[0].script_type === null)
    })

    var tx = {
        txid: primaryTxDetailData.hash,
        block: primaryTxDetailData.block_height,
        confirmations: primaryTxDetailData.confirmations,
        time_utc: primaryTxDetailData.confirmed,
        inputs: input,
        outputs: outputs
    }

    console.log(tx)
    return tx;
}

BTCBlockcypherRelay.prototype.getAddressBalance = function(address, callback) {

    var self = this;

    RequestSerializer.getJSON(this._baseUrl + 'v1/btc/main/addrs/' + address , function (response, status) {
        var balance = -1;
//        console.log("got :: " + status + " :: " + JSON.stringify(response));
        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get address balance : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Address Balance Raw response:"+JSON.stringify(response));

            balance = response.balance / 100000000;
//            console.log("Blockcypher Balance :: " + balance);
        }

        callback(status, balance);
    });
}

BTCBlockcypherRelay.prototype.getFixedBlockHeight = function( address, callback ) {
    var self = this

    RequestSerializer.getJSON(this._baseUrl + 'v1/btc/main/addrs/' + address , function (response,status) {

        if(status==='error'){
            self._relayManager.relayLog("Chain Relay :: Cannot get Tx Block Height : No connection with "+ self._name);
        }
        else {
            self._relayManager.relayLog("Chain Relay :: " + self._name + " Tx Block Height Raw response:"+JSON.stringify(response));

            var setBlockHeight = response.txrefs[1].block_height;
            callback(setBlockHeight)
//            console.log(self._name + "  :: " + setBlockHeight);

        }
    });

}

BTCBlockcypherRelay.prototype.getUTXO = function(address, callback) {
    if (!callback) { throw new Error('missing callback'); }
    this._relayManager.relayLog("Chain Relay :: " + this._name+" - Requested UTXO for "+address);
    var url=this._baseUrl+'v1/btc/main/addrs/'+address+'?unspentOnly=true';
	var self = this;
    RequestSerializer.getJSON(url, function (response,status) {
        if (status==='error') {
            self._relayManager.relayLog("Chain Relay :: Cannot get UTXO: No connection with "+ self._name);
            callback(new Error("Chain Relay :: Cannot get txCount: No connection with "+ self._name));
        }
        else if (response.txrefs || response.unconfirmed_txrefs) {
            //self._relayManager.relayLog("Chain Relay :: " + btcRelays.blockcypher.name+" UTXO Raw :"+JSON.stringify(response.txrefs));

            var unspent = [];

            var ii=0;
            if(response.txrefs ){
                for(i=0;i<response.txrefs.length;i++){
                    var tempRemote = response.txrefs[i];
                    var tempTx = { tx: tempRemote.tx_hash , amount: HDWalletHelper.convertSatoshisToBitcoins(tempRemote.value), n: tempRemote.tx_output_n, confirmations: tempRemote.confirmations };
                    unspent[i] = tempTx;
                    ii++;
                }
            }
            //add unconfirmed
            if(response.unconfirmed_txrefs){
                for(i=0;i<response.unconfirmed_txrefs.length;i++){
                    var tempRemote = response.unconfirmed_txrefs[i];
                    var tempTx = { tx: tempRemote.tx_hash , amount: HDWalletHelper.convertSatoshisToBitcoins(tempRemote.value), n: tempRemote.tx_output_n, confirmations: tempRemote.confirmations };
                    unspent[ii] = tempTx;
                }
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

BTCBlockcypherRelay.prototype.pushRawTx = function(hex, callback) {
//    $.ajax(this._baseUrl+'v1/btc/main/txs/push', {
//        complete: function(ajaxRequest, status) {
//            var response;
//			var responseText;
//            if (status === 'success') {
//                response = '{"status": "success"}';
//            }
//            else {
//                responseText = JSON.stringify(ajaxRequest.responseText);
//				response = '{"status": "fail" , "message": ' + responseText + '}';
//            }
//
//            callback(status, JSON.parse(response));
//        },
//        contentType: 'application/x-www-form-urlencoded',
//        data: ('{"tx": "' + hex + '"}'),
//        type: 'POST'
//    });
	var urlToCall = this._baseUrl + 'v1/btc/main/txs/push';
    var dataToSend = '{"tx": "' + hex + '"}';

    BTCRelayHelper.pushRawTx(this._name, urlToCall, dataToSend, callback, null);
}

BTCBlockcypherRelay.prototype.getBlockcypherTxListCallback = function(response,prevTxs,callback) {
    // (Dan) This function pushes all the transaction data pertaining to the address in the response to 'transactions'.
    if(response.txrefs) {
        var transactions = prevTxs;
        //self._relayManager.relayLog("Chain Relay :: " + btcRelays.blockcypher.name+" Tx List Raw response:"+JSON.stringify(response));

        //Iterate and parse transactions
        for (i=0; i< response.txrefs.length ; i++) {
            var tempTx = response.txrefs[i];
            var newTx = {tx:tempTx.tx_hash, time_utc:tempTx.confirmed, confirmations:tempTx.confirmations, amount:HDWalletHelper.convertSatoshisToBitcoins(tempTx.value), block_height : tempTx.block_height };
            transactions.push(newTx); //Push to global object //TODO IMPROVE
        }

        if(response.hasMore){
            var before = transactions[(transactions.length)-1].block_height; //get block height of last element
            var address = response.address;

            var newUrl = this._baseUrl+'v1/btc/main/addrs/'+address+'?limit=2000&before='+before; // (Dan) newUrl is the url for the next set of transactions.
            self._relayManager.relayLog("Chain Relay :: " + this._name+" Detected more transactions. Calling "+newUrl);

            var callRemote = function (url, prevTxs,callback) {
                $.ajax({
                    type: "GET",
                    url: url,
                    success: function(data) {
                        this.getBlockcypherTxListCallback(data,prevTxs,callback);
                    }
                });
            }
            callRemote(newUrl,transactions,callback);
        }
        else {
            var dataToReturn = { status : 'success', data : { txs: transactions} };
            //self._relayManager.relayLog("Finished call" + JSON.stringify(dataToReturn)); //TODO remove, use a callback instead
            callback("success", dataToReturn);
        }
    }
    else{
        this._relayManager.relayLog("Chain Relay :: problem while getting Tx List Raw");
    }
}

// *******************************************************
// Some test stubs:
// *******************************************************

BTCBlockcypherRelay.prototype.getRelayType = function() {
	return 'BTCBlockcypherRelay';
}

BTCBlockcypherRelay.prototype.getRelayTypeWithCallback = function(callback) {
	var relayName = 'BTCBlockcypherRelay';
	callback("success", relayName);
	return relayName;
}

BTCBlockcypherRelay.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	var relayName = 'BTCBlockcypherRelay';
	callback(relayName);
	return relayName;
}

if (typeof(exports) !== 'undefined') {
    exports.relayBlockCypher = BTCBlockcypherRelay;
}
