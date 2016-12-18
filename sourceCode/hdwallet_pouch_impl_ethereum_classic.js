var HDWalletPouchEthereumClassic = function() {
    this._doDebug = false;

    this._pouchManager = null;

    this._ethAddressTypeMap = {};
}

HDWalletPouchEthereumClassic.uiComponents = {
    coinFullName: 'EthereumClassic',
    coinFullDisplayName: 'Ethereum Classic',
    coinSymbol: '\u039E',
    coinButtonSVGName: 'ether-classic-new',
    coinLargePngName: '.imgETC',
    coinButtonName: '.imageLogoBannerETC',
    coinSpinnerElementName: '.imageEtherClassicWash',
    coinDisplayColor: '#8890AF',
    csvExportField: '.backupPrivateKeyListETC',
    transactionsListElementName: '.transactionsEthereumClassic',
    transactionTemplateElementName: '.transactionEthereumClassic',
    accountsListElementName: '.accountDataTableEthereumClassic',
    accountTemplateElementName: '.accountDataEthereumClassic',
    displayNumDecimals: 8,
};

HDWalletPouchEthereumClassic.pouchParameters = {
    coinHDType: 61,
    coinIsTokenSubtype: false,
    coinAbbreviatedName: 'ETC',
};

HDWalletPouchEthereumClassic.getCoinAddress = function(node) {
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

HDWalletPouchEthereumClassic.prototype.convertFiatToCoin = function(fiatAmount, coinUnitType) {
    var coinAmount = 0;

    var wei = wallet.getHelper().convertFiatToWei(fiatAmount);
    coinAmount = (coinUnitType === COIN_UNITLARGE) ? HDWalletHelper.convertWeiToEther(wei) : wei;

    return coinAmount;
}

HDWalletPouchEthereumClassic.prototype.initialize = function(pouchManager) {
    this._pouchManager = pouchManager;
}


HDWalletPouchEthereumClassic.prototype.shutDown = function() {
    for (var i = 0; i < CoinToken.numCoinTokens; i++) {
        this._pouchManager._token[i].shutDown();
    }
}

HDWalletPouchEthereumClassic.prototype.setup = function() {
    this.setupTokens();
}

HDWalletPouchEthereumClassic.prototype.setupTokens = function() {
    for (var i = 0; i < CoinToken.numCoinTokens; i++) {
        this._pouchManager._token[i] = new CoinToken();
    }

    var baseReceiveAddress = HDWalletPouch.getCoinAddress(this._pouchManager._coinType, HDWalletPouch._derive(this._pouchManager._receiveNode, 0, false)).toString();

    this._pouchManager._token[CoinToken.TheDAO].initialize("TheDAO", "DAO", CoinToken.TheDAO, baseReceiveAddress, this._pouchManager, HDWalletHelper.getDefaultEthereumGasPrice(), HDWalletHelper.getDefaultTheDAOGasLimit(), this._pouchManager._storageKey);

    this.updateTokenAddresses(this._pouchManager._w_addressMap);
}

HDWalletPouchEthereumClassic.prototype.log = function(logString) {
    if (this._doDebug === false) {
        return;
    }

    var args = [].slice.call(arguments);
    args.unshift('EthereumClassicPouchLog:');
    console.log(args);
}

HDWalletPouchEthereumClassic.prototype.updateMiningFees = function() {
}

HDWalletPouchEthereumClassic.prototype.updateTransactionsFromWorker = function(txid, transactions) {
    //                                                        console.log("wallet worker update :: eth tx :: " + Object.keys(transactions).length);
    //                            console.log("incoming eth tx :: " + JSON.stringify(transaction) + " :: " + txid);

    this._pouchManager._largeQrCode = null;
    this._pouchManager._smallQrCode = null;

    return false;
}

HDWalletPouchEthereumClassic.prototype.getTransactions = function() {
    var res = [];

    //        console.log("this._transactions length :: " + Object.keys(this._transactions).length);
    for (var txid in this._pouchManager._transactions) {
//                    console.log("adding tx :: " + txid)
        res.push(this._pouchManager._transactions[txid]);
    }

    res.sort(function (a, b) {
        var deltaTimeStamp = (b.timestamp - a.timestamp);
        if (deltaTimeStamp) { return deltaTimeStamp; }
        return (a.confirmations - b.confirmations);
    });

    return res;
}

HDWalletPouchEthereumClassic.prototype.calculateHistoryforTransaction = function(transaction) {
    //            console.log("A :: ethereum transaction :: " + JSON.stringify(transaction));
    if (typeof(transaction.addressIndex) !== 'undefined' && transaction.addressIndex !== null) {
        //                console.log("B :: ethereum transaction :: " + JSON.stringify(transaction));

        var toAddress = "";
        var toAddressFull = "";

        var valueDelta = thirdparty.web3.fromWei(transaction.valueDelta);
        var valueDAO = 77777; // Need transaction.txid --> address from DAOhub

        if (this.isAddressFromSelf(transaction.to)) {
            toAddress = "Self";
            toAddressFull = "Self"
        } else {
            toAddress = transaction.to.substring(0, 7) + '...' + transaction.to.substring(transaction.to.length - 5);
            toAddressFull = transaction.to;
            if (transaction.from === 'GENESIS') {
                toAddress = transaction.from;
            }

        }

        var gasCost = thirdparty.web3.fromWei(transaction.gasUsed * transaction.gasPrice);

        var newHistoryItem = {
            toAddress: toAddress,
            toAddressFull: toAddressFull,
            blockNumber: transaction.blockNumber,
            confirmations: transaction.confirmations,
            deltaBalance: valueDelta,
            deltaDAO: valueDAO,
            gasCost: gasCost,
            timestamp: transaction.timestamp,
            txid: transaction.txid
        };

        return newHistoryItem;
    } else {
        console.log("error :: undetermined transaction :: " + JSON.stringify(transaction));

        return null;
    }
}

HDWalletPouchEthereumClassic.prototype.getPouchFoldBalance = function() {
    var balance = 0;

    var highestIndexToCheck = this._pouchManager.getHighestReceiveIndex();

    highestIndexToCheck++; //@note: @here: check for internal transaction balances on current receive account.

    if (highestIndexToCheck !== -1) {

        for (var i = 0; i < highestIndexToCheck + 1; i++) {
            var curBalance = this.getAccountBalance(false, i);
            balance += curBalance;
        }
    }

    return balance;
}

HDWalletPouchEthereumClassic.prototype.getAccountBalance = function(internal, index) {
    var accountBalance = 0;

    //@note: @here: @todo: consider changing this to a class function
    var publicAddress = this._pouchManager.getPublicAddress(internal, index);

    //@note: for ethereum checksum addresses.
    publicAddress = publicAddress.toLowerCase();

    var addressInfo = this._pouchManager._w_addressMap[publicAddress];

    //        console.log("publicAddress :: " + publicAddress);
    //        if (publicAddress == "0x8e63e85adebcdb448bb93a2f3bd00215c1cbaec4") {
    //            console.log("internal :: " + internal + " :: index :: " + index + " :: publicAddress :: " + publicAddress + " :: info :: " + JSON.stringify(addressInfo) + " :: _w_addressMap :: " + JSON.stringify(this._w_addressMap));
    //
    //        }

    if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
        //            console.log("publicAddress :: " + publicAddress + " :: balance :: " + addressInfo.accountBalance);
        accountBalance = addressInfo.accountBalance;
    }

    return accountBalance;
}

HDWalletPouchEthereumClassic.prototype.getSpendableBalance = function(minimumValue) {
    var spendableDict = {spendableBalance: 0,
                         numPotentialTX: 0};

    var spendableBalance = 0;
    var numPotentialTX = 0;

    //        console.log("types :: " + typeof(this._helper.getCustomEthereumGasLimit()) + " :: " + typeof(HDWalletHelper.getDefaultEthereumGasPrice()));
    //        console.log("spendable :: custom gas limit :: " + this._helper.getCustomEthereumGasLimit() + " :: default gas price :: " + HDWalletHelper.getDefaultEthereumGasPrice());

    var baseTXCost = this._pouchManager._helper.getCustomEthereumGasLimit().mul(HDWalletHelper.getDefaultEthereumGasPrice()).toNumber();

    var totalTXCost = 0;

    //@note: returns {index: x, balance: y} format.
    var highestAccountDict = this._pouchManager.getHighestAccountBalanceAndIndex();
    if (highestAccountDict !== null) {
        for (var i = 0; i < this._pouchManager._sortedHighestAccountArray.length; i++) {
            var accountBalance = this._pouchManager._sortedHighestAccountArray[i].balance;

            //@note: check for account balance lower than the dust limit
            if (accountBalance <= minimumValue + baseTXCost) {

            } else {
                spendableBalance += accountBalance - baseTXCost;
                numPotentialTX++;
                totalTXCost += baseTXCost;
            }
        }
    }

    //        console.log("ethereum spendable :: " + spendableBalance + " :: totalTXCost :: " + totalTXCost + " :: " + numPotentialTX + " :: minimumValue :: " + minimumValue);

    spendableDict.spendableBalance = spendableBalance;
    spendableDict.numPotentialTX = numPotentialTX;

    return spendableDict;
}

HDWalletPouchEthereumClassic.prototype.updateTokenAddresses = function(addressMap) {
    var transferableMap = {};
    var votableMap = {};

    //    console.log("[" + this._coinFullName + "] :: updating token addresses");

    //@note: this tokenTransferableList is null right now, most likely to be extended with DGX tokens and so on.
    for (var publicAddress in addressMap) {
        var addressInfo = addressMap[publicAddress];

        //    console.log("internal :: " + internal + " :: index :: " + index + " :: publicAddress :: " + publicAddress + " :: info :: " + JSON.stringify(addressInfo) + " :: _w_addressMap :: " + JSON.stringify(this._w_addressMap));

        if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
            //            console.log("adding :: " + publicAddress + " :: to :: " + addressInfo.tokenTransferableList + " :: " + addressInfo.tokenVotableList);
            transferableMap[publicAddress] = addressInfo.tokenTransferableList;
            votableMap[publicAddress] = addressInfo.tokenVotableList;
        }
    }

    //@note: update for getting the first dao address correctly updating.


    var firstPublicAddress = this._pouchManager.getPublicAddress(false, 0).toLowerCase();
    //    console.log("[The DAO] :: transfer list :: firstPublicAddress :: " + firstPublicAddress);

    if (typeof(transferableMap[firstPublicAddress]) === 'undefined' || transferableMap[firstPublicAddress] === null) {
        transferableMap[firstPublicAddress] = true;
    }

    for (var i = 0; i < CoinToken.numCoinTokens; i++) {
        var tokenTransferableArray = [];
        var tokenVotableArray = [];

        //@note: tokens are transferable by default. however, if they are explicitly marked as not transferable, respect that.
        for (publicAddress in transferableMap) {
            var curTransferableToken = transferableMap[publicAddress];
            if ((typeof(curTransferableToken) !== undefined && curTransferableToken !== null && curTransferableToken !== false) || (typeof(curTransferableToken) === undefined || curTransferableToken === null))  {
                //                console.log("adding :: " + publicAddress + " :: to transferableMap");
                tokenTransferableArray.push(publicAddress);
            }
        }

        //@note: tokens are not votable by default.
        for (publicAddress in votableMap) {
            var curVotableToken = votableMap[publicAddress];
            if (typeof(curVotableToken) !== undefined && curVotableToken !== null && curVotableToken === true) {
                tokenVotableArray.push(publicAddress);
            }
        }

        //        console.log("transferable :: " + JSON.stringify(tokenTransferableArray) + " :: " + JSON.stringify(tokenVotableArray));

        this._pouchManager._token[i].setIsTransferable(tokenTransferableArray);
        this._pouchManager._token[i].setIsVotable(tokenVotableArray);
    }
}

HDWalletPouchEthereumClassic.prototype.getEthereumNonce = function(internal, index) {
    if (typeof(index) === 'undefined' || index === null) {
        console.log("error :: getEthereumNonce :: index undefined or null");
        return -1;
    }

    var fromAddress = HDWalletPouch.getCoinAddress(this._pouchManager._coinType, this._pouchManager.getNode(internal, index));

    var transactions = this.getTransactions(); //Get all transactions

    var txDict = {};
    var highestNonce = 0;
    for (var ti = 0; ti < transactions.length; ti++) { //iterate through txs
        var transaction = transactions[ti];
        if (transaction.from === fromAddress) {
            txDict[transaction.txid] = true;
            //@note: @here: @bug: for address 0x5630a246f35996a1d605174d119ece78c8f5d94a,
            //it appears that there are 8 tx when doing it the following way, which is wrong. getTransactions only has 6 identifiers.
//            console.log("fromAddress :: " + fromAddress + " :: found tx :: " + JSON.stringify(transaction.txid));
            //            highestNonce++;
        }
    }

    highestNonce = Object.keys(txDict).length;

//    self.log("getEthereumNonce :: fromAddress :: " + fromAddress + " :: highestNonce :: " + highestNonce);
    //    if (internal === false) {
    //        internal = 0;
    //    } else if (internal === true) {
    //        internal = 1;
    //    }
    //
    //    var publicAddress = this.getPublicAddress(internal, index);
    //
    //    //@note: for ethereum checksum addresses.
    //    publicAddress = publicAddress.toLowerCase();
    //
    //    var addressInfo = this._w_addressMap[publicAddress];
    //
    //    var nonce = 0;
    //
    //    if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
    //        nonce = addressInfo.nonce;
    //
    //        //        console.log("publicAddress :: " + publicAddress + " :: info :: " + JSON.stringify(addressInfo));
    //    }
    //
    return highestNonce;
}

HDWalletPouchEthereumClassic.prototype.getEthereumNonceForCustomAddress = function(address, callback) {
    var networkParams = HDWalletPouch.getStaticCoinWorkerImplementation(COIN_ETHEREUM_CLASSIC).networkParams;

    var requestUrl = networkParams['static_relay_url'] + networkParams['nonce'] + address;

    RequestSerializer.getJSON(requestUrl, function (data) {
        if (!data || typeof(data.nextNonce) === 'undefined' || data.nextNonce === null) {
            var errStr = "failed to get nonce info from :: " + address + " :: data :: " + data;
            callback(errStr, null);
        } else {
            //@note: contractCode here results in *only* "0x" if it's not a contract, and the full code if it is.
            var nonce = data.nextNonce;

            callback(null, nonce);
        }
    });
}

HDWalletPouchEthereumClassic.prototype._buildEthereumTransaction = function(fromNodeInternal, fromNodeIndex, toAddress, amount_smallUnit, ethGasPrice, ethGasLimit, ethData, doNotSign) {
    var gasPrice = HDWalletHelper.hexify(ethGasPrice);
    var gasLimit = HDWalletHelper.hexify(ethGasLimit);

    var fromAddress = HDWalletPouch.getCoinAddress(this._pouchManager._coinType, this._pouchManager.getNode(fromNodeInternal, fromNodeIndex));

    this.log("ethereum classic :: from address :: " + fromAddress);

    var nonce = this.getEthereumNonce(fromNodeInternal, fromNodeIndex);

    this.log("ethereum classic :: build tx nonce :: " + nonce + " :: gasPrice :: " + ethGasPrice + " :: gasLimit :: " + ethGasLimit);

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

    //    var privateKeyB = new thirdparty.Buffer.Buffer('e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109', 'hex')
    //
    //    console.log("private key :: " + this._private + " :: " +  + this._private.length + " :: privateKeyB :: " + privateKeyB + " :: " + privateKeyB.length);

    if (typeof(doNotSign) !== 'undefined' || (doNotSign !== null && doNotSign !== false)) {
        var pvtKeyBuffer = new Buffer(this._pouchManager.getPrivateKey(fromNodeInternal, fromNodeIndex).d.toBuffer(32), 'hex');
        //        console.log(pvtKeyBuffer.length);
        //        console.log(this.getPrivateKey(fromNodeInternal, fromNodeIndex));
        transaction.sign(pvtKeyBuffer);
    }


    var txhash = ('0x' + transaction.hash().toString('hex'));

    var publicAddress = this._pouchManager.getPublicAddress(fromNodeInternal, fromNodeIndex);

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

HDWalletPouchEthereumClassic.prototype.buildEthereumTransactionList = function(toAddressArray, amount_smallUnit, gasPrice, gasLimit, ethData, doNotSign) {
    var amountWei = parseInt(amount_smallUnit);

    var txArray = [];

    //@note: @here: @todo: add custom contract support when merging into the develop branch.
    var baseTXCost = gasPrice * gasLimit;

    var totalTXCost = 0;

    //@note: returns {index: x, balance: y} format.
    var highestAccountDict = this._pouchManager.getHighestAccountBalanceAndIndex();

    if (highestAccountDict !== null) {
        //@note: check to see whether this will result in the tx being able to be pushed through with this one account, or whether there will need to be more than one account involved in this transaction.
        if (amountWei + baseTXCost <= highestAccountDict.balance) {
            totalTXCost = baseTXCost;

            this.log("ethereum classic :: transaction :: account :: " + highestAccountDict.index + " :: " + highestAccountDict.balance + " :: can cover the entire balance + tx cost :: " + (amountWei + baseTXCost));
            var newTX = this._buildEthereumTransaction(false, highestAccountDict.index, toAddressArray[0], amountWei, gasPrice, gasLimit, ethData, doNotSign);

            if (!newTX) {
                this.log("error :: ethereum classic :: transaction :: account failed to build :: " + highestAccountDict.index);
                return null;
            } else {
                txArray.push(newTX);
            }
        } else {
            var txSuccess = true;

            var balanceRemaining = amountWei;

            //@note: this array is implicitly regenerated and sorted when the getHighestAccountBalanceAndIndex function is called.
            for (var i = 0; i < this._pouchManager._sortedHighestAccountArray.length; i++) {
                this.log("ethereum classic :: transaction :: balanceRemaining (pre) :: " + balanceRemaining);
                //                console.log(typeof(this._sortedHighestAccountArray[i].balance));
                var accountBalance = this._pouchManager._sortedHighestAccountArray[i].balance;

                //@note: if the account cannot support the base tx cost + 1 wei (which might be significantly higher in the case of a contract address target), this process cannot continue as list is already sorted, and this transaction cannot be completed.
                if (accountBalance <= baseTXCost) {
                    this.log("ethereum classic :: transaction :: account :: " + this._pouchManager._sortedHighestAccountArray[i].index + " cannot cover current dust limit of :: " + baseTXCost);
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
                        this.log("ethereum classic :: transaction :: account :: " + this._pouchManager._sortedHighestAccountArray[i].index + " :: does not have enough to cover balance + tx cost :: " + (balanceRemaining + baseTXCost) + " :: accountBalance - tx cost :: " + (accountBalance - baseTXCost));

                        amountToSendFromAccount = (accountBalance - baseTXCost);
                    } else {
                        var accountChange = accountBalance - balanceRemaining - baseTXCost;
                        //                        console.log("types :: " + typeof(balanceRemaining) + " :: " + typeof(baseTXCost));
                        amountToSendFromAccount = balanceRemaining;
                        this.log("ethereum transaction :: account :: " + this._pouchManager._sortedHighestAccountArray[i].index + " :: accountBalance :: " + accountBalance + " :: account balance after (balance + tx cost) :: " + accountChange);

                        //@note: don't do things like bitcoin's change address system for now.
                    }

                    //@note: build this particular transaction, make sure it's constructed correctly.

                    var targetEthereumAddress = toAddressArray[0];

                    if (i >= toAddressArray.length) {

                    } else {
                        targetEthereumAddress = toAddressArray[i];
                    }

                    this.log("ethereum transaction :: account :: " + this._pouchManager._sortedHighestAccountArray[i].index + " :: will send  :: " + amountToSendFromAccount + " :: to :: " + targetEthereumAddress);


                    var newTX = this._buildEthereumTransaction(false, this._pouchManager._sortedHighestAccountArray[i].index, targetEthereumAddress, amountToSendFromAccount, gasPrice, gasLimit, ethData, doNotSign);

                    if (!newTX) {
                        this.log("error :: ethereum classic :: transaction :: account :: " + this._pouchManager._sortedHighestAccountArray[i].index + " cannot build");

                        txSuccess = false;
                        break;
                    } else {
                        txArray.push(newTX);
                    }

                    //@note: keep track of the total TX cost for user review on the UI side.
                    totalTXCost += baseTXCost;

                    this.log("ethereum classic :: transaction :: current total tx cost :: " + totalTXCost);

                    //note: subtract the amount sent from the balance remaining, and check whether there's zero remaining.
                    balanceRemaining -= amountToSendFromAccount;

                    this.log("ethereum transaction :: balanceRemaining (post) :: " + balanceRemaining);

                    if (balanceRemaining <= 0) {
                        this.log("ethereum transaction :: finished combining :: number of accounts involved :: " + txArray.length + " :: total tx cost :: " + totalTXCost);
                        break;
                    } else {
                        //@note: otherwise, there's another transaction necessary so increase the balance remaining by the base tx cost.
                        //                        balanceRemaining += baseTXCost;
                    }
                }
            }

            if (txSuccess === false) {
                this.log("ethereum classic :: transaction :: txSuccess is false");
                return null;
            }
        }

        //@note: ethereum will calculate it's own transaction fee inside of _buildTransaction.
        if (txArray.length > 0) {
            return {txArray: txArray, totalTXCost: totalTXCost};
        } else {
            this.log("ethereum classic :: transaction :: txArray.length is zero");
            return null;
        }
    } else {
        this.log("ethereum classic :: transaction :: no accounts found");
        return null;
    }
}

//@note: @here: this function is needed for the ethereum split contract to function using the ethereum pouch's internalIndex data, plus a custom nonce request for this address on the ETC network. Nonce divergence on ETH doesn't matter in this case because of the nature and reason for this split process.

HDWalletPouchEthereumClassic.prototype._buildEthereumTransactionWithCustomEthereumLikeBlockchain = function(ethereumLikeBlockchainPouch, fromNodeInternal, fromNodeIndex, toAddress, bigNum_amountSmallUnit, ethGasPrice, ethGasLimit, ethData, doNotSign, callback, passthroughParams) {
    var self = this;

    var gasPrice = HDWalletHelper.hexify(ethGasPrice);
    var gasLimit = HDWalletHelper.hexify(ethGasLimit);

    var fromAddress = HDWalletPouch.getCoinAddress(ethereumLikeBlockchainPouch._coinType, ethereumLikeBlockchainPouch.getNode(fromNodeInternal, fromNodeIndex));

    this.log("ethereum classic :: from address :: " + fromAddress);

    this.getEthereumNonceForCustomAddress(fromAddress, function(err, etcNonce) {
        var transaction = null;

        if (err) {
            self.log("ethereum classic :: build tx etcNonce :: failed for address :: " + fromAddress);
        } else {
            self.log("ethereum classic :: build tx etcNonce :: " + etcNonce + " :: gasPrice :: " + ethGasPrice + " :: gasLimit :: " + ethGasLimit);

            var rawTx = {
                nonce: HDWalletHelper.hexify(etcNonce),
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                to: toAddress,
                value: HDWalletHelper.hexify(bigNum_amountSmallUnit),
                //data: '',
            };

            if (ethData && typeof(ethData) !== 'undefined') {
                rawTx.data = ethData;
            }

            transaction = new thirdparty.ethereum.tx(rawTx);
            //    console.log("ethereum buildTransaction :: " + JSON.stringify(transaction));

            //    var privateKeyB = new thirdparty.Buffer.Buffer('e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109', 'hex')
            //
            //    console.log("private key :: " + this._private + " :: " +  + this._private.length + " :: privateKeyB :: " + privateKeyB + " :: " + privateKeyB.length);

            if (typeof(doNotSign) !== 'undefined' || (doNotSign !== null && doNotSign !== false)) {
                var pvtKeyBuffer = new Buffer(ethereumLikeBlockchainPouch.getPrivateKey(fromNodeInternal, fromNodeIndex).d.toBuffer(32), 'hex');
                //        console.log(pvtKeyBuffer.length);
                //        console.log(this.getPrivateKey(fromNodeInternal, fromNodeIndex));
                transaction.sign(pvtKeyBuffer);
            }


            var txhash = ('0x' + transaction.hash().toString('hex'));

            var publicAddress = ethereumLikeBlockchainPouch.getPublicAddress(fromNodeInternal, fromNodeIndex);

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
                nonce: etcNonce,
                //@note: @here: @todo: @critical: this is definitely incorrect: (parseInt(150154021000000020) === parseInt(152254021000000030)) === true
                valueDelta: -bigNum_amountSmallUnit.toNumber(),
            };
        }

        callback(transaction, passthroughParams);
    });
}



HDWalletPouchEthereumClassic.prototype.getIsTheDAOAssociated = function(internal, index) {
    var publicAddress = this._pouchManager.getPublicAddress(internal, index);

    //@note: for ethereum checksum addresses.
    publicAddress = publicAddress.toLowerCase();

    var addressInfo = this._pouchManager._w_addressMap[publicAddress];

    if (typeof(addressInfo) !== 'undefined' && addressInfo !== null) {
        //        console.log("publicAddress :: " + publicAddress + " :: isTheDAOAssociated :: " + addressInfo.isTheDAOAssociated);
        if (addressInfo.isTheDAOAssociated === true) {
            return true;
        }
    }

    return false;
}

HDWalletPouchEthereumClassic.prototype.getAccountList = function(transactions) {
    var result = [];

    var lastIndexChange = 0;
    var lastIndexReceive = 0;

    for (var ti = 0; ti < transactions.length; ti++) { //iterate through txs
        var transaction = transactions[ti];


        //            console.log("tx :: " + JSON.stringify(transaction));

        //@note: for ether, we're using a similar method, checking out the address map for a to: equivalence.
        if (transaction.addressIndex !== null) {
            if (!transaction.addressInternal) {
                if (transaction.addressIndex > lastIndexReceive) {
                    lastIndexReceive = transaction.addressIndex;
                }
                var account = {};
                account.pvtKey = this._pouchManager.getPrivateKey(false, transaction.addressIndex).d.toBuffer(32).toString('hex');
                account.pubAddr = this._pouchManager.getPublicAddress(false, transaction.addressIndex);
                account.balance = this.getAccountBalance(false, transaction.addressIndex);
                account.isTheDAOAssociated = this.getIsTheDAOAssociated(false, transaction.addressIndex);

                result.push(account);
            }
        }
    }


    var finalIndex = 0;

    if (result.length === 0) {
        finalIndex = 0;
    } else {
        finalIndex = lastIndexReceive + 1;
    }
    var account = {};
    account.pvtKey = this._pouchManager.getPrivateKey(false, finalIndex).d.toBuffer(32).toString('hex');
    account.pubAddr = this._pouchManager.getPublicAddress(false, finalIndex);
    account.balance = this.getAccountBalance(false, finalIndex);
    account.isTheDAOAssociated = this.getIsTheDAOAssociated(false, i);

    result.push(account);

    return result;
}

HDWalletPouchEthereumClassic.prototype.generateQRCode = function(largeFormat,  coinAmountSmallType) {
    var curRecAddr = this._pouchManager.getCurrentReceiveAddress();

    var uri = "iban:" + HDWalletHelper.getICAPAddress(curRecAddr);

    if (coinAmountSmallType) {
        uri += "?amount=" + coinAmountSmallType;
    }

    if (largeFormat) {
        if (coinAmountSmallType || !this._pouchManager._largeQrCode) {
            //            this.log('Blocked to generate QR big Code');
            this._pouchManager._largeQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync(uri, {type: "png", ec_level: "H", size: 7, margin: 1}).toString('base64');
        }

        return this._pouchManager._largeQrCode;
    } else {
        if (coinAmountSmallType || !this._pouchManager._smallQrCode) {
            //        this.log('Blocked to generate QR small Code');
            this._pouchManager._smallQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync(uri, {type: "png", ec_level: "H", size: 5, margin: 1}).toString('base64');
        }

        return this._pouchManager._smallQrCode;
    }
}

//@note: this function when passed in an explicit null to ignoreCached, will use cache. cached only in session.
HDWalletPouchEthereumClassic.prototype.isAddressFromSelf = function(addressToCheck, ignoreCached) {
    var isSelfAddress = false;

    //@note: for ethereum checksum addresses.
    addressToCheck = addressToCheck.toLowerCase();

    var key = addressToCheck;
    var isSelfAddress = this._pouchManager._checkAddressCache[key];

    if (typeof(isSelfAddress) === 'undefined' || isSelfAddress === null || typeof(ignoreCached) !== 'undefined') {
        var highestIndexToCheck = this._pouchManager.getHighestReceiveIndex();

        if (highestIndexToCheck !== -1) {
            for (var i = 0; i < highestIndexToCheck + 1; i++) {
                var curAddress = this._pouchManager.getPublicAddress(false, i);

                //@note: for ethereum checksum addresses.
                curAddress = curAddress.toLowerCase();

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
            this._pouchManager._checkAddressCache[addressToCheck] = isSelfAddress;
            //            console.log("caching isAddressFromSelf :: " +  this._checkAddressCache[addressToCheck]);
        } else {
            self.log("uncached");
        }
    } else {
        //        console.log("fetching cached isAddressFromSelf :: " + addressToCheck + " :: key :: " + key + " :: " + isSelfAddress);
    }

    return isSelfAddress;
}

HDWalletPouchEthereumClassic.prototype.sendEthereumTransaction = function(transaction, callback, params, debugIdx) {
    //@note:@todo:@next:
    var hex = '0x' + transaction.serialize().toString('hex');

    //    console.log("send transaction :: " + JSON.stringify(transaction));
    //
    //    callback('success', null, params);
    //
    //    return;
    //
    var self = this;

    var networkParams = HDWalletPouch.getStaticCoinWorkerImplementation(COIN_ETHEREUM_CLASSIC).networkParams;

    var requestUrl = networkParams['static_relay_url'] + networkParams['send_tx'];

    //@note: @here: @todo: @next:
    $.ajax({
        url: requestUrl,
        'Cache-Control': "no-cache",
        Accept: "application/json",
        type: 'PUT',
        headers: {
            transaction: hex
        },
        complete: function(data, successString) {
            self._pouchManager.invalidateTransactionCache();
            self._pouchManager.invalidateWorkerCache();

            if (!data ||
                !data.status
                || data.status !== 200
                || !data.responseJSON
                || !data.responseJSON.transactionHash
                || data.responseJSON.transactionHash.length !== 66) {
                self.log('ethereum classic :: Error sending', data, " :: " + debugIdx + " :: " + JSON.stringify(transaction) + " :: hex :: " + hex);

                if (callback) {
                    var message = 'An error occurred';
                    if (data && data.error && data.error.message) {
                        message = data.error.message;
                    }

                    callback(new Error(message), null, params);
                    delete self._pouchManager._transactions[transaction._mockTx.hash + "_" + transaction._mockTx.from];

                    //@note: reverse the mock transaction update.
                    var addressInfo = self._pouchManager._w_addressMap[transaction._mockTx.from];
                    if (typeof(addressInfo) !== 'undefined') {
                        var txCostPlusGas = transaction._mockTx.valueDelta - (transaction._mockTx.gasUsed * transaction._mockTx.gasPrice);

                        addressInfo.accountBalance -= txCostPlusGas;
                        addressInfo.nonce--;
                        addressInfo.newSendTx = null;
                        delete addressInfo.accountTXProcessed[transaction._mockTx.hash];
                    } else {
                        self.log("ethereum classic :: sendEthereumTransaction error :: addressInfo undefined")
                    }

                    if (self._pouchManager._worker) {
                        self._pouchManager._worker.postMessage({
                            action: 'updateAddressMap',
                            content: {
                                addressMap: self._pouchManager._w_addressMap
                            }
                        });
                    }
                }
            } else {
                self.log('ethereum classic :: Success sending', data, " :: " + debugIdx + " :: " + JSON.stringify(transaction) + " :: hex :: " + hex);

                if (callback) {
                    callback('success', data.result, params);
                }

                self._pouchManager._transactions[transaction._mockTx.hash + "_" + transaction._mockTx.from] = transaction._mockTx;

                var addressInfo = self._pouchManager._w_addressMap[transaction._mockTx.from];
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
                    console.log("ethereum classic :: sendEthereumTransaction success :: addressInfo undefined")
                }

                if (self._pouchManager._worker) {
                    self._pouchManager._worker.postMessage({
                        action: 'updateAddressMap',
                        content: {
                            addressMap: self._w_addressMap
                        }
                    });
                }

                self._pouchManager._notify();
            }
        }
    });
}

HDWalletPouchEthereumClassic.prototype.afterWorkerCacheInvalidate = function() {
    this._pouchManager.sortHighestAccounts();
}

HDWalletPouchEthereumClassic.prototype.requestBlockNumber = function(callback) {
    var self = this;

    var networkParams = HDWalletPouch.getStaticCoinWorkerImplementation(COIN_ETHEREUM_CLASSIC).networkParams;

    var requestUrl = networkParams['static_relay_url'] + networkParams['block_number'];

    $.getJSON(requestUrl, function (data) {
        if (!data || !data.latestBlockNumberInserted) {
            if (self._pouchManager._currentBlock === -1) {
                self._pouchManager._currentBlock = 0;
            };

            var errStr = "HDWalletPouchEthereum :: requestBlockNumber :: no data from api server";
            callback(errStr);
            return;
        }

        self._pouchManager._currentBlock = data.latestBlockNumberInserted;

        callback(null);
    });
}

HDWalletPouchEthereumClassic.prototype.prepareSweepTransaction = function(privateKey, callback) {
    var self = this;

    var signedTransaction;
    var totalValue;

    //Make buffer of privatekey
    var privateKeyToSweep = new thirdparty.Buffer.Buffer(privateKey, 'hex');

    //Derive address from private key -----
    var ethAddressToSweep = HDWalletHelper.getEthereumAddressFromKey(privateKeyToSweep);

    //Query etherscan for balance ---------
    var weiBalance = 0;

    //@note: @todo: @here: @relay: relays for ethereum classic
    RequestSerializer.getJSON('https://api.etherscan.io/api?module=account&action=balance&address=' + ethAddressToSweep + '&tag=latest', function (dataBalance) {
        if (!dataBalance || dataBalance.status != 1 ) {
            self.log('ethereum classic :: Failed to get balance for '+ethAddressToSweep+ ' ; dataBalance:'+dataBalance);
            callback(new Error('Error: while getting balance'), null);
        }
        weiBalance = dataBalance.result;
        var gasPrice = HDWalletHelper.getDefaultEthereumGasPrice();
        var gasLimit = HDWalletHelper.getDefaultEthereumGasLimit();
        var spendableWei = weiBalance - gasPrice.mul(gasLimit).toNumber();

        //        console.log("weiBalance :: " + weiBalance + " :: gasPrice :: " + gasPrice + " + :: gasLimit :: " + gasLimit + " :: spendableWei :: " + spendableWei);

        if(spendableWei <= 0){
            self.log('ethereum classic :: Nothing to sweep');
            callback(null, null);
            return;
        }

        //Get all tx associated to account ---
        var txHist =  {};

        RequestSerializer.getJSON('https://api.etherscan.io/api?module=account&action=txlist&address=' + ethAddressToSweep + '&sort=asc', function (dataTx) {
            if (!dataTx || dataTx.status != 1 ) {
                self.log('ethereum classic :: Failed to get txList for '+ethAddressToSweep+ ' ; dataTx:'+dataTx);
                callback(new Error('Error: while getting txlist'), null);
            }

            for (var i = 0; i < dataTx.result.length; i++) {
                var tx = dataTx.result[i];
                txHist[tx.hash] = tx;
            }

            //Compute nonce -----------------------
            //As an alternative we could use this entry point https://etherchain.org/api/account/<address>/nonce

            var nonce = 0;
            for (var txid in txHist) {
                var tx = txHist[txid];
                if (tx.from === ethAddressToSweep) {
                    nonce++;
                }
            }

            //create a signed tx ------------------

            var rawSweepTx = {
                nonce: HDWalletHelper.hexify(nonce),
                gasPrice: HDWalletHelper.hexify(gasPrice),
                gasLimit: HDWalletHelper.hexify(gasLimit),
                to: wallet.getPouchFold(COIN_ETHEREUM).getPublicAddress(),
                value: HDWalletHelper.hexify(spendableWei),
            };

            //@note:@todo:@here:
            var sweepTransaction = new thirdparty.ethereum.tx(rawSweepTx);

            sweepTransaction.sign(privateKeyToSweep);

            sweepTransaction._mockTx = {
                blockNumber: null,
                confirmations: 0,
                from: ethAddressToSweep,
                hash: ('0x' + sweepTransaction.hash().toString('hex')),
                timestamp: (new Date()).getTime() / 1000,
                to: wallet.getPouchFold(COIN_ETHEREUM).getPublicAddress(),
                nonce: nonce,
                value: spendableWei,
            };

            totalValue = HDWalletHelper.convertWeiToEther(spendableWei);

            var hex = '0x' + sweepTransaction.serialize().toString('hex');

            //callback correct ------------------------
            callback(null, {
                signedTransaction: sweepTransaction,
                totalValue: totalValue,
                transactionFee: gasPrice,
            });

            return true;
        }); //End JSON call for TX list
    }); //End JSON call for balance
}

HDWalletPouchEthereumClassic.prototype.fromChecksumAddress = function(address) {
    //@note: for ethereum checksum addresses.
    return address.toLowerCase();
}

HDWalletPouchEthereumClassic.prototype.toChecksumAddress = function(address) {
    //@note: for ethereum checksum addresses.
    return HDWalletHelper.toEthereumChecksumAddress(address);
}

HDWalletPouchEthereumClassic.prototype.hasCachedAddressAsContract = function(address) {
    if (this._ethAddressTypeMap[address]) {
        if (this._ethAddressTypeMap[address] === true) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

HDWalletPouchEthereumClassic.prototype.checkIsSmartContractQuery = function(address, callback)
{
    if (this._ethAddressTypeMap[address]) {
        callback(null, this._ethAddressTypeMap[address]);
    }

    var self = this;

    var networkParams = HDWalletPouch.getStaticCoinWorkerImplementation(COIN_ETHEREUM_CLASSIC).networkParams;

    var requestUrl = networkParams['static_relay_url'] + networkParams['smart_contract_code'] + address;

    RequestSerializer.getJSON(requestUrl, function (data) {
        if (!data || (data.subCode && data.subCode === 100)) {
            var errStr = "failed to get address info from :: " + url + " :: " + data;
            callback(errStr, null);
        } else {

            //@note: contractCode here results in *only* "0x" if it's not a contract, and the full code if it is.
            var contractCode = data.result;
            if (contractCode === '0x') {
                self._ethAddressTypeMap[address] = false;
                callback(null, false);
            } else {
                self._ethAddressTypeMap[address] = true;
                callback(null, true);
            }
        }
    });
}
