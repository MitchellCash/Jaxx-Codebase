var HDWalletHelper = function() {
    this._updateExchangeRateTime = 10000;
    this._exchangeRates = [];

    this._ethAddressTypeMap = {};

    this._defaultEthereumGasPrice = thirdparty.web3.toWei(thirdparty.web3.toBigNumber('21'), 'shannon');
    this._defaultEthereumGasLimit = thirdparty.web3.toBigNumber(21000);
    this._recommendedEthereumCustomGasLimit = this._defaultEthereumGasLimit;
    this._currentEthereumCustomGasLimit = this._recommendedEthereumCustomGasLimit;

    this._coinHDType = [];
    this._coinHDType[COIN_BITCOIN] = 0;
    this._coinHDType[COIN_ETHEREUM] = 60;

    //@note: unused for now, ethereum has no testnet node in SLIP 0044 as of yet.
    this._coinHDTypeTestnetOffset = [];
    this._coinHDTypeTestnetOffset[COIN_BITCOIN] = 1;
    this._coinHDTypeTestnetOffset[COIN_ETHEREUM] = 131337;

    this._exchangeRateListenerCallbacks = [];
}

HDWalletHelper.theDAOAddress = "0xbb9bc244d798123fde783fcc1c72d3bb8c189413";

HDWalletHelper.checkMnemonic = function() {
    //@note: @here: @todo: check for 12 word mnemonics.
    if (thirdparty.bip39.validateMnemonic(mnemonic)) {
        return true;
    } else {
        return false;
    }
}

HDWalletHelper.getNetworkTypeStringForCoinType = function(coinType, testNet) {
    //@note: @security: this should be using coin names etc. but for backwards compatibility it cannot.

    if (testNet) {
        return "-test";// + coinFullName[coinType];
    } else {
        return "-main";// + coinFullName[coinType];
    }
}

HDWalletHelper.prototype.getHDCoinType = function(coinType, testNet) {
//    console.log("this._coinHDType :: " + this._coinHDType);
    if (testNet) {
        return this._coinHDType[coinType] + this._coinHDTypeTestnetOffset[coinType];
    } else {
        return this._coinHDType[coinType];
    }
}


HDWalletHelper.getFiatUnitPrefix = function (fiatUnit) {
    switch (fiatUnit) {
        case "AUD":
            return "AU$"; // Australian Dollar
        case "CAD":
            return "CA$"; // Canadian Dollar
        case "CLP":
            return "CL$"; // Chilean Peso
        case "HKD":
            return "HK$"; // Hong Kong Dollar
        case "NZD":
            return "NZ$"; // New Zealand Dollar
        case "SGD":
            return "SG$"; // Singapore Dollar
        case "MXN":
            return "MX$"; // Mexican Dollar
        case "NOK":
            return "kr"; // Norwegian Krona
        case "USD":
            return "$"; // United States Dollar
        case "BRL":
            return "R$"; // Brazilian Real
        case "CNY":
            return "\u5143"; // Chinese Yuan
        case "DKK":
            return "kr"; // Danish Krona
        case "EUR":
            return "\u20AC"; // Euro
        case "GBP":
            return "\u00A3" // Great British Pound
        case "INR":
            return "\u20B9"; // Indian Rupee
        case "ISK":
            return "kr"; // Icelandik Krona
        case "JPY":
            return "\u00A5"; // Japanese Yen
        case "KRW":
            return "\u20A9"; // South Korean Won
        case "PLN":
            return "z\u0142"; // Polish Zloty
        case "RUB":
            return "\u20BD"; // Russian Ruble
        case "SEK":
            return "kr"; // Swedish Krona
        case "TWD":
            return "NT$"; // New Taiwan Dollar
        case "FRA":
            return "\u20A3" // French Franc
    }

    return "XX$";
}


HDWalletHelper.getDefaultRegulatedTXFee = function(coinType) {
    //@note: @todo: get api service for recommended bitcoin fee.
    //https://api.blockcypher.com/v1/btc/main contains high low and average
    if (coinType === COIN_BITCOIN) {
        return 10000;
    } else if (coinType === COIN_ETHEREUM){
        return HDWalletHelper.getDefaultEthereumGasPrice();
    }
}

//@note: these functions return BigNumber instances.

HDWalletHelper.getDefaultEthereumGasPrice = function() {
    return thirdparty.web3.toWei(thirdparty.web3.toBigNumber('21'), 'shannon');
};

HDWalletHelper.getDefaultEthereumGasLimit = function() {
    return thirdparty.web3.toBigNumber(21000);
}

HDWalletHelper.prototype.getRecommendedEthereumCustomGasLimit = function() {
    return this._recommendedEthereumCustomGasLimit;
}

HDWalletHelper.prototype.setRecommendedEthereumCustomGasLimit = function(recommendedEthereumCustomGasLimit) {
    this._recommendedEthereumCustomGasLimit = thirdparty.web3.toBigNumber(recommendedEthereumCustomGasLimit);
}

HDWalletHelper.prototype.getCustomEthereumGasLimit = function() {
    return this._currentEthereumCustomGasLimit;
}

HDWalletHelper.prototype.setCustomEthereumGasLimit = function(customEthereumGasLimit) {
//    console.log("ethereum :: update custom gas limit :: " + customEthereumGasLimit);
    this._currentEthereumCustomGasLimit = thirdparty.web3.toBigNumber(customEthereumGasLimit);
}

HDWalletHelper.getDefaultTheDAOGasLimit = function() {
    return thirdparty.web3.toBigNumber(150000);
}


HDWalletHelper.prototype.compareToDustLimit = function(amount, unitType, compareToCustomGasLimit) {
    var compareAmount = amount;

    if (unitType === COIN_UNITLARGE) {
        compareAmount = HDWalletHelper.convertEtherToWei(amount);
    }

    var compareAmountA = thirdparty.web3.toBigNumber(compareAmount);

    var compareAmountB = HDWalletHelper.getDefaultEthereumGasLimit();

    compareAmountB = compareAmountB.mul((compareToCustomGasLimit) ? this.getCustomEthereumGasLimit() : HDWalletHelper.getDefaultEthereumGasLimit());

    if (compareAmountA.greaterThan(compareAmountB)) {
        return 1;
    } else if (compareAmountA.equals(compareAmountB)) {
        return 0;
    } else {
        return -1;
    }
}

HDWalletHelper.prototype.setup = function(updateExchangeRateTime) {
    this._updateExchangeRateTime = updateExchangeRateTime;
}

HDWalletHelper.prototype.initialize = function() {
    var self = this;

    console.log("[ HDWallet Helper Initialize ]");

    for (var i = 0; i < COIN_NUMCOINTYPES; i++) {
        this._exchangeRates[i] = {};
        this._exchangeRateListenerCallbacks[i] = [];

        this._loadExchangeRates();

//        console.log("_updateExchangeRateTime :: " + this._updateExchangeRateTime);
        setInterval(function(curCoinType) {
//            console.log("check :: " + curCoinType);
            self._updateExchangeRates(curCoinType);
        }, self._updateExchangeRateTime, i);

        self._updateExchangeRates(i);
    }
}

HDWalletHelper.prototype._updateExchangeRates = function(coinType) {
    var self = this;

    if (coinType === COIN_BITCOIN) {
        RequestSerializer.getJSON("https://api.bitcoinaverage.com/ticker/global/all", function (dataBTC) {
            if (!dataBTC || !dataBTC['USD'] || !dataBTC['USD'].last) {
                console.log('Failed to get exchange rates', dataBTC);
                return;
            }

            var usdRate = dataBTC['USD'].last;

            if (Object.keys(self._exchangeRates[COIN_BITCOIN]).length === 0 || self._exchangeRates[COIN_BITCOIN]['USD'] != usdRate) {
                self._exchangeRates[COIN_BITCOIN] = dataBTC;
//                console.log('New Exchange Rate (BTC): ' + usdRate);
            }

            self._saveExchangeRates();
            self._notifyExchangeRateListeners(COIN_BITCOIN);
        });
    } else if (coinType == COIN_ETHEREUM && Object.keys(this._exchangeRates[COIN_BITCOIN]).length > 0) {
        RequestSerializer.getJSON("https://poloniex.com/public?command=returnTicker", function (dataETH) {
            if (!dataETH || !dataETH['BTC_ETH'] || !dataETH['BTC_ETH'].last || !dataETH['BTC_DAO'] || !dataETH['BTC_DAO'].last) {
                console.log('Failed to get exchange rates for ETH', dataETH);
                return;
            }

            //@note: base the exchange rate on the bitcoin usd price, and the eth<->btc rate.

            var usdRate = self._exchangeRates[COIN_BITCOIN]['USD'];
            var btceth = dataETH['BTC_ETH'].last;
            var btcdao = dataETH['BTC_DAO'].last;
            var ethusd = (usdRate * btceth).toFixed(2);
            var daousd = (usdRate * btcdao).toFixed(2);

            var didUpdateRates = false;

            if (Object.keys(self._exchangeRates[COIN_ETHEREUM]).length === 0 || self._exchangeRates[COIN_ETHEREUM]['USD'] != ethusd) {
                didUpdateRates = true;
//                console.log('New Exchange Rate (ETH): ' + ethusd);

                for (var currency in self._exchangeRates[COIN_BITCOIN]) {
                    // skip loop if the property is from prototype
                    if (!self._exchangeRates[COIN_BITCOIN].hasOwnProperty(currency)) {
                        continue;
                    }

                    var tempRate = [];

                    tempRate['ask'] = (self._exchangeRates[COIN_BITCOIN][currency]['ask'] * btceth).toFixed(2);
                    tempRate['bid'] = (self._exchangeRates[COIN_BITCOIN][currency]['bid'] * btceth).toFixed(2);
                    tempRate['last'] = (self._exchangeRates[COIN_BITCOIN][currency]['last'] * btceth).toFixed(2);

                    self._exchangeRates[COIN_ETHEREUM][currency] = tempRate;
                }
            }

            if (Object.keys(self._exchangeRates[COIN_THEDAO_ETHEREUM]).length === 0 || self._exchangeRates[COIN_THEDAO_ETHEREUM]['USD'] != daousd) {
                didUpdateRates = true;
                //                console.log('New Exchange Rate (ETH): ' + ethusd);

                for (var currency in self._exchangeRates[COIN_BITCOIN]) {
                    // skip loop if the property is from prototype
                    if (!self._exchangeRates[COIN_BITCOIN].hasOwnProperty(currency)) {
                        continue;
                    }

                    var tempRate = [];

                    tempRate['ask'] = (self._exchangeRates[COIN_BITCOIN][currency]['ask'] * btcdao).toFixed(2);
                    tempRate['bid'] = (self._exchangeRates[COIN_BITCOIN][currency]['bid'] * btcdao).toFixed(2);
                    tempRate['last'] = (self._exchangeRates[COIN_BITCOIN][currency]['last'] * btcdao).toFixed(2);

                    self._exchangeRates[COIN_THEDAO_ETHEREUM][currency] = tempRate;
                }
            }

            if (didUpdateRates === true) {
                self._notifyExchangeRateListeners(COIN_ETHEREUM);
                self._notifyExchangeRateListeners(COIN_THEDAO_ETHEREUM);

                self._saveExchangeRates();
            }
        });
    }
}

HDWalletHelper.prototype._loadExchangeRates = function() {
    var exchangeRates = getStoredData("exchangeRates", false);

    if (typeof(exchangeRates) !== 'undefined' && exchangeRates !== null) {
        this._exchangeRates = JSON.parse(exchangeRates);
    }
}

HDWalletHelper.prototype._saveExchangeRates = function() {
    storeData("exchangeRates", JSON.stringify(this._exchangeRates), false);
}

HDWalletHelper.prototype._notifyExchangeRateListeners = function(coinType) {
    for (var i = 0; i < this._exchangeRateListenerCallbacks[coinType].length; i++) {
        this._exchangeRateListenerCallbacks[coinType][i](coinType);
    }
}

HDWalletHelper.prototype.addExchangeRateListener = function(coinType, callback) {
    this._exchangeRateListenerCallbacks[coinType].push(callback);
}

HDWalletHelper.prototype.removeExchangeRateListener = function(coinType, callback) {
    for (var i = this._exchangeRateListenerCallbacks[coinType].length - 1; i >= 0; i--) {
        if (this._exchangeRateListenerCallbacks[coinType][i] === callback) {
            this._exchangeRateListenerCallbacks[coinType].splice(i, 1);
        }
    }
}


HDWalletHelper.prototype.getFiatUnit = function() {
    var fiatUnit = getStoredData('fiat');
    if (HDWalletHelper.getFiatUnitPrefix(fiatUnit) === 'XX$') {
        fiatUnit = 'USD';
    }
    return fiatUnit;
}

HDWalletHelper.prototype.setFiatUnit = function(fiatUnit) {
    storeData('fiat', fiatUnit);
}

HDWalletHelper.prototype.getFiatUnitPrefix = function() {
    return HDWalletHelper.getFiatUnitPrefix(this.getFiatUnit());
}

HDWalletHelper.prototype.hasFiatExchangeRates = function(coinType, fiatUnit) {
//        console.log("< checking for fiat exchange rates >");
    if (this._exchangeRates[coinType][fiatUnit]) {
//            console.log("< has fiat exchange rates >");
        return true;
    }
    //    console.log("< no fiat exchange rates >");

    return false;
}



HDWalletHelper.convertBitcoinsToSatoshis = function (bitcoins) {
    if (typeof(bitcoins) === 'string') {
        bitcoins = bitcoins.replace(/,/g, '');
    }

    var value = (new thirdparty.Decimal("100000000")).times(new thirdparty.Decimal(bitcoins));
    if (!value.isInteger()) {
        throw new Error("Wrong decimal number");
    }

    // @TODO: Make sure this fits in 53 bits

    return value.toNumber()
}

/**
 *  Convert satoshis to a string representing bitcoins.
 */
HDWalletHelper.convertSatoshisToBitcoins = function(satoshis) {

    // Handle negative numbers
    var negative = '';
    if (satoshis < 0) {
        satoshis *= -1;
        negative = '-';
    }

    // prefix cents with place holder zeros
    var cents = '00000000' + (satoshis % 100000000)
    cents = cents.substring(cents.length - 8);

    // strip off excess zeros (keeping at least one)
    while (cents.charAt(cents.length - 1) === '0' && cents.length > 1) {
        cents = cents.substring(0, cents.length - 1);
    }

    // Round toward zero
    var whole = parseInt((satoshis / 100000000).toFixed(8));

    return negative + whole + '.' + cents;
}

/**
 *  Wei->Ether
 */

HDWalletHelper.convertWeiToEther = function(wei) {
    var balance = thirdparty.web3.fromWei(wei, 'ether');
    if (balance.indexOf('.') == -1) {
        balance += '.0';
    }

    return balance;
}


/**
 *  Ether->Wei
 */


HDWalletHelper.convertEtherToWei = function(ether) {
    var balance = thirdparty.web3.toWei(ether, 'ether');
    if (balance.indexOf('.') == -1) {
        balance += '.0';
    }

    return balance;
}


/**
 *  Fiat conversion
 *
 *  Fiat will always be assumed to be a string, so math operations should not
 *  be attempted on them.
 */

HDWalletHelper.prototype.convertSatoshisToFiat = function(satoshis, fiatUnit, noPrefix) {

    if (typeof(fiatUnit) === 'undefined' || fiatUnit === null) {
        fiatUnit = this.getFiatUnit();
    }

    var prefix = HDWalletHelper.getFiatUnitPrefix(fiatUnit);

    var rate = 0;
    if (this._exchangeRates[COIN_BITCOIN][fiatUnit]) {
        rate = this._exchangeRates[COIN_BITCOIN][fiatUnit].last;
    }

//    console.log("rate :: " + this._exchangeRates[COIN_BITCOIN][fiatUnit].last);

    var value = parseFloat(HDWalletHelper.convertSatoshisToBitcoins(satoshis)) * rate;

//    console.log("fiatUnit :: " + fiatUnit + " :: prefix :: " + prefix + " :: satoshis :: " + satoshis + " :: value :: " + value);

    if (noPrefix) {
        //        value = value.toFixed(2);
        //        console.log("returning :: " + value)
        return value;
    }

    if (window.Intl) {
        var formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: fiatUnit});
        //        console.log("value :: " + value + " :: formatter :: " + formatter);
        return formatter.format(value);
    }

    // @TOOD: format this nicely on iOS
    if (prefix === '$') {
        value = value.toFixed(2);
    }

    var commified = value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    //    console.log("commified :: " + commified + " :: noPrefix :: " + noPrefix);
    return (noPrefix ? '': prefix) + commified;
}

HDWalletHelper.prototype.convertFiatToSatoshis = function(fiatAmount, fiatUnit) {
    var rate = 0;

    if (typeof(fiatUnit) === 'undefined' || fiatUnit === null) {
        fiatUnit = this.getFiatUnit();
    }

    if (this._exchangeRates[COIN_BITCOIN][fiatUnit]) {
        rate = this._exchangeRates[COIN_BITCOIN][fiatUnit].last;
    }

    if (rate === 0) { return null; }

    // Amount is approximate anyways (since it is fiat exchange rate)
    return parseInt(100000000 * (fiatAmount / rate));
}

HDWalletHelper.prototype.convertWeiToFiat = function(wei, fiatUnit, noPrefix) {

    if (typeof(fiatUnit) === 'undefined' || fiatUnit === null) {
        fiatUnit = this.getFiatUnit();
    }

    var prefix = HDWalletHelper.getFiatUnitPrefix(fiatUnit);

    var rate = 0;
    if (this._exchangeRates[COIN_ETHEREUM][fiatUnit]) {
        rate = this._exchangeRates[COIN_ETHEREUM][fiatUnit].last;
    }

    var value = parseFloat(HDWalletHelper.convertWeiToEther(wei)) * rate;

    if (noPrefix) {
        return value;
    }

    if (window.Intl) {
        var formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: fiatUnit});
        return formatter.format(value);
    }

    // @TOOD: format this nicely on iOS
    if (prefix === '$') {
        value = value.toFixed(2);
    }

    var commified = value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return (noPrefix ? '': prefix) + commified;
}

HDWalletHelper.prototype.convertFiatToWei = function(fiatAmount, fiatUnit) {
    var rate = 0;

    if (typeof(fiatUnit) === 'undefined' || fiatUnit === null) {
        fiatUnit = this.getFiatUnit();
    }

    if (this._exchangeRates[COIN_ETHEREUM][fiatUnit]) {
        rate = this._exchangeRates[COIN_ETHEREUM][fiatUnit].last;
    }

    if (rate === 0) { return null; }

    // Amount is approximate anyways (since it is fiat exchange rate)

    var wei = HDWalletHelper.convertEtherToWei(fiatAmount / rate);

    return wei;
}

// Given an address or URI; identify coin type, address and optional amount.
HDWalletHelper.parseURI = function(uri) {
    if (!uri) { return null; }

    var result = {};

    var uriRemaining = uri;

    var comps = uriRemaining.split(':');
    switch (comps.length) {
        // secheme:[//]address[?query]
        case 2:
            result.coin = comps[0];
            uriRemaining = comps[1];
            if (uriRemaining.substring(0, 2) === '//') {
                urlRemaining = urlRemaining.substring(2);
            }
            break;

        // address[?query]
        case 1:
            if (uriRemaining.match(/^((0x)?[0-9a-fA-F]{40}|XE)/)) {
                result.coin = 'ether';
            } else if (uriRemaining.match(/^[13]/)) {
                result.coin = 'bitcoin';
            }
            uriRemaining = comps[0];
            break;

        default:
            return null;
    }

    // address[?query]
    comps = uriRemaining.split('?');
    result.address = comps[0];
    switch (comps.length) {
        case 2:
            uriRemaining = comps[1];
            break;
        case 1:
            uriRemaining = '';
            break;
        default:
            return null;
    }

    // Parse out the amount (add other tags in the future); duplicate values is a FATAL error
    comps = uriRemaining.split('&');
    for (var i = 0; i < comps.length; i++) {
        var kv = comps[i].split('=');
        if (kv.length === 2 && kv[0] === 'amount') {
            if (result.amount) {
                return null;
            } else {
                result.amount = kv[1];
            }
        }
    }

    // IBAN is the format for ethereum
    if (result.coin === 'iban') { result.coin = 'ether'; }
    //console.log(JSON.stringify(result));
    switch (result.coin) {
        case 'bitcoin':
            try {
                if (!thirdparty.bitcoin.address.fromBase58Check(result.address)) {
                    return null;
                }
            } catch (error) {
                return null;
            }
            break;
        case 'ether':
            if (result.address.match(/^0x[0-9a-fA-F]{40}$/)) {
                // Address is already prefxed hex

            } else if (result.address.match(/^[0-9a-fA-F]{40}$/)) {
                // Prefix the hex
                result.address = '0x' + result.address;

            } else if (result.address.substring(0, 2) === 'XE') {
                // ICAP address

                // Check the checksum
                var validICAP = false;
                thirdparty.iban.countries.XE = thirdparty.iban.countries.XE31;
                if (thirdparty.iban.isValid(result.address)) {
                    validICAP = true;
                } else {
                    thirdparty.iban.countries.XE = thirdparty.iban.countries.XE30;
                    if (thirdparty.iban.isValid(result.address)) {
                        validICAP = true;
                    }
                }

                if (!validICAP) { return null; }

                // Indirect encoded... Not supported yet (no namereg)
                if (result.address.substring(0, 7) === 'ETHXREG') {
                    return null;

                // Direct or Basic encoded (should be true because it is valid iban)
                } else if (result.address.match(/^[A-Za-z0-9]+$/)) {

                    // Decode the base36 encoded address (removing the XE and checksum)
                    var hexAddress = (new thirdparty.bigi(result.address.substring(4), 36)).toString(16);

                    // Something terrible happened...
                    if (hexAddress.length > 40) { return null; }

                    // zero-pad
                    while (hexAddress.length < 40) { hexAddress = '0' + hexAddress; }

                    // Prefix the address
                    result.address = '0x' + hexAddress;

                } else {
                    return null;
                }

            } else {
                return null;
            }
            break;
        default:
            return null;
    }

    return result;
}

/*

 // Run some simple tsts to make sure parsing the URI works.
var tests = [
             '1RicMooMWxqKczuRCa5D2dnJaUEn9ZJyn',
             'bitcoin:1RicMooMWxqKczuRCa5D2dnJaUEn9ZJyn',
             'bitcoin:1RicMooMWxqKczuRCa5D2dnJaUEn9ZJyn?amount=4.5',
             '1RicMooMWxqKczuRCa5D2dnJaUEn9ZJyn?amount=3.2',
             'XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W0',
             'iban:XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W0',
             'iban:XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W0?amount=7.8',
             'XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W0?amount=6.5',
             'iban:0x2d3976b32c17bd893f3c183e5dee872074475b80',
             '0x2d3976b32c17bd893f3c183e5dee872074475b80',

             '1RicMooMWxqKczuRCa5D2dnJaUEn9ZJy',
             'XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W',
             '0x2d3976b32c17bd893f3c183e5dee872074475b8',
             '1RicMooMWxqKczuRCa5D2dnJaUEn9ZJyn1',
             'XE235A6EOUWJWGG1NBXXJW2SXEB36T8J4W01',
             '0x2d3976b32c17bd893f3c183e5dee872074475b801',
];

setTimeout(function() {
    for (var i = 0; i < tests.length; i++) {
       try {
           console.log('BAR', tests[i], JSON.stringify(HDWalletHelper.parseURI(tests[i])));
        } catch(error) {
           console.log(error.message);
        }
    }
}, 1000);
*/


HDWalletHelper.hexify = function (value) {
    if (typeof(value) === 'number' || typeof(value) === 'string') {
        value = thirdparty.web3.toBigNumber(value);
    }

    var hex = value.toString(16);
    if (hex.length % 2) {
        hex = '0' + hex;
    }

    return new Buffer(hex, 'hex');
}

HDWalletHelper.zeroPadLeft = function(text, length) {
    while(text.length < length) {
        text = '0' + text;
    }
    return text;
}

//    //@note:@here:@todo: wondering if it's actually necessary to execute after load.
HDWalletHelper.reformatICAPAddresses = function() {
    // Convert ICAP addresses (IBAN/BBAN)
    // https://github.com/ethereum/wiki/wiki/ICAP:-Inter-exchange-Client-Address-Protocol
//    console.log("thirdparty.iban :: " + thirdparty.iban + " :: thirdparty.iban.countries.XE30 :: " + thirdparty.iban.countries.XE30.countryCode);
    // @TODO: File a PR to expose addSpecification; for now, hijack
    thirdparty.iban.countries.XE30 = thirdparty.iban.countries.UA;
//    console.log("thirdparty.iban :: " + thirdparty.iban + " :: thirdparty.iban.countries.UA :: " + thirdparty.iban.countries.UA);

    delete thirdparty.iban.countries.UA;
    thirdparty.iban.countries.XE30.countryCode = 'XE';
    thirdparty.iban.countries.XE30.length = 34;
    thirdparty.iban.countries.XE30.structure = 'B30';

    thirdparty.iban.countries.XE31 = thirdparty.iban.countries.BE;
    delete thirdparty.iban.countries.BE;
    thirdparty.iban.countries.XE31.countryCode = 'XE';
    thirdparty.iban.countries.XE31.length = 35;
    thirdparty.iban.countries.XE31.structure = 'B31';
}


HDWalletHelper.getICAPAddress = function(data, forceBasic) {
//    if (thirdparty.iban.countries.UA) {
//        HDWalletHelper.reformatICAPAddresses();
//    }

    thirdparty.iban.countries.XE = thirdparty.iban.countries.XE30;
    if (thirdparty.iban.isValid(data)) {
        return data;
    }

    thirdparty.iban.countries.XE = thirdparty.iban.countries.XE31;
    if (thirdparty.iban.isValid(data)) {
        return data;
    }

    //        console.log("data :: " + data);
    // Get the raw hex
    if (data.substring(0, 2) === '0x' && data.length === 42) {
        data = data.substring(2);
    }

    // Make sure it is a valid address
    if (!data.match(/^[0-9a-fA-F]{40}$/)) { return null; }

    // 0 prefixed can fit in 30 bytes (otherwise, we require 31)
    var length = 31;
    if (data.substring(0, 2) === '00' && !forceBasic) {
        data = data.substring(2);
        length = 30
        thirdparty.iban.countries.XE = thirdparty.iban.countries.XE30;
    } else {
        thirdparty.iban.countries.XE = thirdparty.iban.countries.XE31;
    }

    // Encode as base36 and add the checksum
    var encoded = (new thirdparty.bigi(data, 16)).toString(36).toUpperCase();
    encoded = HDWalletHelper.zeroPadLeft(encoded, length);

    return thirdparty.iban.fromBBAN('XE', encoded);
}

HDWalletHelper.parseEthereumAddress = function(data) {

    // Standard address, we're done
    if (data.match(/^0x[0-9a-fA-F]{40}$/)) {
        //            console.log("found matching address :: " + data);
        return data;
    } else if (data.match(/^(0x[0-9a-fA-F]{40})$/)) {
        //            console.log("found matching address :: " + data);
        return data;
    } else if (data.match(/^ether:(0x[0-9a-fA-F]{40})$/)) {
        //            console.log("found matching address :: " + data);
        return data.substring(6);
    }

    // ICAP...
    if (data.substring(0, 2) === 'XE') {

        // Check the checksum
        var validICAP = false;
        thirdparty.iban.countries.XE = thirdparty.iban.countries.XE31;
        if (thirdparty.iban.isValid(data)) {
            validICAP = true;
        } else {
            thirdparty.iban.countries.XE = thirdparty.iban.countries.XE30;
            if (thirdparty.iban.isValid(data)) {
                validICAP = true;
            }
        }

        if (validICAP) {
            var encoded = data.substring(4);

            // Direct or Basic encoded
            if (encoded.match(/^[A-Za-z0-9]+$/)) {

                // Decode the base36 encoded address
                var hexAddress = (new thirdparty.bigi(encoded, 36)).toString(16);

                // Something terrible happened...
                if (hexAddress.length > 40) { throw new Error("Badness; this shouldn't happen"); }

                // zero-pad
                hexAddress = HDWalletHelper.zeroPadLeft(hexAddress, 40);

                // prepend the prefix
                return '0x' + hexAddress;

                // Indirect encoded... Not supported yet (no namereg)
            } else if (encoded.substring(0, 7) === 'ETHXREG') {
                return null;
            }
        }
    }

    return null;
}

HDWalletHelper.getEthereumAddressFromKey = function(privateKey) {
    //Lets re-use the already imported library ethutil-tx to avoid adding burden
    //Create a fake tx
    var mockupTxRaw = {
        nonce: HDWalletHelper.hexify(1),
        gasPrice: HDWalletHelper.hexify(thirdparty.web3.toBigNumber(thirdparty.web3.toWei(50, 'shannon')).toDigits(1)),
        gasLimit: HDWalletHelper.hexify(HDWalletHelper.getDefaultEthereumGasLimit()),
        to: "0xbac369f138d479abd45340e7735f80617a008ee7",
        value: HDWalletHelper.hexify(1),
    };

    var mockupTxR = new thirdparty.ethereum.tx(mockupTxRaw);
    //Sign with the private key

    mockupTxR.sign(privateKey);

    var addr = mockupTxR.getSenderAddress().toString('hex');
    if(addr){
        return '0x'+addr;
    } else {
        return null;
    }
}

//@note: ethereum checksum addresses. using web3 experimental branch logic.
HDWalletHelper.toEthereumChecksumAddress = function (address) {
    if (typeof address === 'undefined') return '';

    address = address.toLowerCase().replace('0x','');
    var addressHash = web3.sha3(address);
    var checksumAddress = '0x';

    for (var i = 0; i < address.length; i++ ) {
        // If ith character is 9 to f then make it uppercase
        if (parseInt(addressHash[i], 16) > 7) {
            checksumAddress += address[i].toUpperCase();
        } else {
            checksumAddress += address[i];
        }
    }
    return checksumAddress;
}

HDWalletHelper.isEthereumChecksumAddress = function(address) {
    // Check each case
    address = address.replace('0x','');
    var addressHash = web3.sha3(address.toLowerCase());

    for (var i = 0; i < 40; i++ ) {
        // the nth letter should be uppercase if the nth digit of casemap is 1
        if ((parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) || (parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])) {
            return false;
        }
    }
    return true;
};

HDWalletHelper.prototype.hasCachedAddressAsContract = function(address) {
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

//Uses etherscan geth proxy, getcode method.
HDWalletHelper.prototype.checkIsSmartContractQuery = function(address, callback)
{
    if (this._ethAddressTypeMap[address]) {
        callback(null, this._ethAddressTypeMap[address]);
    }

    var self = this;

    var url = "https://api.etherscan.io/api?module=proxy&action=eth_getCode&address=" + address + "&tag=latest";

    RequestSerializer.getJSON(url, function (data) {
        if (!data) {
            var errStr = "failed to get address info from :: " + url + " :: " + data;
            callback(errStr, null);
        }

        //@note: contractCode here results in *only* "0x" if it's not a contract, and the full code if it is.
        var contractCode = data.result;
        if (contractCode === '0x') {
            self._ethAddressTypeMap[address] = false;
            callback(null, false);
        } else {
            self._ethAddressTypeMap[address] = true;
            callback(null, true);
        }
    });
}

HDWalletHelper.convertCoinToUnitType = function(coinType, coinAmount, coinUnitType) {
    var coinOtherUnitAmount = 0;

    if (coinType === COIN_BITCOIN) {
        coinOtherUnitAmount = (coinUnitType === COIN_UNITLARGE) ? HDWalletHelper.convertSatoshisToBitcoins(coinAmount) : HDWalletHelper.convertBitcoinsToSatoshis(coinAmount);
    } else if (coinType === COIN_ETHEREUM) {
        coinOtherUnitAmount = (coinUnitType === COIN_UNITLARGE) ? HDWalletHelper.convertWeiToEther(coinAmount) : HDWalletHelper.convertEtherToWei(coinAmount);
    }

    return coinOtherUnitAmount;
}

HDWalletHelper.getCoinDisplayScalar = function(coinType, coinAmount, isFiat) {
    var scaledAmount = coinAmount;

    if (typeof(isFiat) === 'undefined' || isFiat === null || isFiat !== true) {
        if (coinType === COIN_THEDAO_ETHEREUM) {
            var scalar = thirdparty.web3.toBigNumber(100);
            scaledAmount = thirdparty.web3.toBigNumber(coinAmount).mul(scalar).toNumber();
        }
    }

//    console.log("scaledAmount :: " + scaledAmount);

    return scaledAmount;
}

HDWalletHelper.toEthereumNakedAddress = function(address) {
    return address.toLowerCase().replace('0x', '');
}
