/**
 *  Wallet Worker
 *
 *  Every 90 seconds, request info for all addresses that haven't been updated in the last 60s?
 */

importScripts('../thirdparty.js');
importScripts('../request.js');

importScripts('../network.js');

function log() {
    var args = [].slice.call(arguments);
    args.unshift('WorkerLog:');
    postMessage({action: 'log', content: args});
}

var WalletWorker = function() {
    this._receiveNode = null;
    this._changeNode = null;

    this._lastReceiveIndex = -1;
    this._currentReceiveAddress = null;

    this._lastChangeIndex = -1;
    this._currentChangeAddress = null;

    this._addressMap = {};

    this._transactions = {};


    var socketEntryPoint = TESTNET ? "test3": "main"; //Switch according to network
    this._blockCypherToken = "443eb2360338caf91c041ddd1464ee86" ; //Current token
    var socketUri = "wss://socket.blockcypher.com/v1/btc/"+socketEntryPoint ;

    this._watcher = new WebSocket(socketUri);
    this._watcherQueue = [];

    var self = this;
    this._watcher.onopen = function() {

        setInterval(function(){
            walletWorker._sendPing();} //Will reply with pong
        , 18000); //send a ping every 20 seconds more or less to avoid getting disconnected

        // We set the watcherQueue to null to indicate we are connected
        var watcherQueue = self._watcherQueue;
        self._watcherQueue = null;

        for (var i = 0; i < watcherQueue.length; i++) {
            self._watchAddress(watcherQueue[i]);
        }
    };


    this._watcher.onmessage = function(event) {
        if (!event || !event.data) {
            return;
        }

        var data = JSON.parse(event.data);
        //console.log("message from socket : "+ JSON.stringify(data));

        if(data.block_height == -1){ //tx not included in any block. schedule a refresh of tx in 10 seconds
                    setTimeout(function () {
                        walletWorker.checkTransactions(0);
                    }, 12000);
            }

        /*
        if (data.payload && data.payload.transaction_hash) {
            // Retry up to 10 times, with "exponential back-off" (not true exponential back-off)
            (function(txid) {

                var startTime = (new Date()).getTime();
                var retry = 0;
                var lookupTransaction = function() {

                    self._lookupTransactions([txid], function (updated) {
                        if (!updated[txid] && retry < 10) {

                            timeout = 1.5 + Math.pow(1.4, retry++);
                            setTimeout(lookupTransaction, timeout * 1000);
                        }
                    });
                }

                setTimeout(lookupTransaction, 0);
            })(data.payload.transaction_hash);
        }
        */
    };

    // @TODO: onerror, re-connect
    this._watcher.onerror = function(event) {
        log("watcher.error");
    }

}


WalletWorker.prototype._sendPing = function() {
     this._watcher.send("{ \"event\": \"ping\" }");
}


WalletWorker.prototype._watchAddress = function(address) {
    if (this._watcherQueue !== null) {

        this._watcherQueue.push(address);

    } else {
        this._watcher.send("{ \"event\": \"tx-confirmation\" , \"address\" : \"" + address + "\" ,\"token\": \"" + this._blockCypherToken + "\" }");
    }
}

WalletWorker.prototype.setExtendedPublicKeys = function(receivePublicKey, changePublicKey) {
    this._receiveNode = thirdparty.bitcoin.HDNode.fromBase58(receivePublicKey, NETWORK);
    this._changeNode = thirdparty.bitcoin.HDNode.fromBase58(changePublicKey, NETWORK);

    this.checkTransactions(60);
}

WalletWorker.prototype.update = function() {
    var updates = {
        transactions: this._transactions,
        workerCache: {addressMap: this._addressMap},
    }

    if (!this._currentReceiveAddress) {
        this._currentReceiveAddress = this._receiveNode.derive(this._lastReceiveIndex + 1).getAddress().toString();

        updates.currentReceiveAddress = this._currentReceiveAddress;
        updates.smallQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 3, margin: 1}).toString('base64');
        updates.largeQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 7, margin: 4}).toString('base64');
    }

    if (!this._currentChangeAddress) {
        this._currentChangeAddress = this._changeNode.derive(this._lastChangeIndex + 1).getAddress().toString();
        updates.currentChangeIndex = this._lastChangeIndex + 1;
        updates.currentChangeAddress = this._currentChangeAddress;
    }

    postMessage({action: 'update', content: updates});
}

WalletWorker.prototype._updateTransactions = function(transactions) {

    var updated = {};
    for (var ti = 0; ti < transactions.length; ti++) {
        var transaction = transactions[ti];

        var oldTransaction = this._transactions[transaction.tx];
        if (oldTransaction) {

            // Did an unspent output become spent?
            var changedSpentState = false;
            for (var i = 0; i < transaction.vouts.length; i++) {
                if ((transaction.vouts[i].is_spent === 1) !== oldTransaction.outputs[i].spent) {
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
        for (var i = 0; i < transaction.vins.length; i++) {
            var input = transaction.vins[i];

            var addressInfo = this._addressMap[input.address];
            if (!addressInfo) {
                addressInfo = {internal: null, index: null};
            } else if (!addressInfo.internal && addressInfo.index > this._lastReceiveIndex) {
                this._lastReceiveIndex = addressInfo.index;
                this._currentReceiveAddress = null;
            } else if (addressInfo.internal && addressInfo.index > this._lastChangeIndex) {
                this._lastChangeIndex = addressInfo.index;
                this._currentChangeAddress = null;
            }

            inputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: input.address,
                amountBtc: input.amount,
                previousTxid: input.vout_tx,
                previousIndex: input.n,
                standard: !(input.is_nonstandard),
            })
        }

        // Add each output in our format (populated with address info, etc)
        for (var i = 0; i < transaction.vouts.length; i++) {
            var output = transaction.vouts[i];

            var addressInfo = this._addressMap[output.address];
            if (!addressInfo) {
                addressInfo = {internal: null, index: null};
            } else if (!addressInfo.internal && addressInfo.index > this._lastReceiveIndex) {
                this._lastReceiveIndex = addressInfo.index;
                this._currentReceiveAddress = null;
            } else if (addressInfo.internal && addressInfo.index > this._lastChangeIndex) {
                this._lastChangeIndex = addressInfo.index;
                this._currentChangeAddress = null;
            }
            outputs.push({
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,

                address: output.address,
                amountBtc: output.amount,
                confirmations: transaction.confirmations,
                index: i,
                spent: (output.is_spent === 1),
                standard: !(output.is_nonstandard),
                timestamp: new Date(transaction.time_utc).getTime(),
                txid: transaction.tx
            })
        }

        // Add the transaction
        var tx = {
            txid: transaction.tx,
            block: transaction.block,
            confirmations: transaction.confirmations,
            timestamp: new Date(transaction.time_utc).getTime(),
            inputs: inputs,
            outputs: outputs
        }

        this._transactions[transaction.tx] = tx;
        updated[transaction.tx] = tx;
    }

    // If we have updated any transactions, notify the wallet
    if (Object.keys(updated).length) {
        this.update();
    }

    return updated;
}

WalletWorker.prototype._lookupTransactions = function(txids, callback) {
    var self = this;

    var populateTransactions = function(data) {
        if (!data || data.status !== 'success') {
            if (callback) {
                callback({});
            }
            return;
        }

        // If there is only result, the API returns us the single result rather than an array. Ugh.
        var transactions = data.data;
        if (!transactions[0]) {
            transactions = [transactions];
        }

        var updated = self._updateTransactions(transactions);

        if (callback) {
            callback(updated);
        }
    }

    // Create batches of txid to send to the blockr.io/blockcypher/etc API
    var BATCH_SIZE = 10;
    var batch = [];
    while (txids.length) {
        batch.push(txids.shift());
        if (batch.length === BATCH_SIZE || txids.length === 0) {

            // Request the transactions and utxo for this batch
            var txidParam = batch.join(',');
            RequestSerializer.getJSON(BASE_URL + '/api/v1/tx/info/' + txidParam + "?amount_format=string", populateTransactions, true);

            // Clear the batch
            batch = [];
        }
    }
}

WalletWorker.prototype._updateAddresses = function() {
}

WalletWorker.prototype.checkTransactions = function(addressesOrMinimumAge) {
    log('Check Transactions: ' + addressesOrMinimumAge);
    var minimumAge = null;
    var addresses = [];
    if (typeof(addressesOrMinimumAge) === 'number') {
        minimumAge = addressesOrMinimumAge;
    } else {
        addresses = addressesOrMinimumAge;
    }

    // Can't do anything until we have the change and receive nodes
    if (!this._changeNode || !this._receiveNode) {
        return;
    }

    var lastUsedReceiveIndex = -1, lastUsedChangeIndex = -1;
    var highestReceiveIndex = -1, highestChangeIndex = -1;
    for (var address in this._addressMap) {
        var addressInfo = this._addressMap[address];

        // Track the highest index we've used
        if (addressInfo.used) {
            if (addressInfo.internal && addressInfo.index > lastUsedChangeIndex) {
                lastUsedChangeIndex = addressInfo.index;
                if (lastUsedChangeIndex > this._lastChangeIndex) {
                    this._lastChangeIndex = lastUsedChangeIndex;
                    this._currentChangeAddress = null;
                }

            } else if (!addressInfo.internal && addressInfo.index > lastUsedReceiveIndex) {
                lastUsedReceiveIndex = addressInfo.index;
                if (lastUsedReceiveIndex > this._lastReceiveIndex) {
                    this._lastReceiveIndex = lastUsedReceiveIndex;
                    this._currentReceiveAddress = null;
                }
            }
        }

        // Track the highest address we've looked up so far (need to cover the gap)
        if (addressInfo.internal && addressInfo.index > highestChangeIndex) {
            highestChangeIndex = addressInfo.index;

        } else if (!addressInfo.internal && addressInfo.index > highestReceiveIndex) {
            highestReceiveIndex = addressInfo.index;
        }
    }

    var neededGenerate = false;

    // Now see if we need to generate another receive address
    if (lastUsedReceiveIndex + 20 > highestReceiveIndex) {
        var index = highestReceiveIndex + 1;
        var address = this._receiveNode.derive(index).getAddress().toString()
        this._addressMap[address] = {index: index, internal: 0, updatedTimestamp: 0};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // Now see if we need to generate another change address
    if (lastUsedChangeIndex + 20 > highestChangeIndex) {
        var index = highestChangeIndex + 1;
        var address = this._changeNode.derive(index).getAddress().toString()
        this._addressMap[address] = {index: index, internal: 1, updatedTimestamp: 0};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // If we had to generate an address, reschedule in the near future generating some more
    if (neededGenerate) {
        setTimeout(function() { walletWorker.checkTransactions(60); }, 500);
    }

    var now = (new Date()).getTime();

    // Find all addresses that have not been updated since our minimum age
    if (minimumAge !== null) {
        for (var address in this._addressMap) {
            var addressInfo = this._addressMap[address];
            if (now - addressInfo.updatedTimestamp < minimumAge * 1000) {
                continue;
            }
            addresses.push(address);
        }
    }

    var self = this;

    var populateHistory = function(data, status) {
        if (!data || data.status !== 'success') { return; }

        var now = (new Date()).getTime();

        var updated = false;

        var allTxid = {};

        for (var ai = 0; ai < data.data.length; ai++) {
            var addressItem = data.data[ai];

            // The path information about the address
            var addressInfo = self._addressMap[addressItem.address];
            if (!addressInfo) {
                log("This shouldn't happen: blockcypher.com returned us something we didn't request.");
                continue;
            }

            addressInfo.updatedTimestamp = now;

            // This address has never had any transactions
            var txs = addressItem.txs || addressItem.unconfirmed;
            if (!txs || txs.length == 0) {
                continue;
            }

            // Mark the address as used
            if (!addressInfo.used) {
                addressInfo.used = true;
                if (addressInfo.internal && addressInfo.index > self._lastChangeIndex) {
                    self._lastChangeIndex = addressInfo.index;
                    self._currentChangeAddress = null;

                } else if (!addressInfo.internal && addressInfo.index > self._lastReceiveIndex) {
                    self._lastReceiveIndex = addressInfo.index;
                    self._currentReceiveAddress = null;
                }

                updated = true;
            }

            // Add each transaction to lookup
            for (var i = 0; i < txs.length; i++) {
                allTxid[txs[i].tx] = true;
            }
        }

        self._lookupTransactions(Object.keys(allTxid));

        if (updated) {
            self.update();
        }
    }


    // Create batches of addresses to send to the blockr.io API
    var BATCH_SIZE = 10;
    var batch = [];
    while (addresses.length) {
        batch.push(addresses.shift());
        if (batch.length === BATCH_SIZE || addresses.length === 0) {

            // Request the transactions and utxo for this batch
            var addressParam = batch.join(',');
            RequestSerializer.getJSON(BASE_URL + "/api/v1/address/txs/" + addressParam, populateHistory);
            RequestSerializer.getJSON(BASE_URL + "/api/v1/address/unconfirmed/" + addressParam, populateHistory);

            // Clear the batch
            batch = [];
        }
    }


}

var walletWorker = new WalletWorker();

onmessage = function(message) {
    if (message.data.action === 'setExtendedPublicKeys') {
        walletWorker.setExtendedPublicKeys(message.data.content.receive, message.data.content.change);

    } else if (message.data.action === 'restoreCache') {
        var cache = message.data.content.workerCache;

        if (cache && cache.addressMap) {
            for (var address in cache.addressMap) {
                walletWorker._addressMap[address] = cache.addressMap[address];
                walletWorker._watchAddress(address);
            }
        }

    } else if (message.data.action === 'refresh') {
        log('Refreshing...');
        setTimeout(function () { walletWorker.checkTransactions(0); }, 0);
    }
}

setInterval(function() { walletWorker.checkTransactions(60); }, 5000);
