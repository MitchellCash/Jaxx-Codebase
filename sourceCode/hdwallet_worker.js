/**
 *  Wallet Worker
 *
 *  Every 90 seconds, request info for all addresses that haven't been updated in the last 60s?
 */

importScripts('../thirdparty.js');
importScripts('../request.js');

importScripts('../network.js');
importScripts('../jaxx_main/jaxx_constants.js');
importScripts('../wallet/hdwallet_helper.js');
importScripts('../wallet/hdwallet_pouch.js');

var doDebug = false;

function log() {
    if (doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('WorkerLog:');
    console.log(args);
//    postMessage({action: 'log', content: args});
}

var HDWalletWorker = function() {
    this._coinType = -1;

    this._receiveNode = null;
    this._changeNode = null;

    this._lastReceiveIndex = -1;
    this._currentReceiveAddress = null;

    this._lastChangeIndex = -1;
    this._currentChangeAddress = null;

    this._addressMap = {};

    this._transactions = {};

    this._watcherQueue = [];

    this._usesWSS = false;
    this._watcherWebSocket = null;

    this._hasForcedRecheck = false;
}

HDWalletWorker.getDefaultTransactionRefreshTime = function() {
    return 60000;
}

HDWalletWorker.prototype.initialize = function(coinType, testNet) {

    this._coinType = coinType;

    this._GATHER_TX = "/api/v1/address/txs/";
    this._GATHER_TX_APPEND = "";

    this._GATHER_UNCONFIRMED_TX = "/api/v1/address/unconfirmed/";

    this._GATHER_TX = "/api/v1/address/txs/";

    this._MULTI_BALANCE = "";
    this._MULTI_BALANCE_APPEND = "";

    this._TESTNET = testNet;

    this._NETWORK = null;
    this._STATIC_RELAY_URL = 'https://btc.blockr.io';
    if (this._TESTNET) {
        this._NETWORK = thirdparty.bitcoin.networks.testnet;
        this._STATIC_RELAY_URL = 'https://tbtc.blockr.io';
    }

    if (this._coinType === COIN_ETHEREUM) {
        log("watcher :: " + this._coinType + " :: init");
    }



    var socketEntryPoint = this._TESTNET ? "test3": "main"; //Switch according to network
    this._blockCypherToken = "443eb2360338caf91c041ddd1464ee86" ; //Current token
    var socketUri = "";

    if (this._coinType === COIN_BITCOIN) {
        socketUri = "wss://socket.blockcypher.com/v1/btc/"+socketEntryPoint;
    } else if (this._coinType === COIN_ETHEREUM) {
        socketUri = "";// "wss://api.ether.fund";

        this._STATIC_RELAY_URL = "https://api.etherscan.io";
        this._GATHER_TX = "/api?module=account&action=txlist&address=";
        this._GATHER_TX_APPEND = "&sort=asc"

        this._GATHER_UNCONFIRMED_TX = "";

        this._MULTI_BALANCE = "/api?module=account&action=balancemulti&address=";
        this._MULTI_BALANCE_APPEND = "&tag=latest";
    }

    var self = this;

    if (socketUri !== "") {
        this._usesWSS = true;
        this._watcherWebSocket = new WebSocket(socketUri);


        this._watcherWebSocket.onopen = function() {

            setInterval(function(){
                hdWalletWorker._sendPing();
                //Will reply with pong
            }, 18000); //send a ping every 20 seconds more or less to avoid getting disconnected

            // We set the watcherQueue to null to indicate we are connected
            var watcherQueue = self._watcherQueue;
            self._watcherQueue = null;

            for (var i = 0; i < watcherQueue.length; i++) {
                self._watchAddress(watcherQueue[i]);
            }
        };


        this._watcherWebSocket.onmessage = function(event) {
            if (!event || !event.data) {
                return;
            }

            var data = JSON.parse(event.data);
//            log("message from socket : "+ JSON.stringify(data));

            if(data.block_height == -1){ //tx not included in any block. schedule a refresh of tx in 10 seconds
                setTimeout(function () {
                    hdWalletWorker.checkTransactions(0);
                }, 12000);
            }

            /*
        if (data.payload && data.payload.transaction_hash) {
            // Retry up to 10 times, with "exponential back-off" (not true exponential back-off)
            (function(txid) {

                var startTime = (new Date()).getTime();
                var retry = 0;
                var lookupTransaction = function() {

                    self._lookupBitcoinTransactions([txid], function (updated) {
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
        this._watcherWebSocket.onerror = function(event) {
            log("watcher :: " + this._coinType + " :: error :: " + JSON.stringify(event));
        }
    }
}

HDWalletWorker.prototype.shutDown = function() {
    if (this._watcherWebSocket !== null) {
        if (this._watcherWebSocket.readyState !== WebSocket.CLOSING && this._watcherWebSocket.readyState !== WebSocket.CLOSED) {
            this._watcherWebSocket.onclose = function() {};
            this._watcherWebSocket.close();
        }
    }

    close();
}

HDWalletWorker.prototype._sendPing = function() {
    this._watcherWebSocket.send("{ \"event\": \"ping\" }");
}


HDWalletWorker.prototype._watchAddress = function(address) {
    if (this._usesWSS) {
        if (this._watcherQueue !== null) {

            this._watcherQueue.push(address);

        } else {
            this._watcherWebSocket.send("{ \"event\": \"tx-confirmation\" , \"address\" : \"" + address + "\" ,\"token\": \"" + this._blockCypherToken + "\" }");
        }
    } else {

    }
}

HDWalletWorker.prototype.setExtendedPublicKeys = function(receivePublicKey, changePublicKey) {
    this._receiveNode = thirdparty.bitcoin.HDNode.fromBase58(receivePublicKey, this._NETWORK);
    this._changeNode = thirdparty.bitcoin.HDNode.fromBase58(changePublicKey, this._NETWORK);

    var self = this;
    setTimeout(function() {
        self.checkTransactions(0);
    }, 500);
}

HDWalletWorker.prototype.update = function(forcePouchRecheck) {
//    log("watcher :: " + this._coinType + " :: update :: " + this._transactions.length);
    var updates = {
        transactions: this._transactions,
        workerCacheAddressMap: this._addressMap,
    }

    if (!this._currentReceiveAddress) {
        this._currentReceiveAddress = HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode.derive(this._lastReceiveIndex + 1)).toString();

        updates.currentReceiveAddress = this._currentReceiveAddress;

        //@note:@todo:@here:
        if (this._coinType === COIN_BITCOIN) {
            updates.smallQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 3, margin: 1}).toString('base64');
            updates.largeQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 7, margin: 4}).toString('base64');
        } else if (this._coinType === COIN_ETHEREUM) {
            //@note: given the ICAP library issue and the fact that this is effectively an isolated "thread", ethereum can regenerate its QR codes later on.
        }
    }

    if (!this._currentChangeAddress) {
        this._currentChangeAddress = HDWalletPouch.getCoinAddress(this._coinType, this._changeNode.derive(this._lastChangeIndex + 1)).toString();
        updates.currentChangeIndex = this._lastChangeIndex + 1;
        updates.currentChangeAddress = this._currentChangeAddress;
    }

    if (typeof(forcePouchRecheck) !== 'undefined' && forcePouchRecheck !== null) {
        updates.forceRecheck = true;
    }

    postMessage({action: 'update', content: updates});
}

HDWalletWorker.prototype.checkTransactions = function(addressesOrMinimumAge) {
//    if (this._coinType === COIN_ETHEREUM) {
//        log("checkTransactions")
//    }
//    if (this._coinType === COIN_ETHEREUM) {
//        log("watcher :: " + this._coinType + " :: check transactions :: " + addressesOrMinimumAge);
//    }

    //    log('Check Transactions: ' + addressesOrMinimumAge);
    var minimumAge = null;
    var addresses = [];
    if (typeof(addressesOrMinimumAge) === 'number') {
        minimumAge = addressesOrMinimumAge;
    } else {
        addresses = addressesOrMinimumAge;
    }

    // Can't do anything until we have the change and receive nodes
    if (!this._changeNode || !this._receiveNode) {
        log("watcher :: " + this._coinType + " :: checkTransactions :: nodes required");
        return;
    }

    var lastUsedReceiveIndex = -1, lastUsedChangeIndex = -1;
    var highestReceiveIndex = -1, highestChangeIndex = -1;
//    if (this._coinType === COIN_ETHEREUM) {
//        log("watcher :: " + this._coinType + " :: Object.keys(this._addressMap).length :: " + Object.keys(this._addressMap).length);
//    }

    for (var address in this._addressMap) {
        var addressInfo = this._addressMap[address];

        // Track the highest index we've used
        if (addressInfo.used) {
            if (this._coinType === COIN_ETHEREUM) {
//                if (!addressInfo.internal) {
//                    log("watcher :: " + this._coinType + " :: address used :: " + address + " :: " + JSON.stringify(addressInfo));
//                }
            }
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

        //@note:@here:@bug: I'm not sure the logic here is sound..

        // Track the highest address we've looked up so far (need to cover the gap)
        if (addressInfo.internal && addressInfo.index > highestChangeIndex) {
            highestChangeIndex = addressInfo.index;

        } else if (!addressInfo.internal && addressInfo.index > highestReceiveIndex) {
            highestReceiveIndex = addressInfo.index;
        }
    }

//    if (this._coinType === COIN_ETHEREUM) {
//        log("watcher :: " + this._coinType + " :: address used :: " + JSON.stringify(addressInfo));
//    }


    var neededGenerate = false;

    // Now see if we need to generate another receive address
    if (lastUsedReceiveIndex + 20 > highestReceiveIndex) {
        var index = highestReceiveIndex + 1;
        var address = HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode.derive(index)).toString();

//        if (this._coinType === COIN_ETHEREUM) {
//            log("watcher :: " + this._coinType + " :: address :: " + address + " :: index :: " + index + " :: receiveNode :: " +  this._receiveNode.derive(index) + " :: lastUsedReceiveIndex :: " + lastUsedReceiveIndex + " :: highestReceiveIndex :: " + highestReceiveIndex);
//        }

        this._addressMap[address] = {index: index, internal: 0, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0, isTheDAOAssociated: false};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // Now see if we need to generate another change address
    if (lastUsedChangeIndex + 20 > highestChangeIndex) {
        var index = highestChangeIndex + 1;
        var address = HDWalletPouch.getCoinAddress(this._coinType, this._changeNode.derive(index)).toString();
//        if (this._coinType === COIN_ETHEREUM) {
//            log("watcher :: " + this._coinType + " :: address :: " + address +  " :: index :: " + index + " :: changeNode :: " +  this._changeNode.derive(index) + " :: lastUsedChangeIndex :: " + lastUsedChangeIndex + " :: highestChangeIndex :: " + highestChangeIndex);
//        }
        this._addressMap[address] = {index: index, internal: 1, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0, isTheDAOAssociated: false};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // If we had to generate an address, reschedule in the near future generating some more
    if (neededGenerate) {
//        if (hdWalletWorker._coinType === COIN_ETHEREUM) {
//            log("ethereum :: set timeout");
//        }
        setTimeout(function() {
//            if (hdWalletWorker._coinType === COIN_ETHEREUM) {
//                log("ethereum :: updating");
//            }
            hdWalletWorker.checkTransactions(HDWalletWorker.getDefaultTransactionRefreshTime());
        }, 500);
    } else {
        if (this._coinType === COIN_BITCOIN) {
            if (this._hasForcedRecheck === false) {
                this._hasForcedRecheck = true;
                console.log("forcing recheck with max addresses :: " + Object.keys(this._addressMap).length);
                this._transactions = {};
                this.checkTransactions(0);
            }
        }
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

    //    if (this._coinType === COIN_ETHEREUM) {
    //        log("watcher :: " + this._coinType + " :: addresses :: " + addresses.length);
    //        return;
    //    }
    //
    this._batchScanBlockchain(addresses);
}

HDWalletWorker.prototype._manuallyAddAddress = function(address) {
    var addressInfo = this._addressMap[address];

    if (typeof(addressInfo) === 'undefined' || addressInfo === null) {
        this._addressMap[address] = {index: index, internal: 1, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0};
        this._watchAddress(address);
    }

    this._batchScanBlockchain([address]);
}

HDWalletWorker.prototype._batchScanBlockchain = function(addresses) {
    var self = this;

    // Create batches of addresses to send to the blockr.io API
    var BATCH_SIZE = 1;

    //@note: bitcoin REST api supports a batch return.
    if (this._coinType === COIN_BITCOIN) {
        BATCH_SIZE = 10;
        //        console.log("tx checking for :: " + addresses.length);
    } else if (this._coinType === COIN_ETHEREUM) {
        BATCH_SIZE = 1;
    }

    //@note:@here:@todo: especially with the ethereum side, we'll probably have to throttle the download limit.

    var batch = [];
    while (addresses.length) {
        batch.push(addresses.shift());
        if (batch.length === BATCH_SIZE || addresses.length === 0) {

            // Request the transactions and utxo for this batch
            var addressParam = batch.join(',');

            //            if (this._coinType === COIN_ETHEREUM) {
            //                log("ethereum :: requesting :: " + addressParam);
            //            }
            //
            RequestSerializer.getJSON(this._STATIC_RELAY_URL + this._GATHER_TX + addressParam + this._GATHER_TX_APPEND, function(data, success, passthroughParam) {
                self._populateHistory(data, passthroughParam);
            }, null, addressParam);

            if (this._GATHER_UNCONFIRMED_TX !== "") {
                RequestSerializer.getJSON(this._STATIC_RELAY_URL + this._GATHER_UNCONFIRMED_TX + addressParam, function(data, success, passthroughParam) {
                    self._populateHistory(data, passthroughParam);
                }, null, addressParam);
            }

            // Clear the batch
            batch = [];
        }
    }
}

//@note: @here: @todo: reexamine this usefulness of this function once our relays
//can give us proper balances from internal contract transactions.

HDWalletWorker.prototype.updateBalancesEthereum = function() {
    var addressesToCheck = [];

    for (var address in this._addressMap) {
        addressesToCheck.push(address);
    }

//    console.log("addressesToCheck :: " + addressesToCheck + " :: " + addressesToCheck.length);

    var self = this;

    var BATCH_SIZE = 20;

    var batch = [];
    while (addressesToCheck.length) {
        batch.push(addressesToCheck.shift());
        if (batch.length === BATCH_SIZE || addressesToCheck.length === 0) {

            var addressParam = batch.join(',');

//            console.log("checking :: " + batch + " :: " + batch.length + " :: " + this._STATIC_RELAY_URL + this._MULTI_BALANCE + addressParam + this._MULTI_BALANCE_APPEND);

            //@note: @here: request the account balances for this batch
            RequestSerializer.getJSON(this._STATIC_RELAY_URL + this._MULTI_BALANCE + addressParam + this._MULTI_BALANCE_APPEND, function(data, success, passthroughParam) {
                self._updateBalancesEthereum(data);
            }, null, addressParam);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorker.prototype._populateHistory = function(addressData, passthroughParam) {
    var now = (new Date()).getTime();

    var updated = false;

    if (this._coinType === COIN_BITCOIN) {
        //@note: return data from blockr.io
        //        {"status":"success","data":{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","limit_txs":200,"nb_txs":2,"nb_txs_displayed":2,"txs":[{"tx":"bc7597f3f0c170cb8966dc37250eca1b8dab169702299c464b3a82185c2227e7","time_utc":"2016-02-12T22:53:53Z","confirmations":4669,"amount":-0.05,"amount_multisig":0},{"tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167","time_utc":"2016-02-12T22:26:35Z","confirmations":4670,"amount":0.05,"amount_multisig":0}]},"code":200,"message":""}
        var data = addressData;
        if (!data || data.status !== 'success') {
            return;
        }

        var allTxid = {};

        for (var ai = 0; ai < data.data.length; ai++) {
            var addressItem = data.data[ai];

            // The path information about the address
            var addressInfo = this._addressMap[addressItem.address];
            if (!addressInfo) {
                log("error :: returned data from btc api host does not match an existing address.");
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
                if (addressInfo.internal && addressInfo.index > this._lastChangeIndex) {
                    this._lastChangeIndex = addressInfo.index;
                    this._currentChangeAddress = null;

                } else if (!addressInfo.internal && addressInfo.index > this._lastReceiveIndex) {
                    this._lastReceiveIndex = addressInfo.index;
                    this._currentReceiveAddress = null;
                }

                updated = true;
            }

            // Add each transaction to lookup
            for (var i = 0; i < txs.length; i++) {
                allTxid[txs[i].tx] = true;
            }
        }

        this._lookupBitcoinTransactions(Object.keys(allTxid));

    } else if (this._coinType === COIN_ETHEREUM) {
        //@note: return data from etherscan.io
        //        {
        //            "status": "1",
        //            "message": "OK",
        //            "result": [
        //                {
        //                    "blockNumber": "65204",
        //                    "timeStamp": "1439232889",
        //                    "hash": "0x98beb27135aa0a25650557005ad962919d6a278c4b3dde7f4f6a3a1e65aa746c",
        //                    "nonce": "0",
        //                    "blockHash": "0x373d339e45a701447367d7b9c7cef84aab79c2b2714271b908cda0ab3ad0849b",
        //                    "transactionIndex": "0",
        //                    "from": "0x3fb1cd2cd96c6d5c0b5eb3322d807b34482481d4",
        //                    "to": "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae",
        //                    "value": "0",
        //                    "gas": "122261",
        //                    "gasPrice": "50000000000",
        //                    "input": "0xf00d4b5d000000000000000000000000036c8cecce8d8bbf0831d840d7f29c9e3ddefa63000000000000000000000000c5a96db085dda36ffbe390f455315d30d6d3dc52",
        //                    "contractAddress": "",
        //                    "cumulativeGasUsed": "122207",
        //                    "gasUsed": "122207"
        //                }, ....]
        //        }

//        log("ethereum :: returned data :: " + JSON.stringify(addressData));

        var ethScanAddress = passthroughParam;

        var data = addressData;
        if (!data || data.status != 1) {
            return;
        }

        if (!data.result || data.result.length === 0) {
            return;
        }

//        log("ethereum :: for address :: " + ethScanAddress + " :: found data :: " + JSON.stringify(data));

        var errorDetected = false;

        for (var i = 0; i < data.result.length; i++) {
            var tx = data.result[i];

            log("ethereum :: tx :: " + JSON.stringify(tx));

            if (tx.to !== ethScanAddress && tx.from !== ethScanAddress) {
                log("error :: returned data :: to :: " + tx.to + " :: from :: " + tx.from + " :: from etherum relay does not match :: " + ethScanAddress + " :: " + JSON.stringify(tx));

                errorDetected = true;
                return;
            }
        }

        var addressInfo = this._addressMap[ethScanAddress];
        if (!addressInfo) {
            log("error :: returned data from eth api host does not match an existing address.");
            return;
        }

        addressInfo.updatedTimestamp = now;

        if (!errorDetected) {
            // Mark the address as used
            if (!addressInfo.used) {
                log("ethereum :: address :: " + ethScanAddress + " :: is now accounted for.");

                addressInfo.used = true;
                if (addressInfo.internal && addressInfo.index > this._lastChangeIndex) {
                    this._lastChangeIndex = addressInfo.index;
                    this._currentChangeAddress = null;

                } else if (!addressInfo.internal && addressInfo.index > this._lastReceiveIndex) {
                    this._lastReceiveIndex = addressInfo.index;
                    this._currentReceiveAddress = null;
                }

                updated = true;
            }

            var transactions = {};

            for (var i = 0; i < data.result.length; i++) {
                var tx = data.result[i];

                transactions[tx.hash] = tx;
            }

            this._updateTransactionsEthereum(transactions, ethScanAddress);
        } else {
            return;
        }
    }

    if (updated) {
        this.update();
    }
}

HDWalletWorker.prototype._updateTransactionsEthereum = function(transactions, ethScanAddress) {
    var updated = {};

    var totalBalance = 0;

//    log("ethereum :: _updateTransactionsEthereum :: " + Object.keys(transactions).length + " :: ethScanAddress :: " + ethScanAddress);

    for (var txid in transactions) {
        var transaction = transactions[txid];

        var existingTransaction = this._transactions[transaction.hash + "_" + ethScanAddress];

        if (!existingTransaction) {
            log("ethereum :: found new TX :: " + JSON.stringify(transaction) + " :: ethScanAddress :: " + ethScanAddress);
            var txDelta = 0;

            //@note: need to reverse the to and from fields in the case where the address has sent.

            var addressInfo = this._addressMap[ethScanAddress];
            var isSender = false;

            if (transaction.to == ethScanAddress) {
                if (typeof(addressInfo) !== "undefined" && addressInfo !== null) {
                    //                log("ethereum :: tx add :: " + JSON.stringify(addressInfo) + " :: " + transaction.value);
                    txDelta = transaction.value;
                }
            } else if (transaction.from == ethScanAddress) {
                if (typeof(addressInfo) !== "undefined" && addressInfo !== null) {
                    //                    log("ethereum :: tx subtract :: " + JSON.stringify(addressInfo) + " :: " + transaction.value);
                    txDelta = -transaction.value;
                    isSender = true;
                }
            } else {
                log("error :: _updateTransactionsEthereum :: tx has no mapping :: " + JSON.stringify(transaction));
            }

//            log("ethereum :: tx AddressInfo :: " + JSON.stringify(addressInfo));

//            if (this._addressMap[transaction.to] && this._addressMap[transaction.from]) {
//                txDelta = 0;
//                isSender = true;
////                console.log("error :: tx has both from and to and only one will count")
//            }
//
            if (addressInfo !== null) {
//                console.log("tx :: from :: " + transaction.from + " :: " + transaction.to + " :: theDAOAddress :: " + HDWalletHelper.theDAOAddress)
                if (transaction.to === HDWalletHelper.theDAOAddress) {
//                    console.log("found theDaoAssociated :: " + transaction.from);
                    addressInfo.isTheDAOAssociated = true;
                }
                if (transaction.to === transaction.from) {
                    txDelta = 0;
                    isSender = true;
                    //                console.log("error :: tx has both from and to and only one will count")
                }

                log("[pre] ethereum :: accountIndex :: " + addressInfo.index + " :: balance :: " + addressInfo.accountBalance);

                //@note: this dictionary deals with cached tx from history items.
                var isAccountProcessedFromCaching = addressInfo.accountTXProcessed[transaction.hash];

                log("[mid] ethereum :: accountIndex :: " + addressInfo.index + " :: isAccountProcessedFromCaching :: " + isAccountProcessedFromCaching + " :: txDelta :: " + txDelta);

                if (typeof(isAccountProcessedFromCaching) === 'undefined' || (isAccountProcessedFromCaching !== null && isAccountProcessedFromCaching === false)) {
                    addressInfo.accountTXProcessed[transaction.hash] = true;
                    if (!isSender) {
                        var txGain = txDelta;
                        addressInfo.accountBalance += parseInt(txGain);
                    } else {
                        var txCostPlusGas = txDelta - (transaction.gasUsed * transaction.gasPrice);
                        addressInfo.accountBalance += parseInt(txCostPlusGas);
                        addressInfo.nonce++;
                    }
                }

                log("[post] ethereum :: accountIndex :: " + addressInfo.index + " :: balance :: " + addressInfo.accountBalance);

                if (!addressInfo.internal && addressInfo.index > this._lastReceiveIndex) {
                    this._lastReceiveIndex = addressInfo.index;
                    this._currentReceiveAddress = null;
                } else if (addressInfo.internal && addressInfo.index > this._lastChangeIndex) {
                    this._lastChangeIndex = addressInfo.index;
                    this._currentChangeAddress = null;
                }
            } else {
                addressInfo = {internal: null, index: null};
                console.log("error :: ethereum tx issue :: " + JSON.stringify(transaction));
            }

            var tx = {
                addressIndex: addressInfo.index,
                addressInternal: addressInfo.internal,
                txid: transaction.hash,
                confirmations: transaction.confirmations,
                blockNumber: transaction.blockNumber,
                timestamp: transaction.timeStamp,
                valueDelta: txDelta,
                gasUsed: transaction.gasUsed,
                gasPrice: transaction.gasPrice,
                to: transaction.to,//(isSender === true) ? transaction.to : transaction.from,
                from: transaction.from//(isSender === true) ? transaction.from : transaction.to
            }

            this._transactions[transaction.hash + "_" + ethScanAddress] = tx;
            updated[transaction.hash + "_" + ethScanAddress] = tx;
        } else {
            if (existingTransaction.confirmations != transaction.confirmations) {
                existingTransaction.confirmations = transaction.confirmations;

                updated[transaction.hash + "_" + ethScanAddress] = existingTransaction;
            }
        }
    }

    // If we have updated any transactions, notify the wallet
    if (Object.keys(updated).length) {
        this.update();
    }

    return updated;
}

HDWalletWorker.prototype._updateBalancesEthereum = function(data) {
    //@note: as of april 18 2016 this was returning message: "OK" and status: 1 even
    //with addresses that were obviously wrong, like invalid hex characters.
    if (!data && data.result) {// || data.status !== 'success') {
        return;
    }

//    log("updated balances :: " + data.result.length);

    //{"status":"1","message":"OK","result":[{"account":"","balance":"0"},{"account":"","balance":"0"},{"account":"0x2434AA3696415A96607278452C468964663f832d","balance":"457513609779999200"},{"account":"b","balance":"0"}]}

    var didUpdate = false;
    var results = data.result;

    for (var i = 0; i < data.result.length; i++) {
        var res = data.result[i];

        var addressInfo = this._addressMap[res.account];

//        log("account :: " + res.account + " :: found new balance :: " + res.balance + " :: comparing to :: " + addressInfo.accountBalance);

        if (addressInfo.accountBalance !== parseInt(res.balance)) {
            addressInfo.accountBalance = parseInt(res.balance);
            didUpdate = true;
        }
    }

    if (didUpdate) {
        this.update();
    }
}

HDWalletWorker.prototype._lookupBitcoinTransactions = function(txids, callback) {
    if (this._coinType === COIN_ETHEREUM) {
        console.log("ethereum lookup");
        return;
    }

    var self = this;

    // Create batches of txid to send to the blockr.io/blockcypher/etc API
    var BATCH_SIZE = 10;
    var batch = [];
    while (txids.length) {
        batch.push(txids.shift());
        if (batch.length === BATCH_SIZE || txids.length === 0) {

            // Request the transactions and utxo for this batch
            var txidParam = batch.join(',');
            RequestSerializer.getJSON(this._STATIC_RELAY_URL + '/api/v1/tx/info/' + txidParam + "?amount_format=string", function(data) {
                self._populateTransactions(data, callback);
            }, true);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorker.prototype._populateTransactions = function(data, callback) {
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

    var updated = this._updateTransactionsBitcoin(transactions);

    if (callback) {
        callback(updated);
    }
}

//@note: @here:
HDWalletWorker.prototype._updateTransactionsBitcoin = function(transactions) {

    var updated = {};
    for (var ti = 0; ti < transactions.length; ti++) {
        //@note: return from blockr.io
        //    {"status":"success","data":{"tx":"bc7597f3f0c170cb8966dc37250eca1b8dab169702299c464b3a82185c2227e7","block":398144,"confirmations":4679,"time_utc":"2016-02-12T22:53:53Z","is_coinbased":0,"trade":{"vins":[{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","is_nonstandard":false,"amount":"-0.05000000","n":1,"type":0,"vout_tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167"}],"vouts":[{"address":"1EqebtAjveBW9KftQx2hbpb6dhx5sDGZGY","is_nonstandard":false,"amount":"0.00100000","n":0,"type":1,"is_spent":1},{"address":"17uAEKxUmvbGusJzj1xrJoSJ4hKo8Te95F","is_nonstandard":false,"amount":"0.04890000","n":1,"type":1,"is_spent":1}]},"vins":[{"address":"156NsCs1jrKbb1zNne6jB2ZqMfBnd6KRve","is_nonstandard":false,"amount":"-0.05000000","n":1,"type":0,"vout_tx":"95132a35aad2186ad57e4683db159df05d6ef1f1d39b3462833417449baf2167"}],"vouts":[{"address":"1EqebtAjveBW9KftQx2hbpb6dhx5sDGZGY","is_nonstandard":false,"amount":"0.00100000","n":0,"type":1,"is_spent":1,"extras":{"asm":"OP_DUP OP_HASH160 97ccfd4bc69a58b992b6c044511b540015d49bed OP_EQUALVERIFY OP_CHECKSIG","script":"76a91497ccfd4bc69a58b992b6c044511b540015d49bed88ac","reqSigs":1,"type":"pubkeyhash"}},{"address":"17uAEKxUmvbGusJzj1xrJoSJ4hKo8Te95F","is_nonstandard":false,"amount":"0.04890000","n":1,"type":1,"is_spent":1,"extras":{"asm":"OP_DUP OP_HASH160 4bae16df222714bb1dc833fd2511d7fb301ad444 OP_EQUALVERIFY OP_CHECKSIG","script":"76a9144bae16df222714bb1dc833fd2511d7fb301ad44488ac","reqSigs":1,"type":"pubkeyhash"}}],"fee":"0.00010000","days_destroyed":"0.00","is_unconfirmed":false,"extras":null},"code":200,"message":""}

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
                //@note: @here: @todo: I'm relatively sure this is where the "nulls" come from when
                //you send the BTC to yourself.
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

var hdWalletWorker = new HDWalletWorker();

onmessage = function(message) {
    if (message.data.action === 'initialize') {
        hdWalletWorker.initialize(message.data.coinType, message.data.testNet);
    }
    if (message.data.action === 'setExtendedPublicKeys') {
        hdWalletWorker.setExtendedPublicKeys(message.data.content.receive, message.data.content.change);
    } else if (message.data.action === 'restoreAddressMapCache') {
        var cache = message.data.content.workerCacheAddressMap;

        if (cache) {
            for (var address in cache) {
                hdWalletWorker._addressMap[address] = cache[address];
                hdWalletWorker._watchAddress(address);
            }
        }
    } else if (message.data.action == 'updateAddressMap') {
        var addressMapUpdate = message.data.content.addressMap;

        if (addressMapUpdate) {
            for (var address in addressMapUpdate) {
                hdWalletWorker._addressMap[address] = addressMapUpdate[address];
            }
        }
    } else if (message.data.action === 'triggerExtendedUpdate') {
        if (message.data.content.type && message.data.content.type === 'balances') {
            setTimeout(function() {
                if (hdWalletWorker._coinType === COIN_ETHEREUM) {
                    log("ethereum :: restore address map balance refresh");
                    hdWalletWorker.updateBalancesEthereum();
                }
            }, 10000);
        }
    }else if (message.data.action === 'refresh') {
        log("watcher :: " + hdWalletWorker._coinType + " :: refreshing");

//        var crashy = this.will.crash;

//        log('Refreshing...');
        setTimeout(function () {
            setTimeout(function() {
                if (hdWalletWorker._coinType === COIN_ETHEREUM) {
                    log("ethereum :: manual refresh balance refresh");
                    hdWalletWorker.updateBalancesEthereum();
                }
            }, 10000);

            hdWalletWorker.checkTransactions(0);
        }, 0);
    } else if (message.data.action === 'shutDown') {
        hdWalletWorker.shutDown();
    }
}

setInterval(function() {
    setTimeout(function() {
        if (hdWalletWorker._coinType === COIN_ETHEREUM) {
            log("ethereum :: autorefresh balance refresh");
            hdWalletWorker.updateBalancesEthereum();
        }
    }, 10000);
    hdWalletWorker.checkTransactions(HDWalletWorker.getDefaultTransactionRefreshTime());
}, HDWalletWorker.getDefaultTransactionRefreshTime() + 100);
