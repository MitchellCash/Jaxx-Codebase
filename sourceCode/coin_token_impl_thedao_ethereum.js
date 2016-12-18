var CoinTokenTheDAOEthereum = function() {
    this._foldManager = null;
}

CoinTokenTheDAOEthereum.uiComponents = {
    coinFullName: 'TheDAOEthereum',
    coinFullDisplayName: 'DAO',
    coinSymbol: '\u0110',
    coinButtonSVGName: 'DAOlogo',
    coinLargePngName: '.imgDAO',
    coinButtonName: '.imageLogoBannerDAO',
    coinSpinnerElementName: '.imageTheDAOEtherWash',
    coinDisplayColor: '#E52E4B',
    //    csvExportField: '.backupPrivateKeyListETH',
    transactionsListElementName: '.transactionsTheDAOEthereum',
    transactionTemplateElementName: '.transactionTheDAOEthereum',
    accountsListElementName: '.accountDataTableEthereum',
    accountTemplateElementName: '.accountDataTheDAOEthereum',
    displayNumDecimals: 8,
};

CoinTokenTheDAOEthereum.pouchParameters = {
    coinIsTokenSubtype: true,
    coinAbbreviatedName: 'DAO',
    tokenContractAddress: '0xbb9bc244d798123fde783fcc1c72d3bb8c189413',
    tokenIsERC20: true,
    transferOpCode: '0xa9059cbb',
    refundOpCode: '0x3ccfd60b',
    approveOpCode: '0x095ea7b3',
    tokenWithdrawalAddress: '0xbf4ed7b27f1d666546e30d74d50d173d20bca754',
};

CoinTokenTheDAOEthereum.networkDefinitions = {
    mainNet: null,
    testNet: null,
}

CoinTokenTheDAOEthereum.getDefaultGasLimit = function() {
    return thirdparty.web3.toBigNumber(150000);
}

CoinTokenTheDAOEthereum.prototype.initialize = function(foldManager) {
    this._foldManager = foldManager;
}

CoinTokenTheDAOEthereum.prototype.createTransaction = function(address, depositAddresses, amount) {
    //@note: @here: this should check for address, amount validity.
    //@note: @todo: maybe a transaction queue?


    var ethereumAddress = HDWalletHelper.parseEthereumAddress(address);

    var computedFee = "";

    var gasPrice = HDWalletHelper.getDefaultEthereumGasPrice();
    var gasLimit = CoinToken.getStaticTokenImplementation(this._foldManager._tokenCoinType).getDefaultGasLimit();

    //@note: construct the abi here.

    var transferOpCode = this._foldManager.getTransferOpCode();

    //@note: if not shapeshift, use basic address.

    if (depositAddresses.length === 0) {
        depositAddresses = [ethereumAddress];
    }

    var ethereumTXDataPrePendArray = [];

    for (var i = 0; i < depositAddresses.length; i++) {
        var ABIAddressTarget = HDWalletHelper.zeroPadLeft(HDWalletHelper.toEthereumNakedAddress(depositAddresses[i]), 64);

        var ethereumTXDataPrePend = transferOpCode + ABIAddressTarget;
        ethereumTXDataPrePendArray.push(ethereumTXDataPrePend);
    }

    //                console.log("ethereumTXDataPrePend :: " + ethereumTXDataPrePend);
    //@note: @here: due to the ethereum tx structure, we may need multiple individual transactions.

    var coinHolderType = CoinToken.getTokenCoinHolderType(this._foldManager._tokenCoinType);

    var foldMainPouch = wallet.getPouchFold(coinHolderType);

    var targetTokenContractAddress = CoinToken.getStaticTokenImplementation(this._foldManager._tokenCoinType).pouchParameters['tokenContractAddress'];

    //@note: getPouchFoldImplementation()
    var transactionDict = this._foldManager.buildERC20EthereumTransactionList(foldMainPouch, targetTokenContractAddress, amount, gasPrice, gasLimit, ethereumTXDataPrePendArray, null);

    transactionDict.ethereumAddress = ethereumAddress;
    transactionDict.gasPrice = gasPrice;
    transactionDict.gasLimit = gasLimit;
    transactionDict.miningFee = HDWalletHelper.convertWeiToEther(transactionDict.totalTXCost);

    return transactionDict;
}
