var HDWalletWorkerBitcoin = function() {
    this._doDebug = true;
    //@note: @todo: @here: get the batch size from the relay directly.
    this._batchSize = 10;
    this._coinName = "Bitcoin";

    this._workerManager = null;
}

HDWalletWorkerBitcoin.networkParams = {
    static_relay_url: "",
    gather_tx: "",
    gather_tx_append: "",
    multi_balance: "",
    multi_balance_append: "",
};

HDWalletWorkerBitcoin.prototype.initialize = function(workerManager) {
    this._workerManager = workerManager;
}

HDWalletWorkerBitcoin.prototype.log = function(logString) {
    if (this._doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('BitcoinWorkerLog:');
    console.log(args);
}

//@note: @todo: @next:
//figure out how to best deal with these:
//this._lastChangeIndex = addressInfo.index;
//this._currentChangeAddress = null;

HDWalletWorkerBitcoin.prototype.batchScanBlockchain = function(addresses) {
    var self = this;
    var batch = [];

    while (addresses.length) {
        batch.push(addresses.shift());
        if (batch.length === this._batchSize || addresses.length === 0) {

            var addressParam = batch.join(',');

            var delegateFunction = "getTxList";

            var relayArguments = [addressParam, function(status, txList) {
                //                    console.log("txList :: " + JSON.stringify(txList));

                self._populateHistory(txList);
            }];

            var callbackIndex = 1;

            var isCallbackSuccessfulFunction = function(status) {
                if (typeof(status) === 'string' && status === 'success') {
                    // console.log("callback successful");
                    return true;
                } else {
                    console.log("callback unsuccessful");
                    return false;
                }
            }

            var isCallbackPermanentFailureFunction = function(status) {
                console.log("failure with node...");

                //@note: @here: @todo: @next: @relays:
                return true;
                //                return false;
            }

            var actionTakenWhenTaskIsNotExecuted = function(returnArgs) {
                console.log("failure with relay system...");
            };

            //            this._workerManager._relayManager.startRelayTaskWithBestRelay(delegateFunction,


            //@note: @here: @todo: @next: @relays:


            this._workerManager._relayManager.startRelayTaskWithArbitraryRelay(0, delegateFunction, relayArguments, callbackIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerBitcoin.prototype._populateHistory = function(addressData, passthroughParam) {
    if (!addressData || (addressData.status !== 'success' && addressData.status !== '1' && typeof(addressData.byAddress) === undefined)) {
        this.log("hdwalletworker :: " + this._coinName + " :: _populateHistory :: error :: addressData is not returning success :: addressData :: " + JSON.stringify(addressData));

        return;
    }

    var dateNow = (new Date()).getTime();
    var updated = false;

    //@note: return data from blockr.io
    //        {"status":"success","data":{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","limit_txs":200,"nb_txs":2,"nb_txs_displayed":2,"txs":[{"tx":"bc7597f3f0c170cb8966dc37250eca1b8dab169702299c464b3a82185c2227e7","time_utc":"2016-02-12T22:53:53Z","confirmations":4669,"amount":-0.05,"amount_multisig":0},{"tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167","time_utc":"2016-02-12T22:26:35Z","confirmations":4670,"amount":0.05,"amount_multisig":0}]},"code":200,"message":""}

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
            allTxid[txs[i].txHash] = true;
        }
    }

    this._lookupBitcoinTransactions(Object.keys(allTxid), function() {
        //@note: @here: @todo: catch bad tx from _lookupBitcoinTransactions -> _populateTransactionsBitcoin
    });

    var updateDict = {lastReceiveIndex: managerLastReceiveIndex, currentReceiveAddress: managerCurrentReceiveAddress, lastChangeIndex: managerLastChangeIndex, currentChangeAddress: managerCurrentChangeAddress, updated: updated};

    this._workerManager.updateWorkerManager(updateDict);
}

HDWalletWorkerBitcoin.prototype._lookupBitcoinTransactions = function(txids, callback) {
    var self = this;

    // Create batches of txid to send to the blockr.io/blockcypher/etc API

    var batch = [];
    while (txids.length) {
        batch.push(txids.shift());
        if (batch.length === this._batchSize || txids.length === 0) {

            // Request the transactions and utxo for this batch
            var txidParam = batch.join(',');

            var delegateFunction = "getTxDetails";

            var relayArguments = [txidParam, function(status, txDetails) {
//                console.log("txDetails :: " + JSON.stringify(txDetails));

                self._populateTransactionsBitcoin(txDetails, callback);
            }];

            var callbackIndex = 1;

            var isCallbackSuccessfulFunction = function(status) {
                if (typeof(status) === 'string' && status === 'success') {
                    // console.log("callback successful");
                    return true;
                } else {
                    console.log("callback unsuccessful");
                    return false;
                }
            }

            var isCallbackPermanentFailureFunction = function(status) {
                console.log("failure with node...");
                return true;
//                return false;
            }

            var actionTakenWhenTaskIsNotExecuted = function(returnArgs) {
                console.log("failure with relay system...");

//                var passthroughParams = returnArgs[2];
//
//                var didComplete = self.processRelayReturnValues("txDetails", {}, passthroughParams);
//
//                if (didComplete) {
//                    self.compareTxDetails(passthroughParams);
//                }
            };

//            this._workerManager._relayManager.startRelayTaskWithBestRelay(delegateFunction,


            //@note: @here: @todo: @next: @relays:

            this._workerManager._relayManager.startRelayTaskWithArbitraryRelay(0, delegateFunction, relayArguments, callbackIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted);

//            RequestSerializer.getJSON(this._workerManager._STATIC_RELAY_URL + '/api/v1/tx/info/' + txidParam + "?amount_format=string", function(data) {
//                self._populateTransactionsBitcoin(data, callback);
//            }, true);

            // Clear the batch
            batch = [];

            //@note: @here: @todo: this shouldn't return in full builds.
//            return;
        }
    }
}


HDWalletWorkerBitcoin.prototype._populateTransactionsBitcoin = function(transactions, callback) {
    if (!transactions) {
        if (callback) {
            callback({});
        }
        return;
    }

    var updated = this._updateTransactionsBitcoin(transactions);

    if (callback) {
        callback(updated);
    }
}

HDWalletWorkerBitcoin.prototype._updateTransactionsBitcoin = function(transactions) {
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
        //@note: return from blockr.io
        //    {"status":"success","data":{"tx":"bc7597f3f0c170cb8966dc37250eca1b8dab169702299c464b3a82185c2227e7","block":398144,"confirmations":4679,"time_utc":"2016-02-12T22:53:53Z","is_coinbased":0,"trade":{"vins":[{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","is_nonstandard":false,"amount":"-0.05000000","n":1,"type":0,"vout_tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167"}],"vouts":[{"address":"1EqebtAjveBW9KftQx2hbpb6dhx5sDGZGY","is_nonstandard":false,"amount":"0.00100000","n":0,"type":1,"is_spent":1},{"address":"17uAEKxUmvbGusJzj1xrJoSJ4hKo8Te95F","is_nonstandard":false,"amount":"0.04890000","n":1,"type":1,"is_spent":1}]},"vins":[{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","is_nonstandard":false,"amount":"-0.05000000","n":1,"type":0,"vout_tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167"}],"vouts":[{"address":"1EqebtAjveBW9KftQx2hbpb6dhx5sDGZGY","is_nonstandard":false,"amount":"0.00100000","n":0,"type":1,"is_spent":1,"extras":{"asm":"OP_DUP OP_HASH160 97ccfd4bc69a58b992b6c044511b540015d49bed OP_EQUALVERIFY OP_CHECKSIG","script":"76a91497ccfd4bc69a58b992b6c044511b540015d49bed88ac","reqSigs":1,"type":"pubkeyhash"}},{"address":"17uAEKxUmvbGusJzj1xrJoSJ4hKo8Te95F","is_nonstandard":false,"amount":"0.04890000","n":1,"type":1,"is_spent":1,"extras":{"asm":"OP_DUP OP_HASH160 4bae16df222714bb1dc833fd2511d7fb301ad444 OP_EQUALVERIFY OP_CHECKSIG","script":"76a9144bae16df222714bb1dc833fd2511d7fb301ad44488ac","reqSigs":1,"type":"pubkeyhash"}}],"fee":"0.00010000","days_destroyed":"0.00","is_unconfirmed":false,"extras":null},"code":200,"message":""}

        var transaction = transactions[ti];

        var oldTransaction = this._workerManager._transactions[transaction.txid];
        if (oldTransaction) {

            // Did an unspent output become spent?
            var changedSpentState = false;
            for (var i = 0; i < transaction.outputs.length; i++) {
//                console.log("curTX :: " + JSON.stringify(transaction.outputs[i]));
                if (typeof oldTransaction.outputs[i] === 'undefined') {
                    console.log("warning :: wack tx");
                }
//                console.log("prevTX :: " + JSON.stringify(oldTransaction.outputs[i]));
                if ((transaction.outputs[i].spent) !== oldTransaction.outputs[i].spent) {
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

            if (typeof(input.amount) === 'undefined') {
                console.log("input balance is wack");
            }

            inputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: input.address,
                amountBtc: input.amount,
                previousTxid: input.previousTxid,
                previousIndex: input.previousIndex,
                standard: input.standard
            });
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

            if (typeof(output.amount) === 'undefined') {
                console.log("output balance is wack");
            }
            console.log()
            outputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: output.address,
                amountBtc: output.amount,
                confirmations: transaction.confirmations,
                index: i,
                spent: output.spent,
                standard: output.standard,
                timestamp: new Date(transaction.time_utc * 1000).getTime(),
                txid: transaction.txid
            })
        }

        // Add the transaction
        var tx = {
            txid: transaction.txid,
            block: transaction.block,
            confirmations: transaction.confirmations,
            timestamp: new Date(transaction.time_utc * 1000).getTime(),
            inputs: inputs,
            outputs: outputs
        }

        updateDict.transactions[transaction.txid] = tx;
    }

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

HDWalletWorkerBitcoin.prototype.updateBalances = function() {
//    this.updateBalancesBitcoin();
}

HDWalletWorkerBitcoin.prototype.performRecheck = function() {
    this.log("forcing recheck with max addresses :: " + Object.keys(this._workerManager._addressMap).length);

    var updateDict = {
        clearTransactions: true,
    }

    this._workerManager.updateWorkerManager(updateDict);

    this._workerManager.checkTransactions(0);
}
