importScripts('../../thirdparty.js');
importScripts('../../request.js');
importScripts('../../platform/platformUtils.js');

//importScripts('../network.js');
importScripts('../../jaxx_main/jaxx_constants.js');
importScripts('../../wallet/hdwallet_helper.js');
importScripts('../../wallet/token/coin_token.js');
importScripts('../../wallet/token/coin_token_impl_augur_ethereum.js');
importScripts('../../wallet/token/coin_token_impl_thedao_ethereum.js');

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

var CoinTokenWorker = function() {
    this._tokenName = "";
    this._tokenSymbol = "";
    this._tokenCoinType = 0;

    this._receiveNode = null;
    this._changeNode = null;

    this._transactions = {};
    this._addressMap = {};

    this._isAvailable = true;
//
//    this._lastReceiveIndex = -1;
//    this._currentReceiveAddress = null;
//
//    this._lastChangeIndex = -1;
//    this._currentChangeAddress = null;
//
//    this._addressMap = {};
//
//    this._transactions = {};
//
//    this._watcherQueue = [];
//
//    this._usesWSS = false;
//    this._watcherWebSocket = null;
//
//    this._hasForcedRecheck = false;
}

CoinTokenWorker.getDefaultTransactionRefreshTime = function() {
    return 60000;
}


CoinTokenWorker.prototype.initialize = function(tokenName, tokenSymbol, tokenCoinType) {
    log("[ Initializing " + tokenName + " Token Worker ]");
    this._tokenName = tokenName;
    this._tokenSymbol = tokenSymbol;
    this._tokenCoinType = tokenCoinType;

    this._GATHER_TX = "/api/v1/address/txs/";
    this._GATHER_TX_APPEND = "";

    this._GATHER_UNCONFIRMED_TX = "/api/v1/address/unconfirmed/";

    this._GATHER_TX = "/api/v1/address/txs/";

    this._MULTI_BALANCE = "";
    this._MULTI_BALANCE_APPEND = "";

    var socketUri = "";

    //https://api.etherscan.io/api?module=account&action=tokenbalance&tokenname=TheDAO&address=0x051Da87c3679Be285DC22E2fbA5E833052375ced&tag=latest&apikey=YourApiKeyToken


    if (this._tokenCoinType === CoinToken.TheDAO) {
        socketUri = "";// "wss://api.ether.fund";

//        this._STATIC_RELAY_URL = "http://api.jaxx.io:80/api/thedao";

        //@note: for etherscan.io
        this._STATIC_RELAY_URL = "https://api.etherscan.io/api?module=account";

        this._GATHER_TX = "&tokenname=TheDAO&action=tokenbalance";

        this._GATHER_TX_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;


        this._GATHER_UNCONFIRMED_TX = "";

        this._MULTI_BALANCE = "/balance"//?addresses%5B%5D=";
        //        this._MULTI_BALANCE_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;
    } else if (this._tokenCoinType === CoinToken.Augur) {
        socketUri = "";// "wss://api.ether.fund";

        //        this._STATIC_RELAY_URL = "http://api.jaxx.io:80/api/thedao";

        //@note: for etherscan.io
        this._STATIC_RELAY_URL = "https://api.etherscan.io/api?module=account";

        this._GATHER_TX = "&action=tokenbalance&contractaddress=0x48c80F1f4D53D5951e5D5438B54Cba84f29F32a5";

        this._GATHER_TX_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;


        this._GATHER_UNCONFIRMED_TX = "";

        this._MULTI_BALANCE = "/balance"//?addresses%5B%5D=";
        //        this._MULTI_BALANCE_APPEND = "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan;
    }
//
//    var self = this;
//
//    if (socketUri !== "") {
//        this._usesWSS = true;
//        this._watcherWebSocket = new WebSocket(socketUri);
//
//
//        this._watcherWebSocket.onopen = function() {
//
//            setInterval(function(){
//                hdWalletWorkerManager_sendPing();
//                //Will reply with pong
//            }, 18000); //send a ping every 20 seconds more or less to avoid getting disconnected
//
//            // We set the watcherQueue to null to indicate we are connected
//            var watcherQueue = self._watcherQueue;
//            self._watcherQueue = null;
//
//            for (var i = 0; i < watcherQueue.length; i++) {
//                self._watchAddress(watcherQueue[i]);
//            }
//        };
//
//
//        this._watcherWebSocket.onmessage = function(event) {
//            if (!event || !event.data) {
//                return;
//            }
//
//            var data = JSON.parse(event.data);
//            //            log("message from socket : "+ JSON.stringify(data));
//
//            if(data.block_height == -1){ //tx not included in any block. schedule a refresh of tx in 10 seconds
//                setTimeout(function () {
//                    hdWalletWorkerManagercheckTransactions(0);
//                }, 12000);
//            }
//
//            /*
//        if (data.payload && data.payload.transaction_hash) {
//            // Retry up to 10 times, with "exponential back-off" (not true exponential back-off)
//            (function(txid) {
//
//                var startTime = (new Date()).getTime();
//                var retry = 0;
//                var lookupTransaction = function() {
//
//                    self._lookupBitcoinTransactions([txid], function (updated) {
//                        if (!updated[txid] && retry < 10) {
//
//                            timeout = 1.5 + Math.pow(1.4, retry++);
//                            setTimeout(lookupTransaction, timeout * 1000);
//                        }
//                    });
//                }
//
//                setTimeout(lookupTransaction, 0);
//            })(data.payload.transaction_hash);
//        }
//        */
//        };
//
//        // @TODO: onerror, re-connect
//        this._watcherWebSocket.onerror = function(event) {
//            log("watcher :: " + this._coinType + " :: error :: " + JSON.stringify(event));
//        }
//    }
}

CoinTokenWorker.prototype.shutDown = function() {
//    if (this._watcherWebSocket !== null) {
//        if (this._watcherWebSocket.readyState !== WebSocket.CLOSING && this._watcherWebSocket.readyState !== WebSocket.CLOSED) {
//            this._watcherWebSocket.onclose = function() {};
//            this._watcherWebSocket.close();
//        }
//    }

    close();
}

CoinTokenWorker.prototype._sendPing = function() {
    this._watcherWebSocket.send("{ \"event\": \"ping\" }");
}

//@note: @here: should it remove addresses if they are in the addressinfo but not passed into this function.

CoinTokenWorker.prototype.setTokenAddresses = function(transferableTokenAddresses, votableTokenAddresses) {
    var transferableUpdateDict = {};
    var votableUpdateDict = {};

    for (var i = 0; i < transferableTokenAddresses.length; i++) {
        var curAddress = transferableTokenAddresses[i];

        var addressInfo = this._addressMap[curAddress];

        if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {

        } else {
            addressInfo = this.createNewAddressMapping(curAddress);
        }

        addressInfo.isTransferable = true;

        transferableUpdateDict[curAddress] = true;
    }

    for (var i = 0; i < votableTokenAddresses.length; i++) {
        var curAddress = votableTokenAddresses[i];

        var addressInfo = this._addressMap[curAddress];

        if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {

        } else {
            addressInfo = this.createNewAddressMapping(curAddress);
        }

        addressInfo.isVotable = true;

        votableUpdateDict[curAddress] = true;
    }

    for (var curAddress in this._addressMap) {
        var addressInfo = this._addressMap[curAddress];

        if (addressInfo.isTransferable === true && (typeof(transferableUpdateDict[curAddress]) === 'undefined' || transferableUpdateDict[curAddress] === null)) {
            addressInfo.isTransferable = false;
        }

        if (addressInfo.isVotable === true && (typeof(votableUpdateDict[curAddress]) === 'undefined' || votableUpdateDict[curAddress] === null)) {
            addressInfo.isVotable = false;
        }
    }

//    log("addressMap :: " + JSON.stringify(this._addressMap));

    this.updateBalances();
}

CoinTokenWorker.prototype.createNewAddressMapping = function(newAddress) {
    this._addressMap[newAddress] = {balance: 0, isTransferable: false, isVotable: false, isBlocked: false};

    return this._addressMap[newAddress];
}

CoinTokenWorker.prototype.updateTokenData = function() {
    //@note: @todo: updateTokenData should check for existing addresses and only call update if necessary.
    for (var i = 0; i < this._votableAddresses; i++) {

    }
}

CoinTokenWorker.prototype.updateBalances = function() {
    this._updateBalances();
}

CoinTokenWorker.prototype._updateBalances = function() {
    var addressesToCheck = [];

    for (var address in this._addressMap) {
        var addressInfo = this._addressMap[address];

        if (typeof(addressInfo) !== "undefined" && addressInfo !== null && addressInfo.isTransferable === true) {
            addressesToCheck.push(address);
        }
    }

    var requestCounter = {numRequests: addressesToCheck.length, processedRequestCount: 0, batchUpdateSize: 20, curBatchCount: 0};

//    console.log("addressesToCheck :: " + JSON.stringify(addressesToCheck) + " :: " + addressesToCheck.length);

    var self = this;

    //https://api.etherscan.io/api?module=account&action=tokenbalance&tokenname=TheDAO&address=0x051Da87c3679Be285DC22E2fbA5E833052375ced&tag=latest&apikey=YourApiKeyToken

    requestCounter.batchSize = 1; //@note: for etherscan.io

    var batch = [];
    while (addressesToCheck.length) {
        batch.push(addressesToCheck.shift());
        if (batch.length === requestCounter.batchSize || addressesToCheck.length === 0) {

//            var addressParam = batch.join('&addresses%5B%5D=');
            //            log("get dao balances :: " + this._STATIC_RELAY_URL + this._MULTI_BALANCE + "?addresses%5B%5D=" + addressParam);

            //            log("checking :: " + batch + " :: " + batch.length + " :: " + this._STATIC_RELAY_URL + this._MULTI_BALANCE + addressParam + this._MULTI_BALANCE_APPEND);

            var addressParam = batch;

            var requestString = this._STATIC_RELAY_URL + this._GATHER_TX + '&address=' + addressParam + this._GATHER_TX_APPEND;
//            var requestString = this._STATIC_RELAY_URL + this._MULTI_BALANCE + "?addresses%5B%5D=" + addressParam;

//            log("requestString :: " + requestString);
//            @note: @here: request the account balances for this batch
            RequestSerializer.getJSON(requestString, function(data, success, passthroughParam) {
                passthroughParam.requestCounter.processedRequestCount += 1;
                passthroughParam.requestCounter.curBatchCount += 1;

//                log("updateBalancesTheDAO :: success :: " + JSON.stringify(success));
//                log("updateBalancesTheDAO :: data :: " + JSON.stringify(data));
                if (success === 'success') {
                    //@note: api.jaxx.io
//                    var balanceString = "";
//                    for (var i = 0; i < passthroughParam.length; i++) {
//                        if (typeof(self._addressMap[passthroughParam[i]]) !== 'undefined' && self._addressMap[passthroughParam[i]] !== null) {
//                            self._addressMap[passthroughParam[i]].balance = parseInt(data[i]);
//                        }
//
//
//                        balanceString += passthroughParam[i] + " :: " + data[i] + "\n";
//                    }
//                    log("balances received :: \n" + balanceString);

                    //@note: returned data from etherscan.io:
                    //{"status":"1","message":"OK","result":"20000000000000000"}

                    if (data && data.status && data.status === '1') {
                        var foundBalance = parseInt(data.result);

//                        console.log("passthroughParam :: " + passthroughParam);
                        self._addressMap[passthroughParam.batch].balance = foundBalance;
                    } else {
                        log("CoinTokenWorker :: updateBalances :: error :: " + data.status);
                    }

                    if (passthroughParam.requestCounter.curBatchCount >= passthroughParam.requestCounter.batchUpdateSize) {
                        passthroughParam.requestCounter.curBatchCount = 0;
                        self.update();
                    } else if (passthroughParam.requestCounter.processedRequestCount === passthroughParam.requestCounter.numRequests) {
                        self.update();
                    }
                } else {
                    log("CoinTokenWorker :: updateBalances :: error :: " + success);
                }

                if (passthroughParam.requestCounter.processedRequestCount === passthroughParam.requestCounter.numRequests) {
                    self.update();
                }
            }, null, {batch: batch, requestCounter: requestCounter});

            batch = [];
        }
    }
}

CoinTokenWorker.prototype.update = function() {
    //    log("watcher :: " + this._coinType + " :: update :: " + this._transactions.length);
    var updates = {
        transactions: this._transactions,
        workerCacheAddressMap: this._addressMap,
    }

//    if (!this._currentReceiveAddress) {
//        this._currentReceiveAddress = HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode.derive(this._lastReceiveIndex + 1)).toString();
//
//        updates.currentReceiveAddress = this._currentReceiveAddress;
//
//        //@note:@todo:@here:
//        if (this._coinType === COIN_BITCOIN) {
//            updates.smallQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 3, margin: 1}).toString('base64');
//            updates.largeQrCode = "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this._currentReceiveAddress, {type: "png", ec_level: "H", size: 7, margin: 4}).toString('base64');
//        } else if (this._coinType === COIN_ETHEREUM) {
//            //@note: given the ICAP library issue and the fact that this is effectively an isolated "thread", ethereum can regenerate its QR codes later on.
//        }
//    }

//    if (!this._currentChangeAddress) {
//        this._currentChangeAddress = HDWalletPouch.getCoinAddress(this._coinType, this._changeNode.derive(this._lastChangeIndex + 1)).toString();
//        updates.currentChangeIndex = this._lastChangeIndex + 1;
//        updates.currentChangeAddress = this._currentChangeAddress;
//    }

//    if (typeof(forcePouchRecheck) !== 'undefined' && forcePouchRecheck !== null) {
//        updates.forceRecheck = true;
//    }

    postMessage({action: 'update', content: updates});
}

var coinTokenWorker = new CoinTokenWorker();

onmessage = function(message) {
    if (message.data.action === 'initialize') {
//        log("message.data :: " + JSON.stringify(message.data));
        var mainCoinType = CoinToken.getTokenToMainTypeMap(message.data.content.tokenCoinType);

        var cryptoCurrenciesAllowed = {};
        if (PlatformUtils.mobileiOSCheck()) {
            cryptoCurrenciesAllowed = HDWalletHelper.cryptoCurrenciesAllowed.ios;
        } else {
            cryptoCurrenciesAllowed = HDWalletHelper.cryptoCurrenciesAllowed.regular;
        }

        for (var curCryptoName in HDWalletHelper.dictCryptoCurrency) {
            var curCryptoDict = HDWalletHelper.dictCryptoCurrency[curCryptoName];

            if (curCryptoDict.index === mainCoinType) {
                if (typeof(cryptoCurrenciesAllowed[curCryptoName]) !== 'undefined' &&
                    cryptoCurrenciesAllowed[curCryptoName] !== null &&
                    cryptoCurrenciesAllowed[curCryptoName] === true) {
                    this._isAvailable = true;
                } else {
                    this._isAvailable = false;
                }

                break;
            }
        }

        if (this._isAvailable !== true) {
            var curDoDebugLog = doDebug;
            doDebug = true;
            log("[ CoinTokenWorker ] :: crypto disabled :: " + mainCoinType);
            doDebug = curDoDebugLog;

            return;
        }

        coinTokenWorker.initialize(message.data.content.tokenName, message.data.content.tokenSymbol, message.data.content.tokenCoinType);
    }
    if (message.data.action === 'setTokenAddresses') {
        var transferableTokenAddresses = message.data.content.transferableTokenAddresses;
        var votableTokenAddresses = message.data.content.votableTokenAddresses;
        coinTokenWorker.setTokenAddresses(transferableTokenAddresses, votableTokenAddresses);
    } else if (message.data.action === 'restoreAddressMapCache') {
        var cache = message.data.content.workerCacheAddressMap;

        if (cache) {
            for (var address in cache) {
//                coinTokenWorker._addressMap[address] = cache[address];
//                hdWalletWorker._watchAddress(address);
            }
        }
    } else if (message.data.action == 'updateAddressMap') {
        var addressMapUpdate = message.data.content.addressMap;

        if (addressMapUpdate) {
            for (var address in addressMapUpdate) {
//                hdWalletWorker._addressMap[address] = addressMapUpdate[address];
            }
        }
    } else if (message.data.action === 'triggerExtendedUpdate') {
        if (message.data.content.type && message.data.content.type === 'balances') {
//            setTimeout(function() {
//                if (hdWalletWorker._coinType === COIN_ETHEREUM) {
//                    log("ethereum :: restore address map balance refresh");
//                    hdWalletWorker.updateBalancesEthereum();
//                }
//            }, 10000);
        }
    }else if (message.data.action === 'refresh') {
        console.log("watcher :: " + coinTokenWorker._tokenName + " :: refreshing");

        //        var crashy = this.will.crash;

        //        log('Refreshing...');
        setTimeout(function () {
            coinTokenWorker.updateBalances();
        //            hdWalletWorker.checkTransactions(0);
        }, 0);
    } else if (message.data.action === 'shutDown') {
        coinTokenWorker.shutDown();
    }
}

setInterval(function() {
    setTimeout(function() {
        coinTokenWorker.updateBalances();
    }, 20000);

//    hdWalletWorker.checkTransactions(HDWalletWorker.getDefaultTransactionRefreshTime());

}, CoinTokenWorker.getDefaultTransactionRefreshTime() + 100);
