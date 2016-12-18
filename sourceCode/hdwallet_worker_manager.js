/**
 *  Wallet Worker
 *
 *  Every 90 seconds, request info for all addresses that haven't been updated in the last 60s?
 */

importScripts('../platform/platformUtils.js');
importScripts('../thirdparty.js');
importScripts('../request.js');

importScripts('../network.js');
importScripts('../jaxx_main/jaxx_constants.js');

importScripts('../wallet/hdwallet_helper.js');
importScripts('../wallet/hdwallet_pouch.js');

importScripts("../relays/relay_task.js");

importScripts('../wallet/token/coin_token.js');
importScripts('../wallet/token/coin_token_impl_augur_ethereum.js');
importScripts('../wallet/token/coin_token_impl_thedao_ethereum.js');

importScripts('../wallet/hdwallet_worker_impl_bitcoin.js');
importScripts('../wallet/hdwallet_worker_impl_ethereum.js');
importScripts('../wallet/hdwallet_worker_impl_dash.js');
importScripts('../wallet/hdwallet_worker_impl_ethereum_classic.js');
importScripts('../wallet/hdwallet_worker_impl_litecoin.js');
importScripts('../wallet/hdwallet_worker_impl_lisk.js');
importScripts('../wallet/hdwallet_worker_impl_zcash.js');

var doDebug = true;

function log() {
    if (doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('WorkerLog:');
//    console.log(args);
    postMessage({action: 'log', content: args});
}

//@note: @here: for android.
if (typeof(console) === 'undefined' || console === null) {
    console = {};
    console.log = function() {};
}

var HDWalletWorkerManager = function() {
    this._coinType = -1;
    this._coinWorkerImpl = null;

    this._receiveNode = null;
    this._changeNode = null;

    this._lastReceiveIndex = -1;
    this._currentReceiveAddress = null;

    this._lastChangeIndex = -1;
    this._currentChangeAddress = null;

    this._storage = {};

    this._addressMap = {};

    this._transactions = {};

    this._watcherQueue = [];

    this._usesWSS = false;
    this._watcherWebSocket = null;

    this._hasForcedRecheck = false;

    this._relayManager = null;
}

HDWalletWorkerManager.getDefaultTransactionRefreshTime = function() {
    return 60000;
}

HDWalletWorkerManager.prototype.initialize = function(coinType, testNet) {
    this._coinType = coinType;
    this._TESTNET = testNet;

    var self = this;

    var relayManagerParams = HDWalletPouch.getStaticCoinWorkerImplementation(this._coinType).relayManagerParams;

    //@note: @here: @token: this seems necessary.
    if (relayManagerParams.isSupported === true) {
        log("[ HDWalletWorkerManager ] :: setup relay manager :: " + this._coinType);

        importScripts('../relays/relay_manager.js');

        var scopePointer = this;

        importScripts('../relays/' + relayManagerParams.implementationFileName);

        if (this._coinType === COIN_BITCOIN) {
            this._relayManagerImplementation = new RelayManagerBitcoin();
        } else if (this._coinType === COIN_LITECOIN) {
            this._relayManagerImplementation = new RelayManagerLitecoin();
        } else if (this._coinType === COIN_LISK) {
            this._relayManagerImplementation = new RelayManagerLisk();
        } else if (this._coinType === COIN_ZCASH) {
            this._relayManagerImplementation = new RelayManagerZCash();
        }

        this._relayManager = new RelayManager();
        this._relayManager.initialize(this._relayManagerImplementation);

        this._relayManager.setup(function(resultParams) {
            self.finishInitialization();
            postMessage({action: 'didInitialize', content: {}});

            log("[ HDWalletWorkerManager ] :: RelayTests :: fetchBlockHeights :: " + JSON.stringify(resultParams));
        }); // Setup the relays (Stored in a global so that instance data is not discarded.)
    } else {
        log("[ HDWalletWorkerManager ] :: no relay manager :: " + this._coinType);

        this.finishInitialization();
        postMessage({action: 'didInitialize', content: {}});
    }
}

HDWalletWorkerManager.prototype.finishInitialization = function() {
    //@note: @here: @token: this seems necessary.
    if (this._coinType === COIN_BITCOIN) {
        importScripts('../wallet/hdwallet_worker_impl_bitcoin.js');
        importScripts('../wallet/hdwallet_pouch_impl_bitcoin.js');
        this._coinWorkerImpl = new HDWalletWorkerBitcoin();
    } else if (this._coinType === COIN_ETHEREUM) {
        importScripts('../wallet/hdwallet_worker_impl_ethereum.js');
        importScripts('../wallet/hdwallet_pouch_impl_ethereum.js');
        this._coinWorkerImpl = new HDWalletWorkerEthereum();
    } else if (this._coinType === COIN_ETHEREUM_CLASSIC) {
        importScripts('../wallet/hdwallet_worker_impl_ethereum_classic.js');
        importScripts('../wallet/hdwallet_pouch_impl_ethereum_classic.js');
        this._coinWorkerImpl = new HDWalletWorkerEthereumClassic();
    } else if (this._coinType === COIN_DASH) {
        importScripts('../wallet/hdwallet_worker_impl_dash.js');
        importScripts('../wallet/hdwallet_pouch_impl_dash.js');
        this._coinWorkerImpl = new HDWalletWorkerDash();
    } else if (this._coinType === COIN_LITECOIN) {
        importScripts('../wallet/hdwallet_worker_impl_litecoin.js');
        importScripts('../wallet/hdwallet_pouch_impl_litecoin.js');
        this._coinWorkerImpl = new HDWalletWorkerLitecoin();
    } else if (this._coinType === COIN_LISK) {
        importScripts('../wallet/hdwallet_worker_impl_lisk.js');
        importScripts('../wallet/hdwallet_pouch_impl_lisk.js');
        this._coinWorkerImpl = new HDWalletWorkerLisk();
    } else if (this._coinType === COIN_ZCASH) {
        importScripts('../wallet/hdwallet_worker_impl_zcash.js');
        importScripts('../wallet/hdwallet_pouch_impl_zcash.js');
        this._coinWorkerImpl = new HDWalletWorkerZCash();
    }

    log("[ HDWalletWorkerManager ] :: init :: " + this._coinType);

    this._coinWorkerImpl.initialize(this);

    var socketEntryPoint = this._TESTNET ? "test3": "main"; //Switch according to network
    this._blockCypherToken = "443eb2360338caf91c041ddd1464ee86" ; //Current token
    var socketUri = "";

    //@note: @here: @token: this seems necessary, however, may become deprecated with relay managers coming online.

    if (this._coinType === COIN_BITCOIN) {
//        this._STATIC_RELAY_URL = 'https://btc.blockr.io';
//        this._GATHER_TX = "/api/v1/address/txs/";
//        this._GATHER_TX_APPEND = "";
//
//        this._GATHER_UNCONFIRMED_TX = "/api/v1/address/unconfirmed/";
//
//        this._MULTI_BALANCE = "";
//        this._MULTI_BALANCE_APPEND = "";

        socketUri = "wss://socket.blockcypher.com/v1/btc/" + socketEntryPoint;
    } else if (this._coinType === COIN_ETHEREUM) {
//        this._STATIC_RELAY_URL = "https://api.etherscan.io";
//        this._GATHER_TX = "/api?module=account&action=txlist&address=";
//        this._GATHER_TX_APPEND = "&sort=asc&apikey=" + HDWalletHelper.apiKeyEtherScan;
//
//        this._GATHER_UNCONFIRMED_TX = "";
//
//        this._MULTI_BALANCE = "/api?module=account&action=balancemulti&address=";
        this._MULTI_BALANCE_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;

        socketUri = "";// "wss://api.ether.fund";
    } else if (this._coinType === COIN_ETHEREUM_CLASSIC) {
        //@note: @todo: @ethereumclassic
//        this._STATIC_RELAY_URL = "https://api.etherscan.io";
//        this._GATHER_TX = "/api?module=account&action=txlist&address=";
//        this._GATHER_TX_APPEND = "&sort=asc&apikey=" + HDWalletHelper.apiKeyEtherScan;
//
//        this._GATHER_UNCONFIRMED_TX = "";
//
//        this._MULTI_BALANCE = "/api?module=account&action=balancemulti&address=";
//        this._MULTI_BALANCE_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;

        socketUri = "";// "wss://api.ether.fund";
    } else if (this._coinType === COIN_DASH) {

//        if (this.TESTNET) {
//            this._STATIC_RELAY_URL = "http://jaxx-test.dash.org:3001/insight-api-dash";
//        } else {
//            this._STATIC_RELAY_URL = "http://api.jaxx.io:2052/insight-api-dash";
//        }
//
//        this._GATHER_TX = "/addrs/";
//        this._GATHER_TX_APPEND = "/txs?group=1";
//
//        this._GATHER_UNCONFIRMED_TX = "";
//
//        this._MULTI_BALANCE = "";
//        this._MULTI_BALANCE_APPEND = "";

        var socketUri = "";
    }

    var self = this;

    if (socketUri !== "") {
        this._usesWSS = true;
        this._watcherWebSocket = new WebSocket(socketUri);


        this._watcherWebSocket.onopen = function() {

            setInterval(function(){
                hdWalletWorkerManager._sendPing();
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
                    hdWalletWorkerManager.checkTransactions(0);
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

HDWalletWorkerManager.prototype.shutDown = function() {
    if (this._watcherWebSocket !== null) {
        if (this._watcherWebSocket.readyState !== WebSocket.CLOSING && this._watcherWebSocket.readyState !== WebSocket.CLOSED) {
            this._watcherWebSocket.onclose = function() {};
            this._watcherWebSocket.close();
        }
    }

    close();
}

HDWalletWorkerManager.prototype._sendPing = function() {
    this._watcherWebSocket.send("{ \"event\": \"ping\" }");
}


HDWalletWorkerManager.prototype._watchAddress = function(address) {
    if (this._usesWSS) {
        if (this._watcherQueue !== null) {

            this._watcherQueue.push(address);

        } else {
            this._watcherWebSocket.send("{ \"event\": \"tx-confirmation\" , \"address\" : \"" + address + "\" ,\"token\": \"" + this._blockCypherToken + "\" }");
            this._watcherWebSocket.send("{ \"event\": \"unconfirmed-tx\" , \"address\" : \"" + address + "\" ,\"token\": \"" + this._blockCypherToken + "\" }");
        }
    } else {

    }
}

HDWalletWorkerManager.prototype.setExtendedPublicKeys = function(receivePublicKey, changePublicKey) {
    var coinNetwork = null;

    if (this._TESTNET) {
        coinNetwork = HDWalletPouch.getStaticCoinPouchImplementation(this._coinType).networkDefinitions.testNet;
    } else {
        coinNetwork = HDWalletPouch.getStaticCoinPouchImplementation(this._coinType).networkDefinitions.mainNet;
    }

    log(this._coinType + " :: coinNetwork :: " + coinNetwork);

    this._receiveNode = thirdparty.bitcoin.HDNode.fromBase58(receivePublicKey, coinNetwork);
    this._changeNode = thirdparty.bitcoin.HDNode.fromBase58(changePublicKey, coinNetwork);

    var self = this;
    setTimeout(function() {
        self.checkTransactions(0);
    }, 500);
}

HDWalletWorkerManager.prototype.update = function(forcePouchRecheck) {
//    log("watcher :: " + this._coinType + " :: update :: " + this._transactions.length);
    var updates = {
        transactions: this._transactions,

        //@note: @todo: @storage: send the updated storage.

        workerCacheAddressMap: this._addressMap,
    }

    if (!this._currentReceiveAddress) {
        this._currentReceiveAddress = HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode.derive(this._lastReceiveIndex + 1)).toString();

        updates.currentReceiveAddress = this._currentReceiveAddress;

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

HDWalletWorkerManager.prototype.postFinishedFinalBalanceUpdate = function() {
    postMessage({action: 'finishedFinalBalanceUpdate', content: {}});
}

HDWalletWorkerManager.prototype.getAddressInfoLastUsedAndHighestDict = function() {
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

    return {lastUsedReceiveIndex: lastUsedReceiveIndex,
            lastUsedChangeIndex: lastUsedChangeIndex,
            highestReceiveIndex: highestReceiveIndex,
            highestChangeIndex: highestChangeIndex};
}

HDWalletWorkerManager.prototype.checkTransactions = function(addressesOrMinimumAge) {
    if (this._coinType === COIN_DASH) {
//        console.log("dash :: checkTransactions")
    }
//        if (this._coinType === COIN_ETHEREUM) {
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

    var lastAndHighestDict = this.getAddressInfoLastUsedAndHighestDict();


//    if (this._coinType === COIN_ETHEREUM) {
//        log("watcher :: " + this._coinType + " :: address used :: " + JSON.stringify(addressInfo));
//    }


    var neededGenerate = false;

    // Now see if we need to generate another receive address
    if (lastAndHighestDict.lastUsedReceiveIndex + 20 > lastAndHighestDict.highestReceiveIndex) {
        var index = lastAndHighestDict.highestReceiveIndex + 1;
        var address = HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode.derive(index)).toString();

//        if (this._coinType === COIN_ETHEREUM) {
//            log("watcher :: " + this._coinType + " :: address :: " + address + " :: index :: " + index + " :: receiveNode :: " +  this._receiveNode.derive(index) + " :: lastUsedReceiveIndex :: " + lastUsedReceiveIndex + " :: highestReceiveIndex :: " + highestReceiveIndex);
//        }

        this._addressMap[address] = {index: index, internal: 0, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0, isTheDAOAssociated: false, isAugurAssociated: false};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // Now see if we need to generate another change address
    if (lastAndHighestDict.lastUsedChangeIndex + 20 > lastAndHighestDict.highestChangeIndex) {
        var index = lastAndHighestDict.highestChangeIndex + 1;
        var address = HDWalletPouch.getCoinAddress(this._coinType, this._changeNode.derive(index)).toString();
//        if (this._coinType === COIN_ETHEREUM) {
//            log("watcher :: " + this._coinType + " :: address :: " + address +  " :: index :: " + index + " :: changeNode :: " +  this._changeNode.derive(index) + " :: lastUsedChangeIndex :: " + lastUsedChangeIndex + " :: highestChangeIndex :: " + highestChangeIndex);
//        }
        this._addressMap[address] = {index: index, internal: 1, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0, isTheDAOAssociated: false, isAugurAssociated: false};
        this._watchAddress(address);

        neededGenerate = true;
    }

    // If we had to generate an address, reschedule in the near future generating some more
    if (neededGenerate) {
//        if (hdWalletWorkerManager._coinType === COIN_ETHEREUM) {
//            log("ethereum :: set timeout");
//        }
        setTimeout(function() {
//            if (hdWalletWorkerManager._coinType === COIN_ETHEREUM) {
//                log("ethereum :: updating");
//            }
            hdWalletWorkerManager.checkTransactions(HDWalletWorkerManager.getDefaultTransactionRefreshTime());
        }, 500);
    } else {
        this._performRecheckIfNecessary();
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
    if (this._coinType === COIN_DASH) {
//        log("dash :: addresses :: " + JSON.stringify(addresses));
    }

    this._batchScanBlockchain(addresses);
}

HDWalletWorkerManager.prototype._performRecheckIfNecessary = function() {
    if (this._hasForcedRecheck === false) {
        this._hasForcedRecheck = true;

        this._coinWorkerImpl.performRecheck();
    }
}

HDWalletWorkerManager.prototype._manuallyAddAddress = function(address) {
    var addressInfo = this._addressMap[address];

    if (typeof(addressInfo) === 'undefined' || addressInfo === null) {
        this._addressMap[address] = {index: index, internal: 1, updatedTimestamp: 0, accountBalance: 0, accountTXProcessed: {}, nonce: 0};
        this._watchAddress(address);
    }

    this._batchScanBlockchain([address]);
}

HDWalletWorkerManager.prototype._batchScanBlockchain = function(addresses) {
    this._coinWorkerImpl.batchScanBlockchain(addresses);
}

HDWalletWorkerManager.prototype.updateWorkerManager = function(updateDict) {
    //@note: @format:
    //transactions: array
    //last receive/change node indexes: integers.
    //current receive/change node addresses: null or string.

    if (typeof(updateDict) !== 'undefined' && updateDict !== null) {
        if (typeof(updateDict.clearTransactions) !== 'undefined' && updateDict.clearTransactions !== null) {
            if (updateDict.clearTransactions === true) {
                this._transactions = {};
            }
        }

        if (typeof(updateDict.transactions) !== 'undefined' && updateDict.transactions !== null) {
            for (var txid in updateDict.transactions) {
                this._transactions[txid] = updateDict.transactions[txid];
            }
        }

        if (typeof(updateDict.lastReceiveIndex) !== 'undefined' && updateDict.lastReceiveIndex !== null) {
            this._lastReceiveIndex = updateDict.lastReceiveIndex;
            this._currentReceiveAddress = updateDict.currentReceiveAddress;
            this._lastChangeIndex = updateDict.lastChangeIndex;
            this._currentChangeAddress = updateDict.currentChangeAddress;
        }

        if (typeof(updateDict.updated) !== 'undefined' && updateDict.updated !== null) {
            if (updateDict.updated === true) {
                this.update();
            }
        }
    }
}

var hdWalletWorkerManager = new HDWalletWorkerManager();

onmessage = function(message) {
    if (message.data.action === 'initialize') {
        var srcName = message.data.sourceName;
        hdWalletWorkerManager.initialize(message.data.coinType, message.data.testNet);
    }
    if (message.data.action === 'setExtendedPublicKeys') {
        hdWalletWorkerManager.setExtendedPublicKeys(message.data.content.receive, message.data.content.change);
    } else if (message.data.action === 'restoreAddressMapCache') {
        //@note: @todo: @storage: retrieve the updated storage.

        var cache = message.data.content.workerCacheAddressMap;

        if (cache) {
            for (var address in cache) {
                hdWalletWorkerManager._addressMap[address] = cache[address];
                hdWalletWorkerManager._watchAddress(address);
            }
        }
    } else if (message.data.action == 'updateAddressMap') {
        var addressMapUpdate = message.data.content.addressMap;

        if (addressMapUpdate) {
            for (var address in addressMapUpdate) {
                hdWalletWorkerManager._addressMap[address] = addressMapUpdate[address];
            }
        }
    } else if (message.data.action === 'triggerExtendedUpdate') {
        if (message.data.content.type && message.data.content.type === 'balances') {
            setTimeout(function() {
                if (hdWalletWorkerManager._coinType === COIN_ETHEREUM || hdWalletWorkerManager._coinType === COIN_ETHEREUM_CLASSIC) {
                    log(hdWalletWorkerManager._coinWorkerImpl._coinName + " :: restore address map balance refresh");
                    hdWalletWorkerManager._coinWorkerImpl.updateBalances();
                }
            }, 10000);
        }
    } else if (message.data.action === 'refresh') {
        log("watcher :: " + hdWalletWorkerManager._coinType + " :: refreshing");

//        var crashy = this.will.crash;

//        log('Refreshing...');
        setTimeout(function () {
            setTimeout(function() {
                if (hdWalletWorkerManager._coinType === COIN_ETHEREUM || hdWalletWorkerManager._coinType === COIN_ETHEREUM_CLASSIC) {
                    log(hdWalletWorkerManager._coinWorkerImpl._coinName + " :: manual refresh balance refresh");
                    hdWalletWorkerManager._coinWorkerImpl.updateBalances();
                }
            }, 10000);

            hdWalletWorkerManager.checkTransactions(0);
        }, 0);
    } else if (message.data.action === 'shutDown') {
        hdWalletWorkerManager.shutDown();
    }
}

setInterval(function() {
    setTimeout(function() {
        if (hdWalletWorkerManager._coinType === COIN_ETHEREUM) {
            log("ethereum :: autorefresh balance refresh");
            hdWalletWorkerManager._coinWorkerImpl.updateBalances();
        }
    }, 10000);
    hdWalletWorkerManager.checkTransactions(HDWalletWorkerManager.getDefaultTransactionRefreshTime());
}, HDWalletWorkerManager.getDefaultTransactionRefreshTime() + 100);
