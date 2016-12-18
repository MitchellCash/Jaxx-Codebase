/*


Ethereum:

There's the creation of the HD wallet structure, when individual transactions come in they are placed in receive nodes.

When a send occurs, the receives nodes, highest index to lowest, are checked for a proper balance.

From here, there are two options: the first is that the receive nodes could forward balances to another internal change node, in which case the change node would have a balance and the sending could be from that. This would have a degree of latency to the transaction as the sweep phase would need to be completed ("cleared") before the actual transaction could be sent out.

The second, which is being implemented here, is that the lowest index that has the balance available is used. If that isn't enough, more nodes with higher indexes are used. While not taking additional time to clear, this has the side effect that multiple small receive nodes are necessarily compiled and sent with larger transaction fees than you'd need for one transaction.

*/

var HDWalletPouch = function() {
    this._coinType = -1;

    this._networkTypeString = "";
    this._hdCoinType = -1;
    this._coinFullName = "";

    this._mnemonic = "";
    this._storageKey = "";

    this._w_addressMap = {};

    this._currentReceiveAddress = null;
    this._currentChangeAddress = null;

    this._seedHex = null;
    this._rootNode = null;
    this._accountNode = null;
    this._receiveNode = null;
    this._changeNode = null;

    this._privateKeyCache = {};
    this._publicAddressCache = {};
    this._checkAddressCache = {};

    this._spendableBalance = null;

    this._sortedHighestAccountArray = null;

    this._currentChangeIndex = 0;
    this._transactions = {};

    this._defaultTXFee = -1;
    this._listeners = [];

    this._currentBlock = -1;
    this._blockRequestTimeout = 10000;

    this._smallQrCode = null;
    this._largeQrCode = null;

    this._helper = null;

//    this._customEthereumGasPrice = HDWalletHelper.getDefaultEthereumGasPrice();

    this._log = [];
    this._logger = console;


    this._TESTNET = false;

    this._NETWORK = null;
    this._STATIC_RELAY_URL = "";

    this._txCacheValid = false;
    this._wkrCacheValid = false;

    this._hasInitRefresh = false;
}

HDWalletPouch._derive = function(node, index, hardened) {
    if (hardened) {
        return node.deriveHardened(index)
    } else {
        return node.derive(index);
    }
}

HDWalletPouch.getCoinAddress = function(coinType, node) {
    if (coinType === COIN_BITCOIN) {
        var pubKey = node.keyPair.getPublicKeyBuffer();

        var pubKeyHash = thirdparty.bitcoin.crypto.hash160(pubKey);

        var payload = new Buffer(21);
        payload.writeUInt8(node.keyPair.network.pubKeyHash, 0);
        pubKeyHash.copy(payload, 1);

        var address = thirdparty.bs58check.encode(payload);

//        console.log("[bitcoin] address :: " + address);
        return address;
    } else if (coinType === COIN_ETHEREUM) {
//        console.log("[ethereum] node :: " + node);
        var ethKeyPair = node.keyPair;
//        console.log("[ethereum] keyPair :: " + ethKeyPair.d + " :: " + ethKeyPair.__Q);

        var prevCompressed = ethKeyPair.compressed;
        ethKeyPair.compressed = false;

        var ethKeyPairPublicKey = ethKeyPair.getPublicKeyBuffer();

        var pubKeyHexEth = ethKeyPairPublicKey.toString('hex').slice(2);

        var pubKeyWordArrayEth = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHexEth);

        var hashEth = thirdparty.CryptoJS.SHA3(pubKeyWordArrayEth, { outputLength: 256 });

        var addressEth = hashEth.toString(thirdparty.CryptoJS.enc.Hex).slice(24);

        ethKeyPair.compressed = prevCompressed;

//        console.log("[ethereum] address :: " + addressEth);
        return "0x" + addressEth;
    }
}

HDWalletPouch.getLightwalletEthereumAddress = function(node) {
    //        console.log("[ethereum] node :: " + node);
    var ethKeyPair = node.keyPair;
    //        console.log("[ethereum] keyPair :: " + ethKeyPair.d + " :: " + ethKeyPair.__Q);

    //@note: @here: hack to get the Q to regenerate on the next 'get', triggered by getPublicKeyBuffer.
    //        ethKeyPair.__Q = null;

    var prevCompressed = ethKeyPair.compressed;

    ethKeyPair.compressed = false;

    var ethKeyPairPublicKey = ethKeyPair.getPublicKeyBuffer();

    var pubKeyHexEth = ethKeyPairPublicKey.toString('hex').slice(2);

    var pubKeyWordArrayEth = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHexEth);

    var hashEth = thirdparty.CryptoJS.SHA3(pubKeyWordArrayEth, { outputLength: 256 });

    var addressEth = hashEth.toString(thirdparty.CryptoJS.enc.Hex).slice(24);

    ethKeyPair.compressed = prevCompressed;

    //        console.log("[ethereum] address :: " + addressEth);
    return "0x" + addressEth;
}

HDWalletPouch.prototype.setup = function(coinType, testNet, helper) {
    this._coinType = coinType;

    this._helper = helper;

    var networkTypeString = HDWalletHelper.getNetworkTypeStringForCoinType(coinType, testNet);
    this._networkTypeString = networkTypeString;

    //@note: @todo: adding ethereum testnet support.
    var hdCoinType = this._helper.getHDCoinType(coinType, testNet);
    this._hdCoinType = hdCoinType;

    this._coinFullName = coinFullName[coinType];
    console.log("[ HDWalletPouch Setup :: " + this._coinFullName + " ]");


    this._TESTNET = testNet;

    if (this._coinType === COIN_BITCOIN) {
        if (this._TESTNET) {
            this._NETWORK = thirdparty.bitcoin.networks.testnet;
            this._STATIC_RELAY_URL = 'https://tbtc.blockr.io';
        } else {
            this._STATIC_RELAY_URL = 'https://btc.blockr.io';
        }

    } else if (this._coinType === COIN_ETHEREUM) {
        this._STATIC_RELAY_URL = "https://api.etherscan.io";
        this._GATHER_TX = "api?module=account&action=txlist&address=";
        this._GATHER_TX_APPEND = "&sort=asc"

        this._GATHER_UNCONFIRMED_TX = "";
    }

}

HDWalletPouch.prototype.initializeWithMnemonic = function(encMnemonic, mnemonic) {
    //@note: @security: this should not need to use the decrypted mnemonic as it's only an identifier, but it's needed for backwards compatibility.

    this._storageKey = thirdparty.bitcoin.crypto.sha256(mnemonic + this._networkTypeString).toString('hex');

    this.zeroPtEighteenCheckAndClearCache();

    var transactionCache = getStoredData('wTxCache_' + this._coinFullName + "_" + this._storageKey, true);

//    console.log("tx cache :: " + transactionCache + " :: " + this._coinFullName);

    if (transactionCache) {
        try {
            this._transactions = JSON.parse(transactionCache);
        } catch (e) {
            console.log(e);
        }
    }

    this._mnemonic = mnemonic;

    this.loadAndCache();

    this._defaultTXFee = HDWalletHelper.getDefaultRegulatedTXFee(this._coinType);

    this.update();

    var self = this;

    this._requestBlockNumber(function(err) {
        if (err) {
            console.log("initializeWithMnemonic :: error :: " + err);
        } else {
            console.log("initializeWithMnemonic :: first block :: " + self._currentBlock);
        }
    });

    this.setupWorkers();

//    if (this._coinType === COIN_ETHEREUM) {
//        //@note: pre-cache the account balances.
//        this.getKeypairsList();
//    }

    setInterval(function() {
        self._requestBlockNumber(function(err) {
            if (err) {
                console.log("pouch :: " + self._coinType + " :: updating request block number :: error :: " + err);
            } else {
                //@note:@here:@todo: in case of block number update, only update part of the interface.
//                self._notify();
            }
        });
    }, this._blockRequestTimeout);
}

HDWalletPouch.prototype.zeroPtEighteenCheckAndClearCache = function() {
    var zeroPtEighteenCheck = getStoredData("zeroPtEighteenCheck", false);
    if (this._coinType === COIN_ETHEREUM) {
        if (typeof(zeroPtEighteenCheck) === 'undefined' || zeroPtEighteenCheck === null || (zeroPtEighteenCheck !== null && zeroPtEighteenCheck !== "true")) {
            console.log("zeroPtEighteenCheck");

            var clearDataItems = ['wTxCache_' + this._coinFullName + "_" + this._storageKey,
                                  'wPubAddrCache_' + this._coinFullName + "_" + this._storageKey,
                                  'wCurRecA_' + this._coinFullName + "_" + this._storageKey,
                                  'wWrkrCacheAddrMap_' + this._coinFullName + "_" + this._storageKey,
                                  'ethereum_legacySweepRan',
                                 ];

            for (var i = 0; i < clearDataItems.length; i++) {
                var curDataItemName = clearDataItems[i];
                var curDataItem = getStoredData(curDataItemName, false);

                console.log("checking :: " + curDataItemName + " :: " + curDataItem);

                if (typeof(curDataItem) !== 'undefined' && curDataItem !== null) {
                    removeStoredData(curDataItemName);
                }
            }
            storeData("zeroPtEighteenCheck", "true", false);
        } else {
        }
    }
}

HDWalletPouch.prototype.update = function() {
    //@note: in bitcoin, this is the mining fee,
    //in ethereum this is the gas price. (not the gas limit).
    this._defaultTXFee = HDWalletHelper.getDefaultRegulatedTXFee(this._coinType);
}

HDWalletPouch.prototype._notify = function(reason) {
    for (var i = 0; i < this._listeners.length; i++) {
        this._listeners[i]();
    }
}

HDWalletPouch.prototype.addListener = function(callback) {
    this._listeners.push(callback);
}

HDWalletPouch.prototype.removeListener = function(callback) {
    for (var i = this._listeners.length - 1; i >= 0; i--) {
        if (this._listeners[i] === callback) {
            this._listeners.splice(i, 1);
        }
    }
}

HDWalletPouch.prototype.loadAndCache = function() {
    if (this._rootNode) {
        console.log("error :: trying to load HDWalletPouch again :: " + this._coinType);
        return;
    }

//    console.log("mnemonic :: " + this._mnemonic);


    var self = this;

    var seedHex = CacheUtils.getCachedOrRun("wSh_" + this._coinFullName + "_" + self._storageKey, function() {
        var seedHex = thirdparty.bip39.mnemonicToSeedHex(self._mnemonic);
        return seedHex;
    });

    this._seedHex = seedHex;

    var rootNodeBase58 = CacheUtils.getCachedOrRun("wRTn_" + this._coinFullName + "_" + self._storageKey, function() {
        var rootNodeBase58 = thirdparty.bitcoin.HDNode.fromSeedHex(self._seedHex, NETWORK).toBase58();
        return rootNodeBase58;
    });

    var rootNode = thirdparty.bitcoin.HDNode.fromBase58(rootNodeBase58, NETWORK);
    this._rootNode = rootNode;

    var accountNodeBase58 = CacheUtils.getCachedOrRun("wAn_" + this._coinFullName + "_" + self._storageKey, function() {
        var accountNodeBase58 = HDWalletPouch._derive(HDWalletPouch._derive(HDWalletPouch._derive(self._rootNode, 44, true), self._hdCoinType, true), 0, true).toBase58();
        return accountNodeBase58;
    });

    var accountNode = thirdparty.bitcoin.HDNode.fromBase58(accountNodeBase58, NETWORK);
    this._accountNode = accountNode;

    var receiveNodeBase58 = CacheUtils.getCachedOrRun("wRn_" + this._coinFullName + "_" + self._storageKey, function() {
        var receiveNodeBase58 = HDWalletPouch._derive(self._accountNode, 0, false).toBase58();
        return receiveNodeBase58;
    });

    var receiveNode = thirdparty.bitcoin.HDNode.fromBase58(receiveNodeBase58, NETWORK);
    this._receiveNode = receiveNode;

//    if (this._coinType === COIN_ETHEREUM) {
////        console.log("[ethereum] legacy private key generated :: " + this._receiveNode.keyPair.d.toBuffer(32).toString('hex'));
////        HDWalletPouch.getCoinAddress(this._coinType, this._receiveNode).toString());
//        console.log("[ethereum] legacy address generated :: " + HDWalletPouch.getLightwalletEthereumAddress(this._receiveNode.neutered()).toString());
//    }


    var changeNodeBase58 = CacheUtils.getCachedOrRun("wCn_" + this._coinFullName + "_" + self._storageKey, function() {
        var changeNodeBase58 = HDWalletPouch._derive(self._accountNode, 1, false).toBase58();
        return changeNodeBase58;
    });

    var changeNode = thirdparty.bitcoin.HDNode.fromBase58(changeNodeBase58, NETWORK);
    this._changeNode = changeNode;



    //@note: using the neutered() versions here to get parity with the ethereum side of things in relation
    //to the wallet worker code. I'm relatively sure that the

    var currentReceiveAddress = getStoredData('wCurRecA_' + this._coinFullName + "_" + this._storageKey, true);
    if (!currentReceiveAddress) {
        currentReceiveAddress = HDWalletPouch.getCoinAddress(this._coinType, HDWalletPouch._derive(this._receiveNode, 0, false)).toString();
    }

    this._currentReceiveAddress = currentReceiveAddress;

    console.log("pouch :: " + this._coinType + " :: primary receive address :: " + this._currentReceiveAddress);

    //@note: @todo: @next: @optimization: pretty sure that this could be cached as it is generated.

//    this._currentChangeAddress = HDWalletPouch._derive(this._changeNode, 0, false).getAddress().toString();
    this._currentChangeAddress = HDWalletPouch.getCoinAddress(this._coinType, HDWalletPouch._derive(this._changeNode, 0, false)).toString();

    var publicAddressCache = getStoredData('wPubAddrCache_' + this._coinFullName + "_" + this._storageKey, true);

    if (!publicAddressCache) {
        publicAddressCache = {};
    } else {
        publicAddressCache = JSON.parse(publicAddressCache);
    }

    this._publicAddressCache = publicAddressCache;


    var qrCodeBase64Cache = getStoredData('wQRCodeCache_' + this._coinFullName + "_" + this._storageKey, true);

    if (!qrCodeBase64Cache) {
        qrCodeBase64Cache = {};
    } else {
        qrCodeBase64Cache = JSON.parse(qrCodeBase64Cache);
    }

    this._qrCodeBase64Cache = qrCodeBase64Cache;
}

HDWalletPouch.prototype.setupWorkers = function() {
    // Background thread to run heavy HD algorithms and keep the state up to date
    try {
        this._worker = new Worker('./js/wallet/hdwallet_worker.js');
        //        this._worker = new Worker('./js/wallet/wallet-worker.js');

        var self = this;
        this._worker.onmessage = function(message) {
            var action = message.data.action;

            // Log to our logger
            if (action === 'log') {
                self.log.apply(self, message.data.content);

                // Set transaction, utxo, etc.
            } else if (action === 'update') {

                var numPrevTXKeys = Object.keys(self._transactions).length;
                var numUpdateTXKeys = Object.keys(message.data.content.transactions).length;

                var didModifyTX = false;

                if (numPrevTXKeys < numUpdateTXKeys) {
                    didModifyTX = true;
                }

                //                console.log("update :: " + self._coinFullName);

                if (message.data.content.transactions) {
                    var transactions = message.data.content.transactions;
                    for (var txid in transactions) {
                        var transaction = transactions[txid];

                        if (self._coinType === COIN_BITCOIN) {
                            var existingTransaction = self._transactions[txid];
                            if (typeof(existingTransaction) === 'undefined') {
                                existingTransaction = null;
                            }
                            //@note: @here: @next:
//                            if (typeof(existingTransaction) !== 'undefined' && existingTransaction !== null && existingTransaction.inputs && existingTransaction.outputs) {
//                                if (transaction.inputs.length !== existingTransaction.inputs.length) {
//                                    console.log("tx inputs different length");
//                                    didModifyTX = true;
//                                }
//
//                                if (transaction.outputs.length !== existingTransaction.outputs.length) {
//                                    console.log("tx outputs different length");
//                                    didModifyTX = true;
//                                }
//                            }

                            // We need to convert all the amounts from BTC to satoshis (cannot do this inside the worker easily)
                            for (var i = 0; i < transaction.inputs.length; i++) {
                                var input = transaction.inputs[i];
                                input.amount = HDWalletHelper.convertBitcoinsToSatoshis(input.amountBtc);

                                if (existingTransaction && (existingTransaction.inputs[i].addressIndex !== input.addressIndex || existingTransaction.inputs[i].addressInternal !== input.addressInternal)) {
//                                    console.log("[inputs] :: " + i + " :: [existingTransaction] :: addressIndex :: " + existingTransaction.inputs[i].addressIndex + " :: addressInternal :: " + existingTransaction.inputs[i].addressInternal + " :: [incomingTransaction] : addressIndex :: " + input.addressIndex + " :: addressInternal :: " + input.addressInternal);
                                    didModifyTX = true;
                                }
//                                console.log("input.amountBtc :: " + input.amountBtc + " :: input.amount :: " + input.amount)
                            }
                            for (var i = 0; i < transaction.outputs.length; i++) {
                                var output = transaction.outputs[i];
                                output.amount = HDWalletHelper.convertBitcoinsToSatoshis(output.amountBtc);

                                if (existingTransaction && (existingTransaction.outputs[i].addressIndex !== output.addressIndex || existingTransaction.outputs[i].addressInternal !== output.addressInternal)) {
//                                    console.log("[outputs] :: " + i + " :: [existingTransaction] :: addressIndex :: " + existingTransaction.outputs[i].addressIndex + " :: addressInternal :: " + existingTransaction.outputs[i].addressInternal + " :: [incomingTransaction] : addressIndex :: " + output.addressIndex + " :: addressInternal :: " + output.addressInternal);

                                    didModifyTX = true;
                                }

//                                console.log("output.amountBtc :: " + output.amountBtc + " :: output.amount :: " + output.amount)
                            }

                            self._transactions[txid] = transaction;
                            self._spendableBalance = null;
                        } else if (self._coinType === COIN_ETHEREUM) {
//                                                        console.log("wallet worker update :: eth tx :: " + Object.keys(transactions).length);
//                            console.log("incoming eth tx :: " + JSON.stringify(transaction) + " :: " + txid);
                            self._transactions[txid] = transaction;

                            self._spendableBalance = null;

                            self._largeQrCode = null;
                            self._smallQrCode = null;
                        }
                    }

                    if (self._txCacheValid === false ||                                     didModifyTX === true || self._coinType === COIN_BITCOIN) {
//                        if (self._coinType === COIN_BITCOIN) {
//                            console.log(self._coinFullName + " ::  updating transaction cache");
//                        }
                        self._txCacheValid = true;
                        storeData('wTxCache_' + self._coinFullName + "_" + self._storageKey, JSON.stringify(self._transactions), true);
                    } else {
//                        if (self._coinType === COIN_BITCOIN) {
//                            console.log(self._coinFullName + " ::  not updating transaction cache");
//                        }
                    }
                }

                if (message.data.content.currentReceiveAddress) {
                    //                    console.log("pouch :: " + self._coinFullName + " :: update receive address :: " + message.data.content.currentReceiveAddress);
                    self._currentReceiveAddress = message.data.content.currentReceiveAddress;

                    storeData('wCurRecA_' + self._coinFullName + "_" + self._storageKey, self._currentReceiveAddress, true);
                }

                if (message.data.content.currentChangeIndex && message.data.content.currentChangeAddress) {
                    self._currentChangeIndex = message.data.content.currentChangeIndex;
                    self._currentChangeAddress = message.data.content.currentChangeAddress;
                }

                if (message.data.content.smallQrCode) {
                    self._smallQrCode = message.data.content.smallQrCode;
                }

                if (message.data.content.largeQrCode) {
                    self._largeQrCode = message.data.content.largeQrCode;
                }

                if (message.data.content.workerCacheAddressMap) {
                    var workerCacheAddressMap = message.data.content.workerCacheAddressMap;

                    var numPrevWorkerCacheKeys = Object.keys(self._w_addressMap).length;
                    var numUpdatedWorkerCacheKeys = Object.keys(workerCacheAddressMap).length;

                    var cacheBalancesUpdated = false;

                    for (var address in workerCacheAddressMap) {
                        var accountInfo = workerCacheAddressMap[address];
                        var existingAccountInfo = self._w_addressMap[address];

                        if (typeof(existingAccountInfo) !== 'undefined' && existingAccountInfo !== null && existingAccountInfo.accountBalance !== accountInfo.accountBalance && (typeof(existingAccountInfo.newSendTx) === 'undefined' || existingAccountInfo.newSendTx === null)) {
                            cacheBalancesUpdated = true;
                        }
                    }

                    if (self._wkrCacheValid === false || numPrevWorkerCacheKeys < numUpdatedWorkerCacheKeys || cacheBalancesUpdated === true) {
                        self._wkrCacheValid = true;
                        storeData('wWrkrCacheAddrMap_' + self._coinFullName + "_" + self._storageKey, JSON.stringify(workerCacheAddressMap), true);
                    } else {
//                        console.log(self._coinFullName + " ::  not updating worker cache");
                    }

                    self._w_addressMap = workerCacheAddressMap;

                    if (self._coinFullName === "Bitcoin") {
                    } else if (self._coinFullName === "Ethereum") {
                        self.sortHighestAccounts();
                    }

//                    self._notify();
                }

                self._notify();
            };
        }
    } catch (err) {
        console.error(err);
    }

    if (this._worker) {
        var shouldPostWorkerCache = false;

        var workerCacheAddressMap = getStoredData('wWrkrCacheAddrMap_' + this._coinFullName + "_" + this._storageKey, true);

        if (workerCacheAddressMap) {
            try {
                workerCacheAddressMap = JSON.parse(workerCacheAddressMap);

                for (var idx in workerCacheAddressMap) {
                    workerCacheAddressMap[idx].newSendTX = null;
                }

                this._w_addressMap = workerCacheAddressMap;

                shouldPostWorkerCache = true;
            } catch (e) {
                this.log('Invalid cache:', workerCache);
            }
        }

//        if (this._coinFullName === "Ethereum") {
//        console.log("_w_addressMap :: " + this._coinFullName + "\n" + JSON.stringify(this._w_addressMap));
//        }

        this._worker.postMessage({
            action: 'initialize',
            coinType: this._coinType,
            testNet: this._TESTNET
        });

        if (shouldPostWorkerCache === true) {
            this._worker.postMessage({
                action: 'restoreAddressMapCache',
                content: {
                    workerCacheAddressMap: workerCacheAddressMap
                }
            });
        }

        this._worker.postMessage({
            action: 'triggerExtendedUpdate',
            content: {
                type: 'balances'
            }
        });

        this._worker.postMessage({
            action: 'setExtendedPublicKeys',
            content: {
                change: self._changeNode.neutered().toBase58(),
                receive: self._receiveNode.neutered().toBase58()
            }
        });
    }
}

HDWalletPouch.prototype.invalidateTransactionCache = function() {
    this._txCacheValid = false;
}

HDWalletPouch.prototype.invalidateWorkerCache = function() {
    this._wkrCacheValid = false;
}


HDWalletPouch.prototype.shutDown = function() {
    if (this._worker) {
        this._worker.postMessage({
            action: 'shutDown',
        });
    }
}

HDWalletPouch.prototype.getRootNodeAddress = function() {
    return HDWalletPouch.getCoinAddress(this._coinType, this._rootNode);
}

HDWalletPouch.prototype.getDefaultTransactionFee = function() {
    return this._defaultTXFee;
}

HDWalletPouch.prototype.getTransactions = function() {
    var res = [];

    if (this._coinType === COIN_BITCOIN) {
        /**
 *  Get all transactions for this wallet, sorted by date, earliest to latest.
 */
        for (var key in this._transactions) {
            res.push(this._transactions[key]);
        }

        res.sort(function (a, b) {
            var deltaConf = (a.confirmations - b.confirmations);
            if (deltaConf) { return deltaConf; }
            return (b.timestamp - a.timestamp);
        });
    } else if (this._coinType === COIN_ETHEREUM) {
//        console.log("this._transactions length :: " + Object.keys(this._transactions).length);
        for (var txid in this._transactions) {
            res.push(this._transactions[txid]);
        }

        res.sort(function (a, b) {
            var deltaTimeStamp = (b.timestamp - a.timestamp);
            if (deltaTimeStamp) { return deltaTimeStamp; }
            return (a.confirmations - b.confirmations);
        });
    }

    return res;
};

HDWalletPouch.prototype.getHistory = function() {
    var transactions = this.getTransactions();

    var history = [];
    for (var ti = 0; ti < transactions.length; ti++) {
        var transaction = transactions[ti];

        if (this._coinType === COIN_BITCOIN) {
            var deltaBalance = 0;
            var miningFee = 0;

            for (var i = 0; i < transaction.inputs.length; i++) {
                var input = transaction.inputs[i];

                miningFee += input.amount;

                // Our address, money sent (input values are always negative)
                if (input.addressIndex !== null) {
                    deltaBalance += input.amount;
                }
            }

            var myInputAddress = [];
            var otherOutputAddress = [];
            for (var i = 0; i < transaction.outputs.length; i++) {
                var output = transaction.outputs[i];

                miningFee += output.amount;

                // Our address, money received
                if (output.addressIndex !== null) {
                    deltaBalance += output.amount;
                    myInputAddress.push(input.address);
                } else {
                    otherOutputAddress.push(output.address);
                }
            }

            var toAddress = null;
            if (deltaBalance > 0 && myInputAddress.length === 1) {
                toAddress = myInputAddress[0];
            } else if (deltaBalance < 0 && otherOutputAddress.length === 1) {
                toAddress = otherOutputAddress[0];
            }

            history.push({
                toAddress: toAddress,
                blockHeight: transaction.block,
                confirmations: transaction.confirmations,
                deltaBalance: deltaBalance,
                miningFee: miningFee,
                timestamp: transaction.timestamp,
                txid: transaction.txid
            });
        } else if (this._coinType === COIN_ETHEREUM) {
//            console.log("A :: ethereum transaction :: " + JSON.stringify(transaction));
            if (typeof(transaction.addressIndex) !== 'undefined' && transaction.addressIndex !== null) {
//                console.log("B :: ethereum transaction :: " + JSON.stringify(transaction));

                var toAddress = "";

                var valueDelta = thirdparty.web3.fromWei(transaction.valueDelta);

                if (this.isAddressFromSelf(transaction.to)) {
                    toAddress = "Self";
                } else {
                    toAddress = transaction.to.substring(0, 7) + '...' + transaction.to.substring(transaction.to.length - 5);
                    if (transaction.from === 'GENESIS') {
                        toAddress = transaction.from;
                    }

                }

                var gasCost = thirdparty.web3.fromWei(transaction.gasUsed * transaction.gasPrice);

                history.push({
                    toAddress: toAddress,
                    blockNumber: transaction.blockNumber,
                    confirmations: transaction.confirmations,
                    deltaBalance: valueDelta,
                    gasCost: gasCost,
                    timestamp: transaction.timestamp,
                    txid: transaction.txid
                });
            } else {
                console.log("error :: undetermined transaction :: " + JSON.stringify(transaction));
            }
        }
    }

    return history;
}

HDWalletPouch.prototype._getUnspentOutputs = function() {
    var unspent = {};

    // Sigh... We don't get the transaction index (within a block), so we can't strictly order them

    var transactions = this.getTransactions();

    if (this._coinType === COIN_BITCOIN) {
        // Add the each UTXO
        for (var ti = transactions.length - 1; ti >= 0; ti--) {
            var transaction = transactions[ti];
            for (var i = 0; i < transaction.outputs.length; i++) {
                var output = transaction.outputs[i];
                if (output.addressIndex !== null) {
                    var utxoKey = output.txid + ':' + output.index;
                    unspent[utxoKey] = output;
                }
            }
        }

        // Remove each spent UTXO
        for (var ti = transactions.length - 1; ti >= 0; ti--) {
            var transaction = transactions[ti];
            for (var i = 0; i < transaction.inputs.length; i++) {
                var input = transaction.inputs[i];
                if (input.addressIndex !== null) {
                    var utxoKey = input.previousTxid + ':' + input.previousIndex;
                    if (unspent[utxoKey]) {
                        delete unspent[utxoKey];
                    }
                }
            }
        }
    } else if (this._coinType === COIN_ETHEREUM) {
//        console.log("eth unspent check");
        // Add the each UTXO
        for (var ti = transactions.length - 1; ti >= 0; ti--) {
            var transaction = transactions[ti];
//            console.log("tx :: " + JSON.stringify(transaction));

            //@note: for ether, we're using a similar
            if (typeof(transaction.addressIndex) !== 'undefined' && transaction.addressIndex !== null) {
                if (!unspent[transaction.addressIndex]) {
                    unspent[transaction.addressIndex] = {index: transaction.addressIndex, to: transaction.to, from: transaction.from, amount: 0};
                }

//                console.log("tx value :: " + transaction.valueDelta);

                unspent[transaction.addressIndex].amount += parseInt(transaction.valueDelta);
//                console.log("cur amount :: " + unspent[transaction.addressIndex].amount);
            }
        }

        for (tx in unspent) {
            if (unspent[tx].amount < 0) {
                console.log("error :: ethereum balance for account :: " + JSON.stringify(tx) + " :: " + unspent[tx].amount);

                delete unspent[tx];
            } else if (this._helper.compareToDustLimit(unspent[tx].amount, COIN_UNITLARGE, false) === -1) { //@note: check if this is lower than the dust limit.
                console.log("error :: ethereum balance for account :: " + JSON.stringify(tx) + " :: is below the dust limit of 21000 * 50 gwei" + unspent[tx].amount);

                delete unspent[tx];
            }
        }
    }

    // Convert to an array of outputs
    var result = [];
    for (var utxoKey in unspent) {
        result.push(unspent[utxoKey]);
    }

    return result;
}

HDWalletPouch.prototype.getBalance = function() {
    if (this._coinType === COIN_BITCOIN) {
        var unspent = this._getUnspentOutputs();

        var balance = 0;

        for (var i = 0; i < unspent.length; i++) {
            balance += unspent[i].amount;
        }

        return balance;
    } else if (this._coinType === COIN_ETHEREUM) {
        var balance = 0;

        var highestIndexToCheck = this.getHighestReceiveIndex();

        if (highestIndexToCheck !== -1) {
            for (var i = 0; i < highestIndexToCheck + 1; i++) {
                var curBalance = this.getEthereumAccountBalance(false, i);
                balance += curBalance;
            }
        }

        return balance;
    }
}

//@note: this function when passed in an explicit null to ignoreCached, will use cache.
//@note: cached only in session.
HDWalletPouch.prototype.getPrivateKey = function(internal, index, ignoreCached) {
    if (internal === false) {
        internal = 0;
    } else if (internal === true) {
        internal = 1;
    }

    if (index < 0 || internal < 0) {
        throw new Error('Invalid private key');
    }

    var key = index + '-' + internal;
    //@note: @here: @security: wondering if it might be better not to cache this..
    var privateKey = this._privateKeyCache[key];

    if (typeof(privateKey) === 'undefined' || privateKey === null || typeof(ignoreCached) !== 'undefined') {
        //@note: use a 'truthy' comparison.
        if (internal == true) {
            privateKey = HDWalletPouch._derive(this._changeNode, index, false).keyPair;
        } else {
            privateKey = HDWalletPouch._derive(this._receiveNode, index, false).keyPair;
        }

        if (typeof(ignoreCached) === 'undefined') {
            this._privateKeyCache[key] = privateKey;
        } else {
            console.log("uncached fetch of private key");
        }
    }


    return privateKey;
}

//@note: this function returns a checksum address for ethereum. a ".toLowerCase()" on the returned
//variable will be the non-checksummed version.
//@note: this function when passed in an explicit null to ignoreCached, will use cache.
//@note: cached across sessions.
HDWalletPouch.prototype.getPublicAddress = function(internal, index, ignoreCached) {
    if (internal === false) {
        internal = 0;
    } else if (internal === true) {
        internal = 1;
    }

    var key = index + '-' + internal;
    var publicAddress = this._publicAddressCache[key];

    if (typeof(publicAddress) === 'undefined' || publicAddress === null || typeof(ignoreCached) !== 'undefined') {
        //@note: use a 'truthy' comparison.
        if (internal == true) {
            publicAddress = HDWalletPouch.getCoinAddress(this._coinType, HDWalletPouch._derive(this._changeNode, index, false));
        } else {
            publicAddress = HDWalletPouch.getCoinAddress(this._coinType, HDWalletPouch._derive(this._receiveNode, index, false));
        }

        if (this._coinType === COIN_BITCOIN) {

        } else if (this._coinType === COIN_ETHEREUM) {
            publicAddress = HDWalletHelper.toEthereumChecksumAddress(publicAddress);
//            console.log("caching public address :: " + publicAddress)
        }

        if (typeof(ignoreCached) === 'undefined') {
            this._publicAddressCache[key] = publicAddress;

            storeData('wPubAddrCache_' + this._coinFullName + "_" + this._storageKey, JSON.stringify(this._publicAddressCache), true);
        } else {
            console.log("uncached fetch of public address");
        }
    } else {
        if (this._coinType === COIN_ETHEREUM) {
            publicAddress = HDWalletHelper.toEthereumChecksumAddress(publicAddress);
//            console.log("cached fetch of public address :: " + publicAddress)
        }
    }

    return publicAddress;
}

HDWalletPouch.prototype.getCurrentReceiveAddress = function() {
    var address = this._currentReceiveAddress;

    if (this._coinType === COIN_BITCOIN) {

    } else if (this._coinType === COIN_ETHEREUM) {
        address = HDWalletHelper.toEthereumChecksumAddress(address);
    }

    return address;
}

HDWalletPouch.prototype.getCurrentChangeAddress = function() {
    return this._currentChangeAddress;
}

HDWalletPouch.prototype.getCurrentChangeIndex = function() {
    return this._currentChangeIndex;
}

HDWalletPouch.prototype.clearSpendableBalanceCache = function() {
    this._spendableBalance = null;
}

HDWalletPouch.prototype.getSpendableBalance = function() {
    if (this._spendableBalance !== null) {
        return this._spendableBalance;
    }

    var spendableBalance = 0;

    if (this._coinType === COIN_BITCOIN) {
        spendableBalance = this.getBalance();
        var address = this.getCurrentReceiveAddress();

        while (spendableBalance > 0) {
            //@note: @todo: maybe migrate this (carefully!) to the ethereum side's mechanism.
            var transaction = this.buildBitcoinTransaction(address, spendableBalance, true);
            if (transaction) { break; }

            spendableBalance -= this._defaultTXFee;
        }
    } else if (this._coinType === COIN_ETHEREUM) {
//        console.log("types :: " + typeof(this._helper.getCustomEthereumGasLimit()) + " :: " + typeof(HDWalletHelper.getDefaultEthereumGasPrice()));
//        console.log("spendable :: custom gas limit :: " + this._helper.getCustomEthereumGasLimit() + " :: default gas price :: " + HDWalletHelper.getDefaultEthereumGasPrice());

        var baseTXCost = this._helper.getCustomEthereumGasLimit().mul(HDWalletHelper.getDefaultEthereumGasPrice()).toNumber();

        var totalTXCost = 0;

        var numPotentialTX = 0;

        //@note: returns {index: x, balance: y} format.
        var highestAccountDict = this.getHighestAccountBalanceAndIndex();
        if (highestAccountDict !== null) {
            for (var i = 0; i < this._sortedHighestAccountArray.length; i++) {
                var accountBalance = this._sortedHighestAccountArray[i].balance;

                //@note: check for account balance lower than the dust limit
                if (accountBalance <= baseTXCost) {

                } else {
                    spendableBalance += accountBalance - baseTXCost;
                    numPotentialTX++;
                    totalTXCost += baseTXCost;
                }
            }
        }

//        console.log("ethereum spendable :: " + spendableBalance + " :: totalTXCost :: " + totalTXCost + " :: " + numPotentialTX);
    }

    if (spendableBalance < 0) {
        spendableBalance = 0;
    }

    this._spendableBalance = spendableBalance;

    return this._spendableBalance;
}

HDWalletPouch.prototype.getEthereumAccountBalance = function(internal, index) {
    if (internal === false) {
        internal = 0;
    } else if (internal === true) {
        internal = 1;
    }

    var publicAddress = this.getPublicAddress(internal, index);

    //@note: for ethereum checksum addresses.
    publicAddress = publicAddress.toLowerCase();

    var addressInfo = this._w_addressMap[publicAddress];

    var accountBalance = 0;

//    console.log("internal :: " + internal + " :: index :: " + index + " :: publicAddress :: " + publicAddress + " :: info :: " + JSON.stringify(addressInfo) + " :: _w_addressMap :: " + JSON.stringify(this._w_addressMap));

    if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
        accountBalance = addressInfo.accountBalance;
    }

    return accountBalance;
}

HDWalletPouch.prototype.getEthereumNonce = function(internal, index) {
    if (internal === false) {
        internal = 0;
    } else if (internal === true) {
        internal = 1;
    }

    var publicAddress = this.getPublicAddress(internal, index);

    //@note: for ethereum checksum addresses.
    publicAddress = publicAddress.toLowerCase();

    var addressInfo = this._w_addressMap[publicAddress];

    var nonce = 0;

    if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
        nonce = addressInfo.nonce;

        //        console.log("publicAddress :: " + publicAddress + " :: info :: " + JSON.stringify(addressInfo));
    }

    return nonce;
}

//@note: this function when passed in an explicit null to ignoreCached, will use cache. cached only in session.
HDWalletPouch.prototype.isAddressFromSelf = function(addressToCheck, ignoreCached) {
    var isSelfAddress = false;

    //@note: for ethereum checksum addresses.
    if (this._coinType === COIN_ETHEREUM) {
        addressToCheck = addressToCheck.toLowerCase();
    }

    var key = addressToCheck;
    var isSelfAddress = this._checkAddressCache[key];

    if (typeof(isSelfAddress) === 'undefined' || isSelfAddress === null || typeof(ignoreCached) !== 'undefined') {
        var highestIndexToCheck = this.getHighestReceiveIndex();

        if (highestIndexToCheck !== -1) {
            for (var i = 0; i < highestIndexToCheck + 1; i++) {
                var curAddress = this.getPublicAddress(false, i);

                //@note: for ethereum checksum addresses.
                if (this._coinType === COIN_ETHEREUM) {
                    curAddress = curAddress.toLowerCase();
                }

                //            console.log("addressToCheck :: " + addressToCheck + " :: curAddress :: " + curAddress);
                if (curAddress === addressToCheck) {
//                    console.log("addressToCheck :: " + addressToCheck + " :: curAddress :: " + curAddress);
                    isSelfAddress = true;
                    break;
                }
            }
        }

//        console.log("addressToCheck :: " + addressToCheck + " :: curAddress :: " + curAddress + " :: " + isSelfAddress);

        if (typeof(ignoreCached) === 'undefined') {
//            console.log("caching isAddressFromSelf :: " + addressToCheck + " :: " + key + " :: " + isSelfAddress);
            this._checkAddressCache[addressToCheck] = isSelfAddress;
//            console.log("caching isAddressFromSelf :: " +  this._checkAddressCache[addressToCheck]);
        } else {
            console.log("uncached");
        }
    } else {
//        console.log("fetching cached isAddressFromSelf :: " + addressToCheck + " :: key :: " + key + " :: " + isSelfAddress);
    }

    return isSelfAddress;
}

HDWalletPouch.prototype.getHighestReceiveIndex = function() {
    var highestIndexToCheck = -1;

    for (var txid in this._transactions) {
        var tx = this._transactions[txid];
        if (!tx.addressInternal && tx.addressIndex > highestIndexToCheck) {
            highestIndexToCheck = tx.addressIndex;
        }
    }

    return highestIndexToCheck;
}

HDWalletPouch.prototype.sortHighestAccounts = function() {
    this._sortedHighestAccountArray = [];

    var highestIndexToCheck = this.getHighestReceiveIndex();

    if (highestIndexToCheck !== -1) {
        for (var i = 0; i < highestIndexToCheck + 1; i++) {
            var curBalance = this.getEthereumAccountBalance(false, i);
            this._sortedHighestAccountArray.push({index: i, balance: curBalance});
        }

        this._sortedHighestAccountArray.sort(function(a, b) {
            if (a.balance > b.balance) {
                return 1;
            } else if (a.balance < b.balance) {
                return -1;
            } else {
                return 0;
            }
        });

        this._sortedHighestAccountArray.reverse();
    }
}

HDWalletPouch.prototype.getHighestAccountBalanceAndIndex = function() {
    this.sortHighestAccounts();

    return (this._sortedHighestAccountArray.length > 0) ?this._sortedHighestAccountArray[0] : null;
}

HDWalletPouch.prototype.getInternalIndexForPublicAddress = function(publicAddress) {
    var foundIdx = -1;
    var highestIndexToCheck = this.getHighestReceiveIndex();

    highestIndexToCheck++;

    //@note: for ethereum checksum addresses.
    if (this._coinType === COIN_ETHEREUM) {
        publicAddress = publicAddress.toLowerCase();
    }

    for (var i = 0; i < highestIndexToCheck; i++) {
        var addressToCheck = this.getPublicAddress(false, i);
        //@note: for ethereum checksum addresses.
        if (this._coinType === COIN_ETHEREUM) {
            addressToCheck = addressToCheck.toLowerCase();
        }

        if (publicAddress === addressToCheck) {
            foundIdx = i;
            break;
        }
    }

    return foundIdx;
}

//@note: cached across sessions.
HDWalletPouch.prototype.generateQRCode = function(largeFormat, coinAmountSmallType) {
    var curRecAddr = this.getCurrentReceiveAddress();

    var genQRCode = "";

    if ((typeof(largeFormat) === 'undefined' || largeFormat === null) && (typeof(coinAmountSmallType) === 'undefined' || coinAmountSmallType === null)) {
//        console.log("generating basic qr");

        var key = curRecAddr;
        genQRCode = this._qrCodeBase64Cache[key];

        if (typeof(genQRCode) === 'undefined' || genQRCode === null) {
            genQRCode = this._generateQRCode(largeFormat, coinAmountSmallType);

            this._qrCodeBase64Cache[key] = genQRCode;
//            console.log("generating qr :: " + genQRCode);

            storeData('wQRCodeCache_' + this._coinFullName + "_" + this._storageKey, JSON.stringify(this._qrCodeBase64Cache), true);
        }
    } else {
        genQRCode = this._generateQRCode(largeFormat, coinAmountSmallType);
    }

    return genQRCode;
}

HDWalletPouch.prototype._generateQRCode = function(largeFormat,  coinAmountSmallType) {
    var curRecAddr = this.getCurrentReceiveAddress();

    var uri = "";

    if (this._coinType === COIN_BITCOIN) {
        uri = "bitcoin:" + curRecAddr;
    } else if (this._coinType === COIN_ETHEREUM) {
        uri = "iban:" + HDWalletHelper.getICAPAddress(curRecAddr);
    }

    if (coinAmountSmallType) {
        uri += "?amount=" + coinAmountSmallType;
    }

    if (largeFormat) {
        if (coinAmountSmallType || !this._largeQrCode) {
            //            this.log('Blocked to generate QR big Code');
            this._largeQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync(uri, {type: "png", ec_level: "H", size: 7, margin: 1}).toString('base64');
        }

        return this._largeQrCode;
    } else {
        if (coinAmountSmallType || !this._smallQrCode) {
            //        this.log('Blocked to generate QR small Code');
            this._smallQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync(uri, {type: "png", ec_level: "H", size: 5, margin: 1}).toString('base64');
        }

        return this._smallQrCode;
    }
}

HDWalletPouch.prototype._buildBitcoinTransaction = function(toAddress, amount_smallUnit, transactionFee, doNotSign) {
    //    this._load();

    // Get all UTXOs, biggest to smallest)
    var unspent = this._getUnspentOutputs();
    unspent.sort(function (a, b) {
        return (a.amount - b.amount);
    });

    // @TODO: Build a better change picking algorithm; for now we select the largest first

    // Find a set of UTXOs that can afford the output amount
    var toSpend = [];
    var toSpendTotal = 0;
    while (toSpendTotal < amount_smallUnit + transactionFee) {
        if (unspent.length === 0) {
            return null;
        }
        var utxo = unspent.pop();
        toSpend.push(utxo);
        toSpendTotal += utxo.amount;

        // Keys for bip69 to sort on
        utxo.vout = utxo.index;
        utxo.txId = utxo.txid;
    }

    // Create the transaction
    var tx = new thirdparty.bitcoin.TransactionBuilder(NETWORK);

    // This mimicks the data structure we keep our transactions in so we can
    // simulate instantly fulfilling the transaction
    var mockTx = {
        block: -1,
        confirmations: 0,
        inputs: [],
        outputs: [],
        timestamp: (new Date()).getTime(),
    }

    var addressToScript = function(address) {
        return thirdparty.bitcoin.address.toOutputScript(toAddress, NETWORK);
    }


    // Send the target their funds
    var outputs = [
        {
            address: toAddress,
            amount: amount_smallUnit,
            addressIndex: null,
            addressInternal: null,

            // Keys for bip69 to sort on
            value: amount_smallUnit,
            script: addressToScript(toAddress),
        }
    ];

    // Send the change back to us
    var change = toSpendTotal - amount_smallUnit - transactionFee;
    if (change) {
        var changeAddress = this._currentChangeAddress;
        outputs.push({
            address: this._currentChangeAddress,
            addressIndex: this._currentChangeIndex,
            addressInternal: 1,
            amount: change,

            // Keys for bip69 to sort on
            value: change,
            script: addressToScript(this._currentChangeAddress),
        });
    }

    // Sort the inputs and outputs according to bip 69
    toSpend = thirdparty.bip69.sortInputs(toSpend);
    outputs = thirdparty.bip69.sortOutputs(outputs);

    // Add the outputs
    for (var i = 0; i < outputs.length; i++) {
        var output = outputs[i];
        tx.addOutput(output.address, output.amount);
        mockTx.outputs.push({
            address: output.address,
            addressIndex: output.addressIndex,
            addressInternal: output.addressInternal,
            amount: output.amount,
            confirmations: 0,
            index: i,
            spent: false,
            standard: true,
            timestamp: mockTx.timestamp,
        });
    }

    // Add the input UTXOs
    for (var i = 0; i < toSpend.length; i++) {
        var utxo = toSpend[i];
        tx.addInput(utxo.txid, utxo.index);

        mockTx.inputs.push({
            address: utxo.address,
            addressIndex: utxo.addressIndex,
            addressInternal: utxo.addressInternal,
            amount: -utxo.amount,
            previousIndex: utxo.index,
            previousTxid: utxo.txid,
            standard: true,
        });
    }

    if (typeof(doNotSign) !== 'undefined' && doNotSign !== null && doNotSign === true) {
//        console.log("building incomplete :: " + JSON.stringify(tx));
        return tx.buildIncomplete();
    }

    // Sign the transaction
    for (var i = 0; i < toSpend.length; i++) {
        var utxo = toSpend[i];
//        console.log("signing with :: " + this.getPrivateKey(utxo.addressInternal, utxo.addressIndex).toWIF() + " :: " + utxo.addressInternal);
        tx.sign(i, this.getPrivateKey(utxo.addressInternal, utxo.addressIndex));
    }

    var transaction = tx.build();

    // We get the txid in big endian... *sigh*
    var txidBig = transaction.getHash().toString('hex');
    var txid = '';
    for (var i = txidBig.length - 2; i >= 0; i-= 2) {
        txid += txidBig.substring(i, i + 2)
    }

    // Fill in the txid for the mock transaction and its outputs
    mockTx.txid = txid;
    for (var i = 0; i < mockTx.outputs.length; i++) {
        var output = mockTx.outputs[i];
        output.txid = txid;
    }

    transaction._kkToSpend = toSpend;
    transaction._kkMockTx = mockTx;

//    console.log("building complete :: " + JSON.stringify(transaction));

    return transaction;
}

HDWalletPouch.prototype.buildBitcoinTransaction = function(toAddress, amount_smallUnit, doNotSign) {
    var tx = null;
    var transactionFee = this._defaultTXFee;

    while (true) {
        tx = this._buildBitcoinTransaction(toAddress, amount_smallUnit, transactionFee, true);

        // Insufficient funds
        if (tx == null) {
            return null;
        }

        // How big is the transaction and what fee do we need? (we didn't sign so fill in 107 bytes for signatures)
        var size = tx.toHex().length / 2 + tx.ins.length * 107;
        var targetTransactionFee = Math.ceil(size / 1024) * this._defaultTXFee;

        //            console.log("targetTransactionFee :: " + targetTransactionFee)
        //            break;//
        // We have enough tx fee (sign it)
        if (targetTransactionFee <= transactionFee) {
            if (typeof(doNotSign) === 'undefined' || doNotSign === null || doNotSign === false) {
                tx = this._buildBitcoinTransaction(toAddress, amount_smallUnit, transactionFee);
            }
            break;
        }

        // Add at least enough tx fee to cover our size thus far (adding tx may increase fee)
        while (targetTransactionFee > transactionFee) {
            transactionFee += this._defaultTXFee;
        }
    }

    tx._kkTransactionFee = transactionFee;
    tx.getTransactionFee = function() { return this._kkTransactionFee; }

    return tx;
}


HDWalletPouch.prototype._buildEthereumTransaction = function(fromNodeInternal, fromNodeIndex, toAddress, amount_smallUnit, ethGasPrice, ethGasLimit, ethData, doNotSign) {
    var gasPrice = HDWalletHelper.hexify(ethGasPrice);
    var gasLimit = HDWalletHelper.hexify(ethGasLimit);

    var nonce = this.getEthereumNonce(fromNodeInternal, fromNodeIndex);

    console.log("ethereum :: build tx nonce :: " + nonce + " :: gasPrice :: " + ethGasPrice + " :: gasLimit :: " + ethGasLimit);

    var rawTx = {
        nonce: HDWalletHelper.hexify(nonce),
        gasPrice: gasPrice,
        gasLimit: gasLimit,
        to: toAddress,
        value: HDWalletHelper.hexify(amount_smallUnit),
        //data: '',
    };

    if (ethData && typeof(ethData) !== 'undefined') {
        rawTx.data = ethData;
    }

    var transaction = new thirdparty.ethereum.tx(rawTx);
    //    console.log("ethereum buildTransaction :: " + JSON.stringify(transaction));

    //    var privateKeyB = new Buffer('e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109', 'hex')
    //
    //    console.log("private key :: " + this._private + " :: " +  + this._private.length + " :: privateKeyB :: " + privateKeyB + " :: " + privateKeyB.length);

    if (typeof(doNotSign) !== 'undefined' || (doNotSign !== null && doNotSign !== false)) {
        var pvtKeyBuffer = new Buffer(this.getPrivateKey(fromNodeInternal, fromNodeIndex).d.toBuffer(32), 'hex');
//        console.log(pvtKeyBuffer.length);
//        console.log(this.getPrivateKey(fromNodeInternal, fromNodeIndex));
        transaction.sign(pvtKeyBuffer);
    }


    var txhash = ('0x' + transaction.hash().toString('hex'));

    var publicAddress = this.getPublicAddress(fromNodeInternal, fromNodeIndex);

    //@note: ethereum checksum addresses.
    publicAddress = publicAddress.toLowerCase();

    transaction._mockTx = {
        txid: txhash,
        addressInternal: fromNodeInternal,
        addressIndex: fromNodeIndex,
        blockNumber: null,
        //@note:@here:@todo:
        confirmations: 0,
        from: publicAddress,
        hash: txhash,
        timestamp: (new Date()).getTime() / 1000,
        to: toAddress,
        gasPrice: ethGasPrice,
        gasUsed: ethGasLimit,
        nonce: nonce,
        valueDelta: -amount_smallUnit,
    };

    return transaction;
}

HDWalletPouch.prototype.buildEthereumTransactionList = function(toAddress, amount_smallUnit, gasPrice, gasLimit, ethData, doNotSign) {
    var amountWei = parseInt(amount_smallUnit);

    var txArray = [];

    //@note: @here: @todo: add custom contract support when merging into the develop branch.
    var baseTXCost = gasPrice * gasLimit;

    var totalTXCost = 0;

    //@note: returns {index: x, balance: y} format.
    var highestAccountDict = this.getHighestAccountBalanceAndIndex();

    if (highestAccountDict !== null) {
        //@note: check to see whether this will result in the tx being able to be pushed through with this one account, or whether there will need to be more than one account involved in this transaction.
        if (amountWei + baseTXCost <= highestAccountDict.balance) {
            totalTXCost = baseTXCost;

            console.log("ethereum transaction :: account :: " + highestAccountDict.index + " :: " + highestAccountDict.balance + " :: can cover the entire balance + tx cost :: " + (amountWei + baseTXCost));
            var newTX = this._buildEthereumTransaction(false, highestAccountDict.index, toAddress, amountWei, gasPrice, gasLimit, ethData, doNotSign);

            if (!newTX) {
                console.log("error :: ethereum transaction :: account failed to build :: " + highestAccountDict.index);
                return null;
            } else {
                txArray.push(newTX);
            }
        } else {
            var txSuccess = true;

            var balanceRemaining = amountWei;

            //@note: this array is implicitly regenerated and sorted when the getHighestAccountBalanceAndIndex function is called.
            for (var i = 0; i < this._sortedHighestAccountArray.length; i++) {
                console.log("ethereum transaction :: balanceRemaining (pre) :: " + balanceRemaining);
//                console.log(typeof(this._sortedHighestAccountArray[i].balance));
                var accountBalance = this._sortedHighestAccountArray[i].balance;

                //@note: if the account cannot support the base tx cost + 1 wei (which might be significantly higher in the case of a contract address target), this process cannot continue as list is already sorted, and this transaction cannot be completed.
                if (accountBalance <= baseTXCost) {
                    console.log("ethereum transaction :: account :: " + this._sortedHighestAccountArray[i].index + " cannot cover current dust limit of :: " + baseTXCost);
                    txSuccess = false;
                    break;
                } else {
                    var amountToSendFromAccount = 0;

                    //debug amounts: 0.0609500024691356
                    //0.0518500024691356
                    //0.052 total

                    //@note: check if subtracting the balance of this account from the remaining target transaction balance will result in exactly zero or a positive balance for this account.
                    if (accountBalance - balanceRemaining - baseTXCost < 0) {
                        //@note: this account doesn't have enough of a balance to cover by itself.. keep combining.
                        console.log("ethereum transaction :: account :: " + this._sortedHighestAccountArray[i].index + " :: does not have enough to cover balance + tx cost :: " + (balanceRemaining + baseTXCost) + " :: accountBalance - tx cost :: " + (accountBalance - baseTXCost));

                        amountToSendFromAccount = (accountBalance - baseTXCost);
                    } else {
                        var accountChange = accountBalance - balanceRemaining - baseTXCost;
                        //                        console.log("types :: " + typeof(balanceRemaining) + " :: " + typeof(baseTXCost));
                        amountToSendFromAccount = balanceRemaining;
                        console.log("ethereum transaction :: account :: " + this._sortedHighestAccountArray[i].index + " :: accountBalance :: " + accountBalance + " :: account balance after (balance + tx cost) :: " + accountChange);

                        //@note: don't do things like bitcoin's change address system for now.
                    }

                    console.log("ethereum transaction :: account :: " + this._sortedHighestAccountArray[i].index + " :: will send  :: " + amountToSendFromAccount);


                    //@note: build this particular transaction, make sure it's constructed correctly.
                    var newTX = this._buildEthereumTransaction(false, this._sortedHighestAccountArray[i].index, toAddress, amountToSendFromAccount, gasPrice, gasLimit, ethData, doNotSign);

                    if (!newTX) {
                        console.log("error :: ethereum transaction :: account :: " + this._sortedHighestAccountArray[i].index + " cannot build");

                        txSuccess = false;
                        break;
                    } else {
                        txArray.push(newTX);
                    }

                    //@note: keep track of the total TX cost for user review on the UI side.
                    totalTXCost += baseTXCost;

                    console.log("ethereum transaction :: current total tx cost :: " + totalTXCost);

                    //note: subtract the amount sent from the balance remaining, and check whether there's zero remaining.
                    balanceRemaining -= amountToSendFromAccount;

                    console.log("ethereum transaction :: balanceRemaining (post) :: " + balanceRemaining);

                    if (balanceRemaining <= 0) {
                        console.log("ethereum transaction :: finished combining :: number of accounts involved :: " + txArray.length + " :: total tx cost :: " + totalTXCost);
                        break;
                    } else {
                        //@note: otherwise, there's another transaction necessary so increase the balance remaining by the base tx cost.
//                        balanceRemaining += baseTXCost;
                    }
                }
            }

            if (txSuccess === false) {
                console.log("ethereum transaction :: txSuccess is false");
                return null;
            }
        }

        //@note: ethereum will calculate it's own transaction fee inside of _buildTransaction.
        if (txArray.length > 0) {
            return {txArray: txArray, totalTXCost: totalTXCost};
        } else {
            console.log("ethereum transaction :: txArray.length is zero");
            return null;
        }
    } else {
        console.log("ethereum transaction :: no accounts found");
        return null;
    }
}

HDWalletPouch.prototype.sendBitcoinTransaction = function(transaction, callback) {
    var mockTx = transaction._kkMockTx;
    var txid = mockTx.txid;

    console.log('Sending Transaction:', txid, transaction, transaction.toHex(), mockTx);

    if (this._transactions[txid]) {
        throw new Error('What?!'); //TODO ask richard what is this
    }

    this._transactions[txid] = mockTx;
    this._spendable = null;

    this.invalidateTransactionCache();

    this._notify();

    // Post the transaction
    var self = this;


    btcRelays.getCurrentRelay().pushRawTx(transaction.toHex(), function (response){
        if(response.status === 'success'){
            self._transactions[txid].status = 'success';
            self._notify();
        }
        else if (self._transactions[txid].status !== 'success') {
            delete self._transactions[txid];
            self._notify();
        }
        self.log(response);
        if (callback) {
            callback(response, transaction);
        }
    });

}

HDWalletPouch.prototype.sendEthereumTransaction = function(transaction, callback, params, debugIdx) {
    //@note:@todo:@next:
    var hex = '0x' + transaction.serialize().toString('hex');

//    console.log("send transaction :: " + JSON.stringify(transaction));
//
//    callback('success', null, params);
//
//    return;
//
    var self = this;
    $.getJSON('https://api.etherscan.io/api?module=proxy&action=eth_sendRawTransaction&hex=' + hex, function (data) {
        self.invalidateTransactionCache();
        self.invalidateWorkerCache();

        if (!data || !data.result || data.result.length !== 66) {
            console.log('Error sending', data, " :: " + debugIdx + " :: " + JSON.stringify(transaction) + " :: hex :: " + hex);

            if (callback) {
                var message = 'An error occurred';
                if (data && data.error && data.error.message) {
                    message = data.error.message;
                }

                callback(new Error(message), null, params);
                delete self._transactions[transaction._mockTx.hash + "_" + transaction._mockTx.from];

                //@note: reverse the mock transaction update.
                var addressInfo = self._w_addressMap[transaction._mockTx.from];
                if (typeof(addressInfo) !== 'undefined') {
                    var txCostPlusGas = transaction._mockTx.valueDelta - (transaction._mockTx.gasUsed * transaction._mockTx.gasPrice);

                    addressInfo.accountBalance -= txCostPlusGas;
                    addressInfo.nonce--;
                    addressInfo.newSendTx = null;
                    delete addressInfo.accountTXProcessed[transaction._mockTx.hash];
                } else {
                    console.log("sendEthereumTransaction error :: addressInfo undefined")
                }

                if (self._worker) {
                    self._worker.postMessage({
                        action: 'updateAddressMap',
                        content: {
                            addressMap: self._w_addressMap
                        }
                    });
                }
            }
        } else {
            console.log('Success sending', data, " :: " + debugIdx + " :: " + JSON.stringify(transaction) + " :: hex :: " + hex);

            if (callback) {
                callback('success', data.result, params);
            }

            self._transactions[transaction._mockTx.hash + "_" + transaction._mockTx.from] = transaction._mockTx;

            var addressInfo = self._w_addressMap[transaction._mockTx.from];
            if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
                //@note: sending from and to self, total balance = 0
                if (self.isAddressFromSelf(transaction._mockTx.to)) {
                } else {
                }

                var txCostPlusGas = transaction._mockTx.valueDelta - (transaction._mockTx.gasUsed * transaction._mockTx.gasPrice);

                addressInfo.accountBalance += txCostPlusGas;
                addressInfo.nonce++;

                addressInfo.accountTXProcessed[transaction._mockTx.hash] = true;
                addressInfo.newSendTx = true;
            } else {
                console.log("sendEthereumTransaction success :: addressInfo undefined")
            }

            if (self._worker) {
                self._worker.postMessage({
                    action: 'updateAddressMap',
                    content: {
                        addressMap: self._w_addressMap
                    }
                });
            }

            self._notify();
        }
    });
}

HDWalletPouch.prototype.refresh = function () {
    if (this._worker) {
        this._worker.postMessage({
            action: 'refresh',
            content: { }
        });
    }
}

HDWalletPouch.prototype.refreshIfNecessary = function() {
    if (this._hasInitRefresh === false) {
        this._hasInitRefresh = true;

        this.refresh();
    }
}

HDWalletPouch.prototype.setLogger = function(logger) {
    if (logger && logger.log) {
        this._logger = logger;
    } else {
        this._logger = console;
    }
}

HDWalletPouch.prototype._requestBlockNumber = function(callback) {
    if (this._coinType === COIN_BITCOIN) {
        callback(null);
    } else if (this._coinType === COIN_ETHEREUM) {
        var self = this;

        $.getJSON('https://api.etherscan.io/api?module=proxy&action=eth_blockNumber', function (data) {
            if (!data || !data.result) {
                if (self._currentBlock === -1) {
                    self._currentBlock = 0;
                };

                var errStr = "_requestBlockNumber :: no data from api server";
                callback(errStr);
                return;
            }

            self._currentBlock = parseInt(data.result, 16);

            callback(null);
        });
    }
}

HDWalletPouch.prototype.getBlockNumber = function() {
    return this._currentBlock;
}

HDWalletPouch.prototype.getPrivateKeys =  function() {
    var result = [];
    var pairList = this.getKeypairsList();
    for (var i = 0; i < pairList.length; i++) {
        result.push(pairList[i][0]);
    }
    return $.unique(result);
}

HDWalletPouch.prototype.getUsedAddresses =  function() {
    var result = [];
    var pairList = this.getKeypairsList();
    for (var i = 0; i < pairList.length; i++) {
        result.push(pairList[i][1]);
    }
    return $.unique(result);
}

//Returns a multidimensional array with pairs public/private key
HDWalletPouch.prototype.getKeypairsList = function(){
    //@note: @todo: we might want to sort these..
    var result = [];

    var transactions = this.getTransactions(); //Get all transactions

    var lastIndexChange = 0;
    var lastIndexReceive = 0;

    for (var ti = 0; ti < transactions.length; ti++) { //iterate through txs
        var transaction = transactions[ti];

        if (this._coinType === COIN_BITCOIN) {
            //First we need to determine if this is an incoming tx. let see balance
//            console.log("bitcoin :: tx :: " + JSON.stringify(transaction));

            //Iterate on Inputs
            for (var i = 0; i < transaction.inputs.length; i++) {
                var input = transaction.inputs[i];
                // Our address, money sent (input values are always negative)
                if (!input.addressInternal && input.addressIndex !== null) {
                    if (input.addressIndex > lastIndexReceive) {
                        lastIndexReceive = input.addressIndex;
                    }

//                    var tempPair = [];
//                    tempPair[0] = this.getPrivateKey(input.addressInternal, input.addressIndex).toWIF();
//                    tempPair[1] = input.address;
//                    result.push(tempPair);
//
//                    console.log("bitcoin :: input index :: " + input.addressIndex + " :: public address :: " + tempPair[1] + " :: private key :: " + tempPair[0]);
                }
                if (input.addressInternal && input.addressIndex !== null) {
                    if (input.addressIndex > lastIndexChange) {
                        lastIndexChange = input.addressIndex;
                    }
                }
            }

            for (var i = 0; i < transaction.outputs.length; i++) {
                var output = transaction.outputs[i];
                if (!output.addressInternal && output.addressIndex !== null) {
                    if (output.addressIndex > lastIndexReceive) {
                        lastIndexReceive = output.addressIndex;
                    }

//                    var tempPair = [];
//                    tempPair[0] = this.getPrivateKey(output.addressInternal, output.addressIndex).toWIF();
//                    tempPair[1] = output.address;
//                    result.push(tempPair);
//
//                    console.log("bitcoin :: output index :: " + output.addressIndex + " :: public address :: " + tempPair[1] + " :: private key :: " + tempPair[0]);
                }
                if (output.addressInternal && output.addressIndex !== null) {
                    if (output.addressIndex > lastIndexChange) {
                        lastIndexChange = output.addressIndex;
                    }
                }
            }
        } else if (this._coinType === COIN_ETHEREUM) {
            //            console.log("tx :: " + JSON.stringify(transaction));

            //@note: for ether, we're using a similar method, checking out the address map for a to: equivalence.
            if (transaction.addressIndex !== null) {
                if (!transaction.addressInternal) {
                    if (transaction.addressIndex > lastIndexReceive) {
                        lastIndexReceive = transaction.addressIndex;
                    }
                    var privateKey = this.getPrivateKey(false, transaction.addressIndex).d.toBuffer(32).toString('hex');
//                    console.log("private key :: " + transaction.addressIndex + " :: " + JSON.stringify(privateKey));
                    var publicAddress = this.getPublicAddress(false, transaction.addressIndex);

                    var tempPair = [];
                    tempPair[0] = privateKey;
                    tempPair[1] = publicAddress;
                    result.push(tempPair);
                }
            }
        }
    }

    if (this._coinType === COIN_BITCOIN) {
        for (var i = lastIndexReceive + 1; i >= 0; i--) {
            var tempPair = [];
            tempPair[0] = this.getPrivateKey(false, i).toWIF();
            tempPair[1] = this.getPublicAddress(false, i);
            result.push(tempPair);

//            console.log("bitcoin :: receive node(i) :: " + i + " :: address :: " + tempPair[1] + " :: private :: " + tempPair[0]);
        }

        for (var i = lastIndexChange + 1; i >= 0; i--) {
            var tempPair = [];
            tempPair[0] = this.getPrivateKey(true, i).toWIF();
            tempPair[1] = this.getPublicAddress(true, i);
            result.push(tempPair);

            //            console.log("bitcoin :: change node(i) :: " + i + " :: address :: " + tempPair[1] + " :: private :: " + tempPair[0]);
        }

        result.reverse();
//        var tempPair = [];
//        tempPair[0] = this.getPrivateKey(false, lastIndex + 1).toWIF();
//        tempPair[1] = this.getPublicAddress(false, lastIndex + 1);
//        result.push(tempPair);
    } else if (this._coinType === COIN_ETHEREUM) {
        var finalIndex = 0;

        if (result.length === 0) {
            finalIndex = 0;
        } else {
            finalIndex = lastIndexReceive + 1;
        }
        var tempPair = [];
        tempPair[0] = this.getPrivateKey(false, finalIndex).d.toBuffer(32).toString('hex');
        tempPair[1] = this.getPublicAddress(false, finalIndex);
        result.push(tempPair);
    }

    result.reverse();

    var extremeDebug = false;

    if (extremeDebug) {
        if (this._coinType === COIN_ETHEREUM) {
            for (var info in this._w_addressMap) {
                var addressInfo = this._w_addressMap[info];
                if (!addressInfo.internal) {
                    console.log("account balance :: " + this.getPublicAddress(false, addressInfo.index) + " :: " + this.getEthereumAccountBalance(false, addressInfo.index));
                }
            }

            this.sortHighestAccounts();
            console.log("_sortedHighestAccountArray :: " + JSON.stringify(this._sortedHighestAccountArray));
        }
        if (this._coinType === COIN_ETHEREUM) {
            results = {};
            //        console.log("[receiveNode] :: " + this._receiveNode.toBase58());
            //        console.log("[receiveNode] chaincode :: " + this._receiveNode.chainCode);

            //@note: @here: transfer paper wallet repro.
//            this._receiveNode.keyPair.compressed = false;
            console.log("[receiveNode] pubKeyBuff :: " + this._receiveNode.keyPair.getPublicKeyBuffer());
//            var manualPvt = this.manuallyDeriveUnhardened(this._receiveNode, 0).keyPair.d.toBuffer(32).toString('hex');

            //        console.log("[receiveNode] manual zeroth :: " + manualPvt);

            for (var i = 0; i < 2; i++) {
                var privateKey = this.getPrivateKey(false, i, true).d.toBuffer(32).toString('hex');

                //            var publicAddress = HDWalletPouch.getLightwalletEthereumAddress(HDWalletPouch._derive(this._receiveNode, i, false));
                var publicAddress = this.getPublicAddress(false, i, true);

                //            console.log("[receive] buffer :: " + HDWalletPouch._derive(this._receiveNode, i, false).toBase58());
                //            console.log("[receive] chaincode :: " + HDWalletPouch._derive(this._receiveNode, i, false).chainCode)
                //            console.log("[receive] derive private key :: " + i + " :: " + HDWalletPouch._derive(this._receiveNode, i, false).keyPair.d.toBuffer(32).toString('hex'));

                console.log("[receive] uncached private key :: " + i + " :: " + privateKey + " :: " + publicAddress);

                //            var privateKey = this.getPrivateKey(false, i, true).d.toBuffer(32).toString('hex');
                //
                //            //            var publicAddress = HDWalletPouch.getLightwalletEthereumAddress(HDWalletPouch._derive(this._receiveNode, i, false));
                //            var publicAddress = this.getPublicAddress(false, i, true);
                //
                //            console.log("[receive] cached private key :: " + i + " :: " + privateKey + " :: " + publicAddress);
                //
                //            var tempPair = [];
                //            tempPair[0] = privateKey;
                //            tempPair[1] = publicAddress;
                //            result.push(tempPair);
            }
        }
    }


    return result;
}

HDWalletPouch.prototype.getEthereumLegacyStableKeypair = function() {
    return HDWalletHelper.toEthereumChecksumAddress(this.getPrivateKey(this._coinType, this._receiveNode).toString()) + ", " + this._receiveNode.keyPair.d.toBuffer(32).toString('hex');
}

HDWalletPouch.prototype.log = function() {

    // Convert the argument list to an array
    var args = [].slice.call(arguments);

    // Log immediately to our log
    this._logger.log.apply(this._logger, args);
    if (console != this._logger) {
        console.log.apply(console, args);
    }

    // Store for latter for deferred logs
    args.unshift('Deferred:');
    this._log.push(args);

    // Cap the log at 50 entries
    while (this._log.length > 50) {
        this._log.shift();
    }
}

HDWalletPouch.prototype.dumpLog = function() {
    // Dump the deferred log set
    for (var i = 0; i < this._log.length; i++) {
        this._logger.log.apply(this._logger, this._log[i]);
    }
}

//@note: not really needed anymore, was used to do a test of derivation functions.
HDWalletPouch.prototype.manuallyDeriveUnhardened = function(fromNode, index) {
//    typeforce(types.UInt32, index)
    var curve = thirdparty.ecurve.getCurveByName('secp256k1');

    var isHardened = index >= thirdparty.bitcoin.HDNode.HIGHEST_BIT
    var data = new Buffer(37)

    // Hardened child
    if (isHardened) {
        if (!fromNode.keyPair.d) {
            console.log("error :: A in derivation");
            return null;
        }

        // data = 0x00 || ser256(kpar) || ser32(index)
        data[0] = 0x00
        fromNode.keyPair.d.toBuffer(32).copy(data, 1)
        data.writeUInt32BE(index, 33)

        // Normal child
    } else {
        // data = serP(point(kpar)) || ser32(index)
        //      = serP(Kpar) || ser32(index)
        console.log("pubkeybuff :: " + fromNode.keyPair.getPublicKeyBuffer().toString('hex'));
        fromNode.keyPair.getPublicKeyBuffer().copy(data, 0)
        data.writeUInt32BE(index, 33)
    }

    var I = thirdparty.createHmac('sha512', fromNode.chainCode).update(data).digest()
    console.log("createHmac :: I :: " + I);
    var IL = I.slice(0, 32)
    var IR = I.slice(32)

    var pIL = thirdparty.bigi.fromBuffer(IL)

    // In case parse256(IL) >= n, proceed with the next value for i
    if (pIL.compareTo(curve.n) >= 0) {
        console.log("error :: B in derivation");
        return null;
        //return this.derive(index + 1)
    }

    // Private parent key -> private child key
    var derivedKeyPair
    if (fromNode.keyPair.d) {
        // ki = parse256(IL) + kpar (mod n)
        var ki = pIL.add(fromNode.keyPair.d).mod(curve.n)
        console.log("ki :: " + ki);

        // In case ki == 0, proceed with the next value for i
        if (ki.signum() === 0) {
            console.log("error :: C in derivation");
            return null;
            //return this.derive(index + 1)
        }

        derivedKeyPair = new thirdparty.bitcoin.ECPair(ki, null, {
            network: fromNode.keyPair.network
        })

        // Public parent key -> public child key
    } else {
        // Ki = point(parse256(IL)) + Kpar
        //    = G*IL + Kpar
        var Ki = curve.G.multiply(pIL).add(fromNode.keyPair.Q)

        // In case Ki is the point at infinity, proceed with the next value for i
        if (curve.isInfinity(Ki)) {
            console.log("error :: D in derivation");
            return null;
//            return this.derive(index + 1)
        }

        derivedKeyPair = new thirdparty.bitcoin.ECPair(null, Ki, {
            network: fromNode.keyPair.network
        })
    }

    var hd = new thirdparty.bitcoin.HDNode(derivedKeyPair, IR)
    hd.depth = fromNode.depth + 1
    hd.index = index
    hd.parentFingerprint = fromNode.getFingerprint().readUInt32BE(0)

    return hd;
}
