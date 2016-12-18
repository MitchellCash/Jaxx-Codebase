//importScripts("../jaxx_wallet_storage_impl_ethereum_classic.js");

var HDWalletWorkerEthereumClassic = function() {
    this._doDebug = false;
    this._batchSizeGather = 30;
    this._batchSizeDetails = 30;
    this._batchSizeBalances = 30;//20;

    this._coinName = "Ethereum Classic";

    this._workerManager = null;
}

HDWalletWorkerEthereumClassic.networkParams = {
    static_relay_url: "http://api.jaxx.io:8080/api/eth",
    gather_tx: "/transactions?addresses=",
    gather_tx_append: "",
    tx_details: "/transactionInfo?transactions=",
    tx_details_append: "",
    multi_balance: "/balance?addresses=",
    multi_balance_append: "",
    joinParameters: ",",
    block_number: "/latestBlockNumberInserted",
    smart_contract_code: "/code?address=",
    send_tx: "/rawTransaction",
    nonce: "/nextNonce?address=",
};

HDWalletWorkerEthereumClassic.relayManagerParams = {
    isSupported: false,
    implementationFileName: "",
}

HDWalletWorkerEthereumClassic.prototype.initialize = function(workerManager) {
    this._workerManager = workerManager;
}

HDWalletWorkerEthereumClassic.prototype.log = function(logString) {
    if (this._doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('EthereumClassicWorkerLog:');
    console.log(args);
}

HDWalletWorkerEthereumClassic.prototype.batchScanBlockchain = function(addresses) {
    var self = this;

    var batch = [];
    while (addresses.length) {
        batch.push(addresses.shift());
        if (batch.length === this._batchSizeGather || addresses.length === 0) {

            var addressParam = batch.join(HDWalletWorkerEthereumClassic.networkParams.joinParameters);

//            this.log("ethereum classic :: requesting :: " + addressParam);

            var requestURL = HDWalletWorkerEthereumClassic.networkParams.static_relay_url + HDWalletWorkerEthereumClassic.networkParams.gather_tx + addressParam + HDWalletWorkerEthereumClassic.networkParams.gather_tx_append;


            //@note: @here: @todo: sending batch is only necessary since we can only associate one
            //account at the moment.
            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParams) {
//                self.log("ethereum classic :: processorData :: " + JSON.stringify(data));
                self._populateHistory(data, passthroughParams);
            }, null, batch);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerEthereumClassic.prototype._populateHistory = function(processorData, passthroughParams) {
    if (!processorData) {
        this.log("hdwalletworker :: " + this._coinName + " :: _populateHistory :: error :: address :: " + passthroughParams[0] + " :: is not returning success :: addressData :: " + JSON.stringify(addressData));

        return;
    }

    if (Object.keys(processorData).length === 0) {
        return;
    }

    var dateNow = (new Date()).getTime();
    var updated = false;

//    this.log("ethereum classic :: processorData :: " + processorData);

    //@note: return data from jaxx.io

//    {
//        "0x09ceeaae64e7c2b9a95b457d5acb4c83e9d9667a": [
//            {
//                "_id": "57befb1d1621c58c07e43066",
//                "hash": "0x470eae2925c2906793aab2177ec484fa6879c4e7ffdaef764b63211f919b1733"
//            },
//            {
//                "_id": "57bef1721621c58c07e42e1f",
//                "hash": "0x1eb07d320c2f5ff01eec3fb77c71b7bc1f7d3095db05324ae4e011eb6168de05"
//            }
//        ]
//    }

    var addressKeys = Object.keys(processorData);

//    this.log("ethereum classic :: returned data :: keys :: " + JSON.stringify(addressKeys) + " :: full :: " + JSON.stringify(processorData));


    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    var allTxList = {};

    //        log("ethereum :: for address :: " + curAddress + " :: found data :: " + JSON.stringify(data));

    for (var i = 0; i < addressKeys.length; i++) {
        var curAddress = addressKeys[i];


        var addressInfo = this._workerManager._addressMap[curAddress];
        if (!addressInfo) {
            this.log("ethereum classic :: error :: returned data from eth api host does not match an existing address :: curAddress :: " + curAddress);
            return;
        }

        addressInfo.updatedTimestamp = dateNow;

        var txs = processorData[curAddress];

        if (!txs || txs.length == 0) {
            continue;
        }

        // Mark the address as used
        if (!addressInfo.used) {
            this.log("ethereum classic :: address :: " + curAddress + " :: is now accounted for.");

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

        //@note: translate from address based associative dictionary to transaction based.
        for (var j = 0; j < txs.length; j++) {
            if (typeof(allTxList[txs[j].hash]) === 'undefined' || allTxList[txs[j].hash] === null) {
                allTxList[txs[j].hash] = [];
            }

            allTxList[txs[j].hash].push(curAddress);
        }
    }

    if (Object.keys(allTxList).length > 0) {
        this._lookupTransactions(allTxList, function() {

        });
    }
//    this._updateTransactionsEthereum(transactions, curAddress);

    var updateDict = {lastReceiveIndex: managerLastReceiveIndex, currentReceiveAddress: managerCurrentReceiveAddress, lastChangeIndex: managerLastChangeIndex, currentChangeAddress: managerCurrentChangeAddress, updated: updated};

    this._workerManager.updateWorkerManager(updateDict);
}

HDWalletWorkerEthereumClassic.prototype._lookupTransactions = function(allTxList, callback) {
    var self = this;

    this.log("ethereum classic :: lookupTransactions :: allTxList :: " + JSON.stringify(allTxList));

    var txBatch = Object.keys(allTxList);

    var batch = [];
    while (txBatch.length) {
        batch.push(txBatch.shift());
        if (batch.length === this._batchSizeDetails || txBatch.length === 0) {

            var addressParam = batch.join(HDWalletWorkerEthereumClassic.networkParams.joinParameters);

            //            this.log("ethereum classic :: requesting :: " + addressParam);

            var requestURL = HDWalletWorkerEthereumClassic.networkParams.static_relay_url + HDWalletWorkerEthereumClassic.networkParams.tx_details + addressParam + HDWalletWorkerEthereumClassic.networkParams.tx_details_append;

            var txParams = {};
            txParams.associativeAddressList = allTxList;
            txParams.callback = callback;

            //@note: @here: @todo: sending batch is only necessary since we can only associate one
            //account at the moment.
            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParams) {
                self.log("ethereum classic :: _lookupTransactions :: processorData :: " + JSON.stringify(data));
                self._populateTransactions(data, passthroughParams);
            }, null, txParams);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerEthereumClassic.prototype._populateTransactions = function(transactions, passthroughParams) {
    if (!transactions) {
        if (passthroughParams.callback) {
            passthroughParams.callback({});
        }

        return;
    }

    var updated = this._updateTransactions(transactions, passthroughParams.associativeAddressList);

    if (passthroughParams.callback) {
        passthroughParams.callback(updated);
    }
}

HDWalletWorkerEthereumClassic.prototype._updateTransactions = function(transactions, associativeAddressList) {
    var updateDict = {transactions: {},
                      lastReceiveIndex: -1,
                      currentReceiveAddress: null,
                      lastChangeIndex: -1,
                      currentChangeAddress: null};

    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    var totalBalance = 0;

    var theDAOTokenContractAddress = CoinToken.getStaticTokenImplementation(CoinToken.TheDAO).pouchParameters['tokenContractAddress'];

    var augurTokenContractAddress = CoinToken.getStaticTokenImplementation(CoinToken.Augur).pouchParameters['tokenContractAddress'];

    this.log("ethereum classic :: _updateTransactionsEthereum :: " + Object.keys(transactions).length + " :: transactions :: "  + JSON.stringify(transactions) +  " :: associativeAddressList :: " + JSON.stringify(associativeAddressList));

    for (var i = 0; i < transactions.length; i++) {
        var transaction = transactions[i];
        var txid = transaction.hash;

        for (var addressIdx in associativeAddressList[txid]) {
            var curAddress = associativeAddressList[txid][addressIdx];

            this.log("ethereum classic :: checking associated address :: " + curAddress);

            var existingTransaction = this._workerManager._transactions[transaction.hash + "_" + curAddress];

            if (!existingTransaction) {
                this.log("ethereum classic :: found new TX :: " + JSON.stringify(transaction) + " :: curAddress :: " + curAddress);
                var txDelta = 0;

                //@note: need to reverse the to and from fields in the case where the address has sent.

                var addressInfo = this._workerManager._addressMap[curAddress];
                var isSender = false;

                if (transaction.to == curAddress) {
                    if (typeof(addressInfo) !== "undefined" && addressInfo !== null) {
                        //                log("ethereum :: tx add :: " + JSON.stringify(addressInfo) + " :: " + transaction.value);
                        txDelta = transaction.value;
                    }
                } else if (transaction.from == curAddress) {
                    if (typeof(addressInfo) !== "undefined" && addressInfo !== null) {
                        //                    log("ethereum :: tx subtract :: " + JSON.stringify(addressInfo) + " :: " + transaction.value);
                        txDelta = -transaction.value;
                        isSender = true;
                    }
                } else {
                    this.log("error :: _updateTransactionsEthereum :: tx has no mapping :: " + JSON.stringify(transaction));
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
                    if (transaction.to === theDAOTokenContractAddress) {
                        //                    console.log("found theDaoAssociated :: " + transaction.from);
                        addressInfo.isTheDAOAssociated = true;
                    }
                    if (transaction.to === augurTokenContractAddress) {
                        //                    console.log("found theDaoAssociated :: " + transaction.from);
                        addressInfo.isAugurAssociated = true;
                    }
                    if (transaction.to === transaction.from) {
                        txDelta = 0;
                        isSender = true;
                        //                console.log("error :: tx has both from and to and only one will count")
                    }

                    this.log("[pre] ethereum :: accountIndex :: " + addressInfo.index + " :: balance :: " + addressInfo.accountBalance);

                    //@note: this dictionary deals with cached tx from history items.
                    var isAccountProcessedFromCaching = addressInfo.accountTXProcessed[transaction.hash];

                    this.log("[mid] ethereum :: accountIndex :: " + addressInfo.index + " :: isAccountProcessedFromCaching :: " + isAccountProcessedFromCaching + " :: txDelta :: " + txDelta);

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

                    this.log("[post] ethereum :: accountIndex :: " + addressInfo.index + " :: balance :: " + addressInfo.accountBalance);

                    if (!addressInfo.internal && addressInfo.index > managerLastReceiveIndex) {
                        managerLastReceiveIndex = addressInfo.index;
                        managerCurrentReceiveAddress = null;
                    } else if (addressInfo.internal && addressInfo.index > managerLastChangeIndex) {
                        managerLastChangeIndex = addressInfo.index;
                        managerCurrentChangeAddress = null;
                    }
                } else {
                    addressInfo = {internal: null, index: null};
                    this.log("error :: ethereum tx issue :: " + JSON.stringify(transaction));
                }

                var tx = {
                    addressIndex: addressInfo.index,
                    addressInternal: addressInfo.internal,
                    txid: transaction.hash,
                    confirmations: 1337,//transaction.confirmations,
                    blockNumber: transaction.blockNumber,
                    timestamp: transaction.timestamp,
                    valueDelta: txDelta,
                    gasUsed: transaction.gasUsed,
                    gasPrice: transaction.gasPrice,
                    to: transaction.to,//(isSender === true) ? transaction.to : transaction.from,
                    from: transaction.from//(isSender === true) ? transaction.from : transaction.to
                }

                updateDict.transactions[transaction.hash + "_" + curAddress] = tx;
            } else {
                if (existingTransaction.confirmations != transaction.confirmations) {
                    existingTransaction.confirmations = transaction.confirmations;

                    updateDict.transactions[transaction.hash + "_" + curAddress] = existingTransaction;
                }
            }
        }
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


//@note: @here: @todo: reexamine this usefulness of this function once our relays
//can give us proper balances from internal contract transactions.


HDWalletWorkerEthereumClassic.prototype._populateHistoryNotWorking = function(processorData, passthroughParams) {
    if (!processorData) {
        this.log("hdwalletworker :: " + this._coinName + " :: _populateHistory :: error :: address :: " + passthroughParams[0] + " :: is not returning success :: addressData :: " + JSON.stringify(addressData));

        return;
    }

    if (Object.keys(processorData).length === 0) {
        return;
    }

    var dateNow = (new Date()).getTime();
    var updated = false;

    this.log("ethereum classic :: processorData :: " + processorData);

    //@note: return data from jaxx.io

    //    {
    //        "0x09ceeaae64e7c2b9a95b457d5acb4c83e9d9667a": [
    //            {
    //                "_id": "57befb1d1621c58c07e43066",
    //                "hash": "0x470eae2925c2906793aab2177ec484fa6879c4e7ffdaef764b63211f919b1733"
    //            },
    //            {
    //                "_id": "57bef1721621c58c07e42e1f",
    //                "hash": "0x1eb07d320c2f5ff01eec3fb77c71b7bc1f7d3095db05324ae4e011eb6168de05"
    //            }
    //        ]
    //    }



    //    [
    //        {
    //            "blockNumber": "2134461",
    //            "blockHash": "0x5ada7ce74595631c4adda7b874c752dc57386f6f710a52c4a9e19ac8dcfea802",
    //            "hash": "0x470eae2925c2906793aab2177ec484fa6879c4e7ffdaef764b63211f919b1733",
    //            "transactionIndex": "2",
    //            "from": "0x09ceeaae64e7c2b9a95b457d5acb4c83e9d9667a",
    //            "to": "0x3294238f923e01f02f640e5c942128b88ad17f03",
    //            "value": "74118000000000000",
    //            "input": "0x",
    //            "nonce": "0",
    //            "gas": "21000",
    //            "isContractCreation": false,
    //            "gasUsed": 21000,
    //            "cumulativeGasUsed": 63000,
    //            "logsString": "[]",
    //            "gasPrice": "21000000000",
    //            "logs": [],
    //            "timestamp": 1472133886
    //        }
    //    ]

    //    {
    //        "transactions": [
    //            {
    //                "blockNumber": "2123295",
    //                "blockHash": "0x0b95a723fa64f2e5bc6f9ccb3f2cf738df08029ddb525a12cf5b1f4cd8d9d8e6",
    //                "hash": "0x5bacfa72095ac74c5a27f099765705378566ba470be8fc9ca7955a5a32961b66",
    //                "transactionIndex": "1",
    //                "from": "0xb9901cc50ec092515510b447113aa60977620f5e",
    //                "to": "0x25ab0be8ce8b44e103282564891d3c05389eeb91",
    //                "value": "25000000000000000",
    //                "input": "0x",
    //                "nonce": "2",
    //                "gas": "121000",
    //                "isContractCreation": false,
    //                "gasUsed": 21000,
    //                "cumulativeGasUsed": 42000,
    //                "logsString": "[]",
    //                "gasPrice": "20000000000",
    //                "logs": [],
    //                "timestamp": 1471971610
    //            },
    //            {
    //                "blockNumber": "2122507",
    //                "blockHash": "0x74ba19e2b4b64fe26868902f6611fd215a7716b9b4512ebe4bc4029ac8c72f13",
    //                "hash": "0x4ea47e9f84b224eaf80aa215022af553ae2711cad5dfeaa7110b11c54567a6d0",
    //                "transactionIndex": "0",
    //                "from": "0xb9901cc50ec092515510b447113aa60977620f5e",
    //                "to": "0x25ab0be8ce8b44e103282564891d3c05389eeb91",
    //                "value": "50000000000000000",
    //                "input": "0x",
    //                "nonce": "1",
    //                "gas": "121000",
    //                "isContractCreation": false,
    //                "gasUsed": 21000,
    //                "cumulativeGasUsed": 21000,
    //                "logsString": "[]",
    //                "gasPrice": "20000000000",
    //                "logs": [],
    //                "timestamp": 1471959803
    //            },
    //            {
    //                "blockNumber": "1947220",
    //                "blockHash": "0xdb5e8ce3f7d16362d5e3317c37220b0302ace845979e91d787cdde88dc6929f6",
    //                "hash": "0xd5c0a12bab60f33be124a30489477d3d24dbbcd9a6853c0f0dff46add92930d5",
    //                "transactionIndex": "13",
    //                "from": "0xb9901cc50ec092515510b447113aa60977620f5e",
    //                "to": "0x7cbf84db2c0db0c8d3b1a6002531ed8cf783f604",
    //                "value": "4590000000000000000",
    //                "input": "0x",
    //                "nonce": "0",
    //                "gas": "121000",
    //                "isContractCreation": false,
    //                "gasUsed": 21000,
    //                "cumulativeGasUsed": 310260,
    //                "logsString": "[]",
    //                "gasPrice": "20000000000",
    //                "logs": [],
    //                "timestamp": 1469473376
    //            }
    //        ],
    //    }
    //        log("ethereum :: returned data :: " + JSON.stringify(addressData));

    var addressData = {};
    addressData.result = [];

    //    var addressKeys = Object.keys(processorData.transactions);


    var allKeys = Object.keys(processorData);

    for (var i = 0; i < allKeys.length; i++) {
        var curAddressTxData = processorData[allKeys[i]];

        //        console.log("curAddress :: " + curAddress + " :: txData :: " + JSON.stringify(newData.txs) + " :: txDetails :: " + JSON.stringify(newData.txDetails));

        curTransaction.confirmations = 1337;
        //        curTransaction.timestamp *= 1000;

        //        addressData.result.push(newData);
        addressData.result.push(curTransaction);
    }

    if (!addressData.result || addressData.result.length === 0) {
        this.log("HDWalletWorkerEthereum.populateHistory :: error :: addressData is not returning results :: " + JSON.stringify(addressData.result));
        return;
    }

    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    //        log("ethereum :: for address :: " + curAddress + " :: found data :: " + JSON.stringify(data));

    var errorDetected = false;

    for (var i = 0; i < addressData.result.length; i++) {
        var tx = addressData.result[i];

        this.log("ethereum classic :: tx :: " + JSON.stringify(tx));

        if (tx.to !== curAddress && tx.from !== curAddress) {
            this.log("error :: returned data :: to :: " + tx.to + " :: from :: " + tx.from + " :: from etherum relay does not match :: " + curAddress + " :: " + JSON.stringify(tx));

            errorDetected = true;
        }
    }

    if (errorDetected === true) {
        return;
    }

    var addressInfo = this._workerManager._addressMap[curAddress];
    if (!addressInfo) {
        this.log("ethereum classic :: error :: returned data from eth api host does not match an existing address.");
        return;
    }

    addressInfo.updatedTimestamp = dateNow;

    // Mark the address as used
    if (!addressInfo.used) {
        this.log("ethereum classic :: address :: " + curAddress + " :: is now accounted for.");

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

    var transactions = {};

    for (var i = 0; i < addressData.result.length; i++) {
        var tx = addressData.result[i];

        transactions[tx.hash] = tx;
    }

    this._updateTransactionsEthereum(transactions, curAddress);

    var updateDict = {lastReceiveIndex: managerLastReceiveIndex, currentReceiveAddress: managerCurrentReceiveAddress, lastChangeIndex: managerLastChangeIndex, currentChangeAddress: managerCurrentChangeAddress, updated: updated};

    this._workerManager.updateWorkerManager(updateDict);
}

//@note: @next:

HDWalletWorkerEthereumClassic.prototype.updateBalancesEthereum = function() {
    var addressesToCheck = [];

    for (var address in this._workerManager._addressMap) {
        addressesToCheck.push(address);
    }

    var self = this;

    //@note: @todo: @here: get the batch size from the relay directly.

    var batch = [];
    while (addressesToCheck.length) {
        batch.push(addressesToCheck.shift());
        if (batch.length === this._batchSizeBalances || addressesToCheck.length === 0) {

            var addressParam = batch.join(HDWalletWorkerEthereumClassic.networkParams.joinParameters);

            var requestURL = HDWalletWorkerEthereumClassic.networkParams.static_relay_url + HDWalletWorkerEthereumClassic.networkParams.multi_balance + addressParam + HDWalletWorkerEthereumClassic.networkParams.multi_balance_append;

            this.log("HDWalletWorkerEthereumClassic :: checking :: " + batch + " :: " + batch.length + " :: requestURL :: " + requestURL);

//            console.log("checking :: " + requestURL);

            //@note: @here: request the account balances for this batch
            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParams) {
                self._updateBalancesEthereum(data, passthroughParams);
            }, null, addressParam);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerEthereumClassic.prototype._updateBalancesEthereum = function(processorData, passthroughParams) {
    //@note: as of april 18 2016 this was returning message: "OK" and status: 1 even
    //with addresses that were obviously wrong, like invalid hex characters.
    if (!processorData) {// || data.status !== 'success') {
        this.log("HDWalletWorkerEthereumClassic._updateBalancesEthereum :: error :: processorData is incorrect :: " + JSON.stringify(processorData) + " :: passthroughParams :: " + JSON.stringify(passthroughParams));
        return;
    }

//    var inputAddresses = passthroughParams.split(HDWalletWorkerEthereumClassic.networkParams.joinParameters);

//    this.log("HDWalletWorkerEthereumClassic :: updated balances :: " + JSON.stringify(processorData));

    //@note: node returns the following data:

//    {
//        "0x25ab0be8ce8b44e103282564891d3c05389eeb91":"0",
//        "0x0725de8e029ea78f805db07681b3e511551888bc":"0",
//        "0x09ceeaae64e7c2b9a95b457d5acb4c83e9d9667a":"0",
//        "0x298d467421edf812a93a9ce7908dfd90e4129665":"0",
//        "0x3294238f923e01f02f640e5c942128b88ad17f03":"0",
//        "0xed56384afe31d23b2a1a1f05185d0a54dd7c259f":"0",
//        "0xba65eda0d0c4887fe0d76418c3a74896626796c9":"0",
//        "0xa51c902eab0ba9b0dfc3180013568545d76a9b31":"0",
//        "0xa2e1b5daa575adde99750842df4c48b84c981058":"0",
//        "0x7db3f4b013fad0632ce1eef39eb8c9147607408c":"0",
//        "0x6b9c9f6d95b1a646e26d20ad309c0a431765290d":"0",
//        "0xeac60312924fe4dc4c793cae7ca22f1507f82c6c":"0",
//        "0xc2a26bdb788babd8231916a3f48bc2a75b173149":"0",
//        "0x61d1578368715b795ec5d05ecbcaffb2e6117b69":"0",
//        "0xfc9d62047b9e4438abdbed95939cd4adaa858994":"0",
//        "0xd7c01b55d363705b4132173c8f29db4da9929516":"0",
//        "0x0669f237a461067dd0831a54a9c3aa30fb5a24be":"71472000000000000",
//        "0x827330d51e6005f0ca1e2687e460c31ace86486a":"0",
//        "0xeef0e08d20cedf4479df543268f7c76cb2880c28":"0",
//        "0x66996996f5ad9bb4b93d2fef09c6750a1f35b3ed":"0",
//        "0x27e32ea358ea942ffe640db05ffc9589ed174301":"0",
//        "0xaa1a8a103551f2350f8c730b876b4323cf0418a1":"0",
//        "0x633b482ed584a5396d7c2b65eebf71e9df346673":"0",
//        "0x71bb63a1a2c22ef2a7d9640c4c4c1c00fb8814f2":"0",
//        "0xc09c40c9d52a863c3b12623418a17b3bc3b248c2":"0",
//        "0x8e1e1efca44a25b40667a225c5d099c939a4f58a":"0",
//        "0x94ca9a17000f20838249157fe6c0ab9d2833620d":"0",
//        "0x0dca3c0bc6bfb1c45b22f9cec2d1e3017000aa4d":"0",
//        "0x7540861d45bf44faf05cdafcef87e051b0d57e54":"0",
//        "0x243a981a65856ec0bcfe7b60beb4b9673e085162":"0"
//    }

    var didUpdate = false;

    var processedAddresses = Object.keys(processorData);

    for (var i = 0; i < processedAddresses.length; i++) {
        var curAddress = processedAddresses[i];
        var curBalance = parseInt(processorData[curAddress]);

        var addressInfo = this._workerManager._addressMap[curAddress];

//        this.log("account :: " + res.account + " :: found new balance :: " + res.balance + " :: comparing to :: " + addressInfo.accountBalance);

        if (typeof(addressInfo) !== "undefined" && addressInfo !== null) {
            if (addressInfo.accountBalance !== curBalance) {
                addressInfo.accountBalance = curBalance;
                didUpdate = true;
            }
        }
    }


    if (didUpdate) {
        var updateDict = {updated: didUpdate};

        this._workerManager.updateWorkerManager(updateDict);
    }
}

HDWalletWorkerEthereumClassic.prototype.updateBalances = function() {
    this.updateBalancesEthereum();
}

HDWalletWorkerEthereumClassic.prototype.performRecheck = function() {
    this.updateBalances();
}
