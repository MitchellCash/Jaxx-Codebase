var HDWalletWorkerDash = function() {
    this._doDebug = true;
    this._batchSize = 20;
    this._coinName = "Dash";

    this._workerManager = null;
}

HDWalletWorkerDash.networkParams = {
    static_relay_url: "http://api.jaxx.io:2052/insight-api-dash",
    gather_tx: "/addrs/",
    gather_tx_append: "/txs?group=1",
    multi_balance: "",
    multi_balance_append: "",
};

HDWalletWorkerDash.prototype.initialize = function(workerManager) {
    this._workerManager = workerManager;
}


HDWalletWorkerDash.prototype.log = function(logString) {
    if (this._doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('DashWorkerLog:');
    console.log(args);
}

HDWalletWorkerDash.prototype.batchScanBlockchain = function(addresses) {
    var self = this;

    var batch = [];

    while (addresses.length) {
        batch.push(addresses.shift());

        if (batch.length === this._batchSize  || addresses.length === 0) {

            var addressParam = batch.join(',');

            var requestURL = HDWalletWorkerDash.networkParams.static_relay_url + HDWalletWorkerDash.networkParams.gather_tx + addressParam + HDWalletWorkerDash.networkParams.gather_tx_append;

//                console.log("dash :: requestURL :: " + requestURL);

            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParam) {
//                    console.log("dash :: requestURL :: completed");

                self._populateHistory(data, passthroughParam);
            }, null, addressParam);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerDash.prototype._populateHistory = function(processorData, passthroughParam) {
    if (!processorData || (processorData.status !== 'success' && processorData.status !== '1' && typeof(processorData.byAddress) === undefined)) {
        this.log("hdwalletworker :: " + this._coinName + " :: _populateHistory :: error :: addressData is not returning success :: addressData :: " + JSON.stringify(processorData));

        return;
    }

    var dateNow = (new Date()).getTime();
    var updated = false;

//    console.log("dash :: addressData :: " + JSON.stringify(processorData));

    //@note: @here: for now, dash doesn't contain lists of tx ids per address, it all comes in one block.
    // this function processes that (potentially multi-address) block.

    var addressData = {};
    addressData.data = [];

    var addressKeys = Object.keys(processorData.byAddress);

    for (var i = 0; i < addressKeys.length; i++) {
        var curAddress = addressKeys[i];
        var curAddressDataKeys = Object.keys(processorData.byAddress[curAddress]);

        var newData = {};

        newData.address = curAddress;
        newData.txs = [];
//        console.log("curAddress :: " + curAddress);

        for (var j = 0; j < curAddressDataKeys.length; j++) {
            var curData = processorData.byAddress[curAddress][curAddressDataKeys[j]];

//            var newTx = {};
//            newTx.txid = curData.txid;
//            newTx.data = curData;

            newData.txs.push(curData);
        }

        newData.txDetails = this._getTxDetailsParse(newData.txs);

//        console.log("curAddress :: " + curAddress + " :: txData :: " + JSON.stringify(newData.txs) + " :: txDetails :: " + JSON.stringify(newData.txDetails));


        addressData.data.push(newData);
    }


    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    var allTxid = {};

    for (var ai = 0; ai < addressData.data.length; ai++) {
        var addressItem = addressData.data[ai];

        // The path information about the address
        var addressInfo = this._workerManager._addressMap[addressItem.address];
        if (!addressInfo) {
            this.log("error :: returned data from btc api host does not match an existing address.");
            continue;
        }

        addressInfo.updatedTimestamp = dateNow;

        // This address has never had any transactions
        var txs = addressItem.txs || addressItem.unconfirmed;
        if (!txs || txs.length == 0) {
            continue;
        }

        // Mark the address as used
        if (!addressInfo.used) {
            addressInfo.used = true;
            if (addressInfo.internal && addressInfo.index > managerLastChangeIndex) {
                managerLastChangeIndex = addressInfo.index;
                managerCurrentChangeAddress = null;

            } else if (!addressInfo.internal && addressInfo.index > managerLastReceiveIndex) {
                managerLastReceiveIndex = addressInfo.index;
                managerCurrentReceiveAddress = null;
            }

            updated = true;
        }

        // Add each transaction to lookup
        for (var i = 0; i < txs.length; i++) {
            allTxid[txs[i].txid] = true;
        }
    }

//    this._lookupDashTransactions(Object.keys(allTxid), function() {
//        //@note: @here: @todo: catch bad tx from _lookupDashTransactions -> _populateTransactionsDash
//    });

    for (var i = 0; i < addressData.data.length; i++) {
        if (addressData.data[i].txDetails.length > 0) {
            var curData = {};
            curData.status = 'success';
            curData.data = addressData.data[i].txDetails;

            this._populateTransactionsDash(curData, function() {
            });
        }
    }

    var updateDict = {lastReceiveIndex: managerLastReceiveIndex, currentReceiveAddress: managerCurrentReceiveAddress, lastChangeIndex: managerLastChangeIndex, currentChangeAddress: managerCurrentChangeAddress, updated: updated};

    this._workerManager.updateWorkerManager(updateDict);
}

//HDWalletWorkerDash.prototype._lookupDashTransactions = function(txids, callback) {
//    var self = this;
//
//    //@note: @todo: @here: get the batch size from the relay directly.
//    // Create batches of txid to send to the blockr.io/blockcypher/etc API
//    var BATCH_SIZE = 10;
//    var batch = [];
//    while (txids.length) {
//        batch.push(txids.shift());
//        if (batch.length === BATCH_SIZE || txids.length === 0) {
//
//            // Request the transactions and utxo for this batch
//            var txidParam = batch.join(',');
//            RequestSerializer.getJSON(this._workerManager._STATIC_RELAY_URL + this._workerManager._GATHER_TX + txidParam + this._workerManager._GATHER_TX_APPEND, function(data) {
//                self._populateTransactionsDash(data, callback);
//            }, true);
//
//            // Clear the batch
//            batch = [];
//        }
//    }
//}

HDWalletWorkerDash.prototype._getTxDetailsParse = function(primaryTxDetailData) {
    var parsedData = {};
    var txData = [];

    for (var i = 0; i < primaryTxDetailData.length; i++) {
        var curData = primaryTxDetailData[i];

        var outputs = [];
        var inputs = [];

        for (var j = 0; j < curData.vout.length; j++) {
            var output = curData.vout[j];

            outputs.push({
                address: output.scriptPubKey.addresses[0], //@note: @todo: @here: @bug: not sure if this is correct.
                amount: output.value,
                index: j,
                spent: (output.spentTxId !== null),
                standard: true,//@note: @todo: @here: @bug: not sure if this is correct.
            });
        }


        for (var j = 0; j < curData.vin.length; j++) {
            var input = curData.vin[j];

            inputs.push({
                address: input.addr,
                amount: input.value,
                index: j,
                previousTxid: input.txid, //@note: @todo: @here: @bug: not sure if this is correct.
                previousIndex: input.vout,
                standard: true,//@note: @todo: @here: @bug: not sure if this is correct. //!(output.is_nonstandard),
            });
        }

        var tx = {
            txid: curData.txid,
            block: curData.blockheight,
            confirmations: curData.confirmations,
            time_utc: curData.time,
            inputs: inputs,
            outputs: outputs
        }

        txData.push(tx);
    }


    return txData;
}

HDWalletWorkerDash.prototype._populateTransactionsDash = function(data, callback) {
    if (!data || data.status !== 'success') {
        if (callback) {
            callback({});
        }
        return;
    }

    var transactions = data.data;

    var updated = this._updateTransactionsDash(transactions);

    if (callback) {
        callback(updated);
    }
}

HDWalletWorkerDash.prototype._updateTransactionsDash = function(transactions) {
//    console.log("dash :: do update :: " + JSON.stringify(transactions));
    var updateDict = {transactions: {},
                      lastReceiveIndex: -1,
                      currentReceiveAddress: null,
                      lastChangeIndex: -1,
                      currentChangeAddress: null};

    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    for (var ti = 0; ti < transactions.length; ti++) {

        var transaction = transactions[ti];

        var oldTransaction = this._workerManager._transactions[transaction.txid];
        if (oldTransaction) {

            // Did an unspent output become spent?
            var changedSpentState = false;
            for (var i = 0; i < transaction.outputs.length; i++) {
                if ((transaction.outputs[i].spent === 1) !== oldTransaction.outputs[i].spent) {
                    changedSpentState = true;
                }
            }
            if (transaction.confirmations !== oldTransaction.confirmations || transaction.block !== oldTransaction.block) {
                changedSpentState = true;
            }

            // If the spent status changed, reprocess this transaction
            if (!changedSpentState) {
                continue;
            }
        }

        var inputs = [], outputs = [];

        // Add each input in our format (populated with address info, etc)
        for (var i = 0; i < transaction.inputs.length; i++) {
            var input = transaction.inputs[i];

            var addressInfo = this._workerManager._addressMap[input.address];
            if (!addressInfo) {
                //you send the BTC to yourself.
                addressInfo = {internal: null, index: null};
            } else if (!addressInfo.internal && addressInfo.index > managerLastReceiveIndex) {
                managerLastReceiveIndex = addressInfo.index;
                managerCurrentReceiveAddress = null;
            } else if (addressInfo.internal && addressInfo.index > managerLastChangeIndex) {
                managerLastChangeIndex = addressInfo.index;
                managerCurrentChangeAddress = null;
            }

            inputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: input.address,
                amountBtc: -input.amount,
                previousTxid: input.previousTxid,
                previousIndex: input.previousIndex,
                standard: input.standard
            })
        }

        // Add each output in our format (populated with address info, etc)
        for (var i = 0; i < transaction.outputs.length; i++) {
            var output = transaction.outputs[i];

            var addressInfo = this._workerManager._addressMap[output.address];
            if (!addressInfo) {
                addressInfo = {internal: null, index: null};
            } else if (!addressInfo.internal && addressInfo.index > managerLastReceiveIndex) {
                managerLastReceiveIndex = addressInfo.index;
                managerCurrentReceiveAddress = null;
            } else if (addressInfo.internal && addressInfo.index > managerLastChangeIndex) {
                managerLastChangeIndex = addressInfo.index;
                managerCurrentChangeAddress = null;
            }
            outputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: output.address,
                amountBtc: output.amount,
                confirmations: transaction.confirmations,
                index: i,
                spent: output.spent,
                standard: output.standard,
                timestamp: new Date(transaction.time_utc).getTime(),
                txid: transaction.txid
            })
        }

        // Add the transaction
        var tx = {
            txid: transaction.txid,
            block: transaction.block,
            confirmations: transaction.confirmations,
            timestamp: new Date(transaction.time_utc).getTime(),
            inputs: inputs,
            outputs: outputs
        }

        updateDict.transactions[transaction.txid] = tx;
    }

//    console.log("dash :: updated :: " + JSON.stringify(updateDict));

    // If we have updated any transactions, notify the wallet
    if (Object.keys(updateDict.transactions).length > 0) {
        updateDict.lastReceiveIndex = managerLastReceiveIndex;
        updateDict.currentReceiveAddress = managerCurrentReceiveAddress;
        updateDict.lastChangeIndex = managerLastChangeIndex;
        updateDict.currentChangeAddress = managerCurrentChangeAddress;
        updateDict.updated = true;

        this._workerManager.updateWorkerManager(updateDict);
    }
}

HDWalletWorkerDash.prototype.updateBalances = function() {
    //    this.updateBalancesDash();
}

HDWalletWorkerDash.prototype.performRecheck = function() {
    this.log("forcing recheck with max addresses :: " + Object.keys(this._workerManager._addressMap).length);

    var updateDict = {
        clearTransactions: true,
    }

    this._workerManager.updateWorkerManager(updateDict);

    this._workerManager.checkTransactions(0);
}
