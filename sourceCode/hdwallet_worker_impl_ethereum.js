//importScripts("../jaxx_wallet_storage_impl_ethereum.js");

var HDWalletWorkerEthereum = function() {
    this._doDebug = false;
    this._batchSize = 1;
    this._batchSizeBalances = 20;
    this._coinName = "Ethereum";

    this._workerManager = null;
}

HDWalletWorkerEthereum.networkParams = {
    static_relay_url: "https://api.etherscan.io",
    gather_tx: "/api?module=account&action=txlist&address=",
    gather_tx_append: "&sort=asc&apikey=" + HDWalletHelper.apiKeyEtherScan,
    multi_balance: "/api?module=account&action=balancemulti&address=",
    multi_balance_append: "&tag=latest&apikey=" + HDWalletHelper.apiKeyEtherScan,
    joinParameters: ",",
    block_number: '/api?module=proxy&action=eth_blockNumber&apikey=' + HDWalletHelper.apiKeyEtherScan,
    smart_contract_code: "/api?module=proxy&action=eth_getCode&address=",
    smart_contract_code_append: "&tag=latest",
    send_tx: "/api?module=proxy&action=eth_sendRawTransaction&hex=",
    send_tx_append: "&apikey=" + HDWalletHelper.apiKeyEtherScan,
};

HDWalletWorkerEthereum.relayManagerParams = {
    isSupported: false,
    implementationFileName: "",
}

HDWalletWorkerEthereum.prototype.initialize = function(workerManager) {
    this._workerManager = workerManager;
}

HDWalletWorkerEthereum.prototype.log = function(logString) {
    if (this._doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('EthereumWorkerLog:');
    console.log(args);
}

HDWalletWorkerEthereum.prototype.batchScanBlockchain = function(addresses) {
    var self = this;

    var batch = [];
    while (addresses.length) {
        batch.push(addresses.shift());
        if (batch.length === this._batchSize || addresses.length === 0) {

            var addressParam = batch.join(HDWalletWorkerEthereum.networkParams.joinParameters);

            //            if (this._coinType === COIN_ETHEREUM) {
            //                log("ethereum :: requesting :: " + addressParam);
            //            }

            var requestURL = HDWalletWorkerEthereum.networkParams.static_relay_url + HDWalletWorkerEthereum.networkParams.gather_tx + addressParam + HDWalletWorkerEthereum.networkParams.gather_tx_append;


            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParam) {
                self._populateHistory(data, passthroughParam);
            }, null, addressParam);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerEthereum.prototype._populateHistory = function(addressData, passthroughParam) {
    if (!addressData || (addressData.status !== 'success' && addressData.status !== '1' && typeof(addressData.byAddress) === undefined)) {
        this.log("hdwalletworker :: " + this._coinName + " :: _populateHistory :: error :: addressData is not returning success :: addressData :: " + JSON.stringify(addressData));

        return;
    }

    var dateNow = (new Date()).getTime();
    var updated = false;

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

    if (!addressData.result || addressData.result.length === 0) {
        this.log("HDWalletWorkerEthereum.populateHistory :: error :: addressData is not returning results" + JSON.stringify(addressData.result));
        return;
    }

    var managerLastReceiveIndex = parseInt(this._workerManager._lastReceiveIndex);
    var managerCurrentReceiveAddress = this._workerManager._currentReceiveAddress;
    var managerLastChangeIndex = parseInt(this._workerManager._lastChangeIndex);
    var managerCurrentChangeAddress = this._workerManager._currentChangeAddress;

    //        log("ethereum :: for address :: " + ethScanAddress + " :: found data :: " + JSON.stringify(data));

    var errorDetected = false;

    for (var i = 0; i < addressData.result.length; i++) {
        var tx = addressData.result[i];

        this.log("ethereum :: tx :: " + JSON.stringify(tx));

        if (tx.to !== ethScanAddress && tx.from !== ethScanAddress) {
            this.log("error :: returned data :: to :: " + tx.to + " :: from :: " + tx.from + " :: from etherum relay does not match :: " + ethScanAddress + " :: " + JSON.stringify(tx));

            errorDetected = true;
        }
    }

    if (errorDetected === true) {
        return;
    }

    var addressInfo = this._workerManager._addressMap[ethScanAddress];
    if (!addressInfo) {
        this.log("error :: returned data from eth api host does not match an existing address.");
        return;
    }

    addressInfo.updatedTimestamp = dateNow;

    // Mark the address as used
    if (!addressInfo.used) {
        this.log("ethereum :: address :: " + ethScanAddress + " :: is now accounted for.");

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

    this._updateTransactionsEthereum(transactions, ethScanAddress);

    var updateDict = {lastReceiveIndex: managerLastReceiveIndex, currentReceiveAddress: managerCurrentReceiveAddress, lastChangeIndex: managerLastChangeIndex, currentChangeAddress: managerCurrentChangeAddress, updated: updated};

    this._workerManager.updateWorkerManager(updateDict);
}

//@note: @here: @todo: reexamine this usefulness of this function once our relays
//can give us proper balances from internal contract transactions.


//@note: @next:

HDWalletWorkerEthereum.prototype.updateBalancesEthereum = function(callback) {
    var addressesToCheck = [];

    for (var address in this._workerManager._addressMap) {
        addressesToCheck.push(address);
    }

    var self = this;


    var threadingParams = {totalBalanceRequests: 0,
                           numBalanceRequestsFailed: 0,
                           numBalanceRequestsPassed: 0,
                           callback: callback};

    //@note: @todo: @here: get the batch size from the relay directly.

    var batch = [];
    while (addressesToCheck.length) {
        batch.push(addressesToCheck.shift());
        if (batch.length === this._batchSizeBalances || addressesToCheck.length === 0) {
            threadingParams.totalBalanceRequests++;

            var addressParam = batch.join(HDWalletWorkerEthereum.networkParams.joinParameters);

            var passthroughParams = {addressParam: addressParam,
                                    threadingParams: threadingParams};
            //            console.log("checking :: " + batch + " :: " + batch.length + " :: " + this._STATIC_RELAY_URL + this._MULTI_BALANCE + addressParam + this._MULTI_BALANCE_APPEND);

            var requestURL = HDWalletWorkerEthereum.networkParams.static_relay_url + HDWalletWorkerEthereum.networkParams.multi_balance + addressParam + HDWalletWorkerEthereum.networkParams.multi_balance_append;

            //@note: @here: request the account balances for this batch
            RequestSerializer.getJSON(requestURL, function(data, success, passthroughParams) {
                self._updateBalancesEthereum(data, function(err, res) {
                    if (err) {
                        passthroughParams.threadingParams.numBalanceRequestsFailed++;
                    } else {
                        passthroughParams.threadingParams.numBalanceRequestsPassed++;
                    }

                    if (passthroughParams.threadingParams.numBalanceRequestsFailed +
                        passthroughParams.threadingParams.numBalanceRequestsPassed ===
                        passthroughParams.threadingParams.totalBalanceRequests) {

                        passthroughParams.threadingParams.callback(threadingParams);
                    }
                });
            }, null, passthroughParams);

            // Clear the batch
            batch = [];
        }
    }
}

HDWalletWorkerEthereum.prototype._updateBalancesEthereum = function(data, callback) {
    //@note: as of april 18 2016 this was returning message: "OK" and status: 1 even
    //with addresses that were obviously wrong, like invalid hex characters.
    if (!data && data.result) {// || data.status !== 'success') {
        var logString = "HDWalletWorkerEthereum._updateBalancesEthereum :: error :: data is incorrect :: " + JSON.stringify(data);

        this.log(logString);

        callback(logString, null);
        return;
    }

    //    log("updated balances :: " + data.result.length);

    //{"status":"1","message":"OK","result":[{"account":"","balance":"0"},{"account":"","balance":"0"},{"account":"0x2434AA3696415A96607278452C468964663f832d","balance":"457513609779999200"},{"account":"b","balance":"0"}]}

    var didUpdate = false;
    var results = data.result;

    for (var i = 0; i < data.result.length; i++) {
        var res = data.result[i];

        var addressInfo = this._workerManager._addressMap[res.account];

        //        log("account :: " + res.account + " :: found new balance :: " + res.balance + " :: comparing to :: " + addressInfo.accountBalance);

        if (addressInfo.accountBalance !== parseInt(res.balance)) {
            addressInfo.accountBalance = parseInt(res.balance);
            didUpdate = true;
        }
    }


    if (didUpdate) {
        var updateDict = {updated: didUpdate};

        this._workerManager.updateWorkerManager(updateDict);
    }

    callback(null, didUpdate);
}

HDWalletWorkerEthereum.prototype._updateTransactionsEthereum = function(transactions, ethScanAddress) {
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

    //    log("ethereum :: _updateTransactionsEthereum :: " + Object.keys(transactions).length + " :: ethScanAddress :: " + ethScanAddress);

    for (var txid in transactions) {
        var transaction = transactions[txid];

        var existingTransaction = this._workerManager._transactions[transaction.hash + "_" + ethScanAddress];

        if (!existingTransaction) {
            this.log("ethereum :: found new TX :: " + JSON.stringify(transaction) + " :: ethScanAddress :: " + ethScanAddress);
            var txDelta = 0;

            //@note: need to reverse the to and from fields in the case where the address has sent.

            var addressInfo = this._workerManager._addressMap[ethScanAddress];
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
                confirmations: transaction.confirmations,
                blockNumber: transaction.blockNumber,
                timestamp: transaction.timeStamp,
                valueDelta: txDelta,
                gasUsed: transaction.gasUsed,
                gasPrice: transaction.gasPrice,
                to: transaction.to,//(isSender === true) ? transaction.to : transaction.from,
                from: transaction.from//(isSender === true) ? transaction.from : transaction.to
            }

            updateDict.transactions[transaction.hash + "_" + ethScanAddress] = tx;
        } else {
            if (existingTransaction.confirmations != transaction.confirmations) {
                existingTransaction.confirmations = transaction.confirmations;

                updateDict.transactions[transaction.hash + "_" + ethScanAddress] = existingTransaction;
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

HDWalletWorkerEthereum.prototype.updateBalances = function(callback) {
    if (typeof(callback) === 'undefined' || callback === null) {
        callback = function() {
        };
    }

    this.updateBalancesEthereum(callback);
}

HDWalletWorkerEthereum.prototype.performRecheck = function(callback) {
    var self = this;

    this.updateBalances(function(threadingParams) {
        console.log("finished rechecking with :: requests # :: " + threadingParams.totalBalanceRequests);

        self._workerManager.postFinishedFinalBalanceUpdate();
    });
}
