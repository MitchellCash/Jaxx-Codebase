// Make sure to include:
//  - js/thirdparty.js

// A mock-object to represent the Namecoin network (as far as we need)
/*
var NamecoinNetwork = {
    pubKeyHash: 52,
    bip32: {
        public: 0x03b8c856,
        private: 0x03b8c41c,
    },
}
*/

// @TODO: Move the exchange rate lookup out of instances and into a global/class stuff...
//        Right now multiple instances of a wallet will hit the exchange more.
//        Also, keep a "lastExcehngageRate" for notifying purposes


// @TODO: Handle dust properly - only necessary because blockchain.info remembers bad transactions through its pushtx
// https://github.com/bitcoin/bitcoin/blob/9fa54a1b0c1ae1b12c292d5cb3158c58c975eb24/src/primitives/transaction.h#L138

var w_gObj;

var HDWallet = function(mnemonic) {
    if (!thirdparty.bip39.validateMnemonic(mnemonic)) {
        return null;
    }

    if (getStoredData('fiat') === null) {
        storeData('fiat', 'USD');
    }

//    console.log("Creating new HD Wallet");
    //    console.profile("LaunchProfiling");

    this._mnemonic = mnemonic;
    w_gObj = this;

    var hashMnemonicKey = mnemonic + (TESTNET ? '-test': '-main');

    this._storageKey = thirdparty.bitcoin.crypto.sha256(hashMnemonicKey).toString('hex');

//    this._storageKey = CacheUtils.getCachedOrRun("hashMnemonicKey_" + hashMnemonicKey, function() {
//        return thirdparty.bitcoin.crypto.sha256(hashMnemonicKey).toString('hex');
//    });

//    console.log('Storage Key: ' + this._storageKey);

    this._log = [];
    this._logger = console;

    this._currentReceiveAddress = null;
    this._currentChangeAddress = null;

    this._seedHex = null;
    this._rootNode = null;
    this._accountNode = null;
    this._receiveNode = null;
    this._changeNode = null;

    this._onenameAddress = null;
    this._onenamePrivateKey = null;

    this._privateKeyCache = {};

    this._spendable = null;

    //this._namecoinNode = null;

    // These track where we are in handing out child addresses; they get updated
    // whenever a new transaction comes in or when an address is requested.
    //this._currentReceiveIndex = -1;
    this._currentChangeIndex = 0;

    // Every transaction an address in our wallet was involved in
    this._transactions = {};
    var transactionCache = getStoredData('transactionCache-' + this._storageKey);
    if (transactionCache) {
        try {
            this._transactions = JSON.parse(transactionCache);
        } catch (e) {
            console.log(e);
        }
    }

    this._listeners = [];

    this._transactionFee = 10000;

    this._smallQrCode = null;
    this._largeQrCode = null;

    var self = this;

    // Background thread to run heavy HD algorithms and keep the state up to date
    try {
        this._worker = new Worker('./js/wallet/wallet-worker.js');

        var self = this;
        this._worker.onmessage = function(message) {
            var action = message.data.action;

            // Log to our logger
            if (action === 'log') {
                self.log.apply(self, message.data.content);

                // Set transaction, utxo, etc.
            } else if (action === 'update') {

                if (message.data.content.transactions) {
                    var transactions = message.data.content.transactions;
                    for (var txid in transactions) {
                        var transaction = transactions[txid];

                        // We need to convert all the amounts from BTC to satoshis (cannot do this inside the worker easily)
                        for (var i = 0; i < transaction.inputs.length; i++) {
                            var input = transaction.inputs[i];
                            input.amount = HDWallet.convertBitcoinsToSatoshis(input.amountBtc);
                        }
                        for (var i = 0; i < transaction.outputs.length; i++) {
                            var output = transaction.outputs[i];
                            output.amount = HDWallet.convertBitcoinsToSatoshis(output.amountBtc);
                        }

                        self._transactions[txid] = transaction;
                        self._spendable = null;
                    }

                    storeData('transactionCache-' + self._storageKey, JSON.stringify(self._transactions));
                }

                if (message.data.content.currentReceiveAddress) {
                    self._currentReceiveAddress = message.data.content.currentReceiveAddress;
                    storeData('currentReceiveAddress-' + self._storageKey, self._currentReceiveAddress);
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

                if (message.data.content.workerCache) {
                    storeData('workerCache-' + self._storageKey, JSON.stringify(message.data.content.workerCache));
                }

                self._notify();
            }
        }
    } catch (err) {
        console.error(err);
    }

    this._load();

    if (this._worker) {
        var workerCache = getStoredData('workerCache-' + this._storageKey); // @TODO: don't use entropy for this
        if (workerCache) {
            try {
                workerCache = JSON.parse(workerCache);
                this._worker.postMessage({
                    action: 'restoreCache',
                    content: {
                        workerCache: workerCache
                    }
                });
            } catch (e) {
                this.log('Invalid cache:', workerCache);
            }
        }

        this._worker.postMessage({
            action: 'setExtendedPublicKeys',
            content: {
                change: this._changeNode.neutered().toBase58(),
                receive: this._receiveNode.neutered().toBase58()
            }
        });
    }

    this._updateExchangeRates();
    setInterval(function() { self._updateExchangeRates(); }, 60000);
    //    console.profileEnd();
}

HDWallet.TESTNET = TESTNET;

HDWallet.getFiatUnitPrefix = function (fiatUnit) {
    switch (fiatUnit) {
        case "AUD":
        case "CAD":
        case "CLP":
        case "HKD":
        case "NZD":
        case "SGD":
        case "USD":
            return "$";
        case "BRL":
            return "R$";
        case "CNY":
            return "\u5143";
        case "DKK":
            return "kr";
        case "EUR":
            return "\u20AC";
        case "GBP":
            return "Â£"
            case "INR":
            return "";
        case "ISK":
            return "kr";
        case "JPY":
            return "\u00A5"
            case "KRW":
            return "\u20A9";
        case "PLN":
            return "z\u0142";
        case "RUB":
            return "\u20BD";
        case "SEK":
            return "kr";
        case "TWD":
            return "NT$";
    }

    return "XX$";
}

HDWallet.parseBitcoinAddress = function(address) {
    if (address.substring(0, 10) === 'bitcoin://') {
        address = address.substring(10);
    } else if (address.substring(0, 8) === 'bitcoin:') {
        address = address.substring(8);
    }

    return address;
}

HDWallet.parseBitcoinURI = function(uri) {
    if (uri.substring(0, 10) === 'bitcoin://') {
        uri = uri.substring(10);
    } else if (uri.substring(0, 8) === 'bitcoin:') {
        uri = uri.substring(8);
    }

        console.log("< parsing :: " + uri + " >");

    var comps = uri.split('?');

    var result = {address: comps[0]};
    if (getAddressCoinType(result.address) != COIN_BITCOIN) {
                console.log("<address invalid :: " + result.address + ">")
        return null;
    } else {
                console.log("<address valid :: " + result.address + ">")
    }

    if (comps.length > 1) {
        var query = comps.slice(1).join('?');
        comps = query.split('&');
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
    }

    return result;
}

HDWallet._derive = function(node, index, hardened) {
    /*
    @TODO: Instead try:
      Wallet._getAddress(path)
      Wallet._getPrivateKey(path)
    if (window.native && window.native.deriveChildKey) {
        var fromHex = function(hexString) {
            var result = [];
            for (var i = 0; i < hexString.length; i += 2) {
                result.push(parseInt(hexString(i, i + 2), 16));
            }
            return result;
        }
        var child = window.native.deriveChildKey(node.toString(), index, hardened, HDWallet.TESTNET);
        var chainCode = fromHex(child.chainCode);
        console.log(chainCode);
        console.log("AA" + (new Date()).getTime() + ' ' + JSON.stringify(child));
        var node = thirdparty.bitcoin.HDNode.fromBase58(child.serialized, NETWORK);
        console.log("BB" + (new Date()).getTime() + ' ' + node);
        return node;
    }
    */

    if (hardened) {
        return node.deriveHardened(index)
    }

    return node.derive(index);
}

/*
HDWallet.fromPasscode = function() {
    // @TODO: Why does this have quotes around it?!
    var passcode = getStoredData('passcode');
    if (!passcode) {
        return null;
    }
    passcode = passcode.replace(/"/g, '');

    // If something bad happens, make sure we don't make a bad wallet
    if (passcode.length != 30) {
        throw new Error('Invalid wallet seed.');
    }

    return (new HDWallet(thirdparty.bitcoin.crypto.sha256(passcode)));
}
*/

/**
 *  Create a new wallet instance from a mnemonic phrase
 */
/*
HDWallet.fromMnemonic = function(mnemonic) {
    if (!thirdparty.bip39.validateMnemonic(mnemonic)) {
        return null;
    }
    return new HDWallet(thirdparty.bip39.mnemonicToEntropy(mnemonic));
}
*/
/**
 *  Convert a string representing bitcoins to satoshis.
 */
HDWallet.convertBitcoinsToSatoshis = function (bitcoins) {
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
HDWallet.convertSatoshisToBitcoins = function(satoshis) {

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

HDWallet._exchangeRates = {};


HDWallet.hasFiatExchangeRates = function(fiatUnit) {
    //    console.log("< checking for fiat exchange rates >");
    if (HDWallet._exchangeRates[fiatUnit]) {
        //    console.log("< has fiat exchange rates >");
        return true;
    }
    //    console.log("< no fiat exchange rates >");

    return false;
}

HDWallet.convertSatoshisToFiat = function(satoshis, fiatUnit, noPrefix) {

    var prefix = HDWallet.getFiatUnitPrefix(fiatUnit);

    var rate = 0;
    if (HDWallet._exchangeRates[fiatUnit]) {
        rate = HDWallet._exchangeRates[fiatUnit].last;
    }

    var value = parseFloat(HDWallet.convertSatoshisToBitcoins(satoshis)) * rate;

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

HDWallet.convertFiatToSatoshis = function(fiatAmount, fiatUnit) {
    var rate = 0;
    if (HDWallet._exchangeRates[fiatUnit]) {
        rate = HDWallet._exchangeRates[fiatUnit].last;
    }

    if (rate === 0) { return null; }

    // Amount is approximate anyways (since it is fiat exchange rate)
    return parseInt(100000000 * (fiatAmount / rate));
}



HDWallet.prototype.getPrivateKeys =  function() {
    var result = [];
    var pairList = this.getKeypairsList();
    for (var i = 0; i < pairList.length; i++) {
        result.push(pairList[i][0])
    }
    return $.unique(result);
}

HDWallet.prototype.getUsedAddresses =  function() {
    var result = [];
    var pairList = this.getKeypairsList();
    for (var i = 0; i < pairList.length; i++) {
        result.push(pairList[i][1])
    }
    return $.unique(result);
}

//Returns a multidimensional array with pairs public/private key
HDWallet.prototype.getKeypairsList = function(){
    var result = [];

    var transactions = this.getTransactions(); //Get all transactions

    for (var ti = 0; ti < transactions.length; ti++) { //iterate through txs
        var transaction = transactions[ti];

        //First we need to determine if this is an incoming tx. let see balance
        var deltaBalance = 0;

        //Iterate on Inputs
        for (var i = 0; i < transaction.inputs.length; i++) {
            var input = transaction.inputs[i];
            // Our address, money sent (input values are always negative)
            if (input.addressIndex !== null) {
                deltaBalance += input.amount;
            }
        }

        for (var i = 0; i < transaction.outputs.length; i++) {
            var output = transaction.outputs[i];
            if (output.addressIndex !== null) {
                deltaBalance += output.amount;
            }
        }

        if(deltaBalance > 0 ) { //incoming tx
             for (var i = 0; i < transaction.outputs.length; i++) {
                var output = transaction.outputs[i];
                if (output.addressIndex != null){ //search outputs to our addresses
                    var tempPair = [];
                    tempPair[0] = this._privateKey(output.addressInternal, output.addressIndex).toWIF();
                    tempPair[1] = output.address;
                    result.push(tempPair);
                 }
            }
        }

    }

    return result;
}


// Populates all the expensive to compute parts of the wallet
HDWallet.prototype._load = function() {
    if (this._rootNode) { return; }

    //@note: @todo: @next: optimization easy win.
//    var seedHex = thirdparty.bip39.mnemonicToSeedHex(w_gObj._mnemonic);

    //@note: very useful.. 300ms off of cached run (2100 compared to 1800)
    var seedHex = CacheUtils.getCachedOrRun("wSh_" + w_gObj._storageKey, function() {
        var seedHex = thirdparty.bip39.mnemonicToSeedHex(w_gObj._mnemonic);
        return seedHex;
    });

    this._seedHex = seedHex;

//    this.buildNodes(COIN_BITCOIN);
//    this.buildNodes(COIN_ETHEREUM);

    //    this._rootNode = thirdparty.bitcoin.HDNode.fromSeedHex(seedHex, NETWORK);
    //@note: and another 50ms
    var rootNodeBase58 = CacheUtils.getCachedOrRun("wRTn_" + w_gObj._storageKey, function() {
        var rootNodeBase58 = thirdparty.bitcoin.HDNode.fromSeedHex(w_gObj._seedHex, NETWORK).toBase58();
        return rootNodeBase58;
    });

    var rootNode = thirdparty.bitcoin.HDNode.fromBase58(rootNodeBase58, NETWORK);

    this._rootNode = rootNode;

//    var thisWontWork = this.dontDoThis();
//    var otherPart = thisWontWork.runFunction(nope);

//    var accountNodeBase = HDWallet._derive(HDWallet._derive(HDWallet._derive(this._rootNode, 44, true), 0, true), 0, true);
    //@note: and another 100ms
    var accountNodeBase58 = CacheUtils.getCachedOrRun("wAn_" + w_gObj._storageKey, function() {
        var accountNodeBase58 = HDWallet._derive(HDWallet._derive(HDWallet._derive(w_gObj._rootNode, 44, true), 0, true), 0, true).toBase58();
        return accountNodeBase58;
    });

    var accountNode = thirdparty.bitcoin.HDNode.fromBase58(accountNodeBase58, NETWORK);
    this._accountNode = accountNode;

    // The external and internal HD nodes

    //    this._receiveNode = HDWallet._derive(accountNode, 0, false);
    var receiveNodeBase58 = CacheUtils.getCachedOrRun("wRn_" + w_gObj._storageKey, function() {
        var receiveNodeBase58 = HDWallet._derive(w_gObj._accountNode, 0, false).toBase58();
        return receiveNodeBase58;
    });

    var receiveNode = thirdparty.bitcoin.HDNode.fromBase58(receiveNodeBase58, NETWORK);
    this._receiveNode = receiveNode;

    //    this._changeNode = HDWallet._derive(accountNode, 1, false);
    var changeNodeBase58 = CacheUtils.getCachedOrRun("wCn_" + w_gObj._storageKey, function() {
        var changeNodeBase58 = HDWallet._derive(w_gObj._accountNode, 1, false).toBase58();
        return changeNodeBase58;
    });

    var changeNode = thirdparty.bitcoin.HDNode.fromBase58(changeNodeBase58, NETWORK);
    this._changeNode = changeNode;


    // Try to load a cached version of our address first, if possible
    var currentReceiveAddress = getStoredData('currentReceiveAddress-' + this._storageKey);
    if (!currentReceiveAddress) {
        currentReceiveAddress = HDWallet._derive(this._receiveNode, 0, false).getAddress().toString();
    }

    this._currentReceiveAddress = currentReceiveAddress;

//    this.checkAddress();

    //@note: @todo: @next: @optimization: pretty sure that this could be cached as it is generated.

    //this._currentChangeAddress = this._changeNode.derive(0).getAddress().toString();
    this._currentChangeAddress = HDWallet._derive(this._changeNode, 0, false).getAddress().toString();
    //HDWallet._derive(this._rootNode, 2, true);
}

HDWallet.prototype.getBitcoinAddress = function(node) {
    var pubKey = node.keyPair.getPublicKeyBuffer();

    var pubKeyHash = thirdparty.bitcoin.crypto.hash160(pubKey);

    var payload = new Buffer(21);
    payload.writeUInt8(node.keyPair.network.pubKeyHash, 0);
    pubKeyHash.copy(payload, 1);

    var address = thirdparty.bs58check.encode(payload);

    console.log("[bitcoin]Â address :: " + address);
    return address;
}

HDWallet.prototype.getEthereumAddress = function(node) {
    var ethKeyPair = node.keyPair;

    //@note: @here: hack to get the Q to regenerate on the next 'get', triggered by getPublicKeyBuffer.
    ethKeyPair.__Q = null;
    ethKeyPair.compressed = false;

    var ethKeyPairPublicKey = ethKeyPair.getPublicKeyBuffer();

    var pubKeyHexEth = ethKeyPairPublicKey.toString('hex').slice(2);

    var pubKeyWordArrayEth = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHexEth);

    var hashEth = thirdparty.CryptoJS.SHA3(pubKeyWordArrayEth, { outputLength: 256 });

    var addressEth = hashEth.toString(thirdparty.CryptoJS.enc.Hex).slice(24);

    console.log("[ethereum]Â address :: " + addressEth);
    return addressEth;
}

HDWallet.prototype.checkAddress = function() {

    var checkNode = HDWallet._derive(this._receiveNode, 0, false);

    console.log("private key :: " + checkNode.keyPair.toWIF() + " :: " + this._privateKey(false, 0).toWIF());

    var keyPair = checkNode.keyPair;//this._privateKey(false, 0);

    var keyPairB = thirdparty.bitcoin.ECPair.fromWIF("KxxUwg3CwN8YjpnV8TzFRHmwrzP2vbkD9TymbdFM8EQnzpnRHDra", keyPair.network);

    console.log("WIFCheck :: " + (keyPair.getPublicKeyBuffer().toString('hex') == keyPairB.getPublicKeyBuffer().toString('hex')));

//    console.log("CryptoJS :: " + thirdparty.CryptoJS.enc.Hex.parse);
    console.log("PRE :: keyPair.compressed :: " + keyPair.compressed);

    //@note: @todo: @next:
    //using the keypair, get the public key buffer.
    //then, run that through the ethereum sha3 methodology.

    var pubKey = keyPair.getPublicKeyBuffer();
    var privateKey = keyPair.d.toBuffer(32);

    console.log("A :: pubKey :: " + pubKey + " :: " + pubKey.toString('hex'));
    console.log("privateKey :: " + privateKey + " :: " + privateKey.toString('hex'));

    var pubKeyHash = thirdparty.bitcoin.crypto.hash160(pubKey);

    console.log("A2 :: pubKeyHash :: " + pubKeyHash + " :: " + pubKeyHash.length);

    var payload = new Buffer(21);
    payload.writeUInt8(keyPair.network.pubKeyHash, 0);
    pubKeyHash.copy(payload, 1);

    console.log("A3 :: pubKeyHash :: " + pubKeyHash + " :: " + pubKeyHash.length);

    console.log("thirdparty.bitcoin.base58 :: " + thirdparty.bs58check);

    var address = thirdparty.bs58check.encode(payload);

    console.log("A4 :: address :: " + address + " :: " + checkNode.keyPair.getAddress());


    //@note: this looks fine, the fromWIF with a bitcoin private key does relate to the proper output public address.



//    console.log("A2 :: .network.pubKeyHash :: " + keyPair.network.pubKeyHash)
//    var pubKeyHex = pubKey.toString('hex');

//    console.log("thirdparty.elliptic :: " + thirdparty.elliptic);
//    console.log("thirdparty.elliptic.ec :: " + thirdparty.elliptic.ec);

    var secp256k1Curve = new thirdparty.elliptic.ec('secp256k1');

//    console.log("secp256k1Curve :: " + secp256k1Curve.genKeyPair);

    var kp = secp256k1Curve.genKeyPair();

    console.log("kp :: " + kp);

    kp._importPrivate("1dd2359ba67c76414c22b068a131caba6fe4f85a918f93a263cfd4a59f7e0f77", 'hex');

    var compact = false;

    var pubKeyHex = kp.getPublic(compact, 'hex').slice(2);
    console.log("A :: pubKeyHex :: " + pubKeyHex);

    var pubKeyWordArray = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHex);
    console.log("B :: pubKeyWordArray :: " + pubKeyWordArray);

    var hash = thirdparty.CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
    console.log("C :: hash :: " + hash);

    var address = hash.toString(thirdparty.CryptoJS.enc.Hex).slice(24);
    console.log("D :: address :: " + address);

    //@note: this looks fine, the importprivate with an ethereum private key does relate to the proper output public address.



    kp = secp256k1Curve.genKeyPair();

//    var b58res = thirdparty.bs58check.decode("KxxUwg3CwN8YjpnV8TzFRHmwrzP2vbkD9TymbdFM8EQnzpnRHDra");

//    console.log("b58res :: " + b58res.toString('hex'));

//    kp._importPrivate(b58res.toString('hex'), 'hex');
    kp._importPrivate(privateKey.toString('hex'), 'hex');

    compact = true;
    pubKeyHex = kp.getPublic(compact, 'hex');//.slice(2);

    console.log("R :: " + pubKeyHex + " :: " + pubKey.toString('hex'));


    //@note: okay, so this works.


    var ethRootNode = HDWallet._derive(HDWallet._derive(HDWallet._derive(w_gObj._rootNode, 44, true), 60, true), 0, true);

    var ethAccountNode = HDWallet._derive(ethRootNode, 0, false);

    var ethKeyPair = ethAccountNode.keyPair;

    //@note: @here: hack to get the Q to regenerate on the next 'get', triggered by getPublicKeyBuffer.
    ethKeyPair.__Q = null;
    ethKeyPair.compressed = false;

    var ethKeyPairPublicKey = ethKeyPair.getPublicKeyBuffer();

    console.log("ethKeyPairPublicKey :: " + ethKeyPairPublicKey + " :: " + ethKeyPairPublicKey.toString('hex').slice(2));


    var pubKeyHexEth = ethKeyPairPublicKey.toString('hex').slice(2);
    console.log("M :: pubKeyHexEth :: " + pubKeyHexEth);

    var pubKeyWordArrayEth = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHexEth);
    console.log("N :: pubKeyWordArrayEth :: " + pubKeyWordArrayEth);

    var hashEth = thirdparty.CryptoJS.SHA3(pubKeyWordArrayEth, { outputLength: 256 });
    console.log("O :: hashEth :: " + hashEth);

    var addressEth = hashEth.toString(thirdparty.CryptoJS.enc.Hex).slice(24);
    console.log("P :: addressEth :: " + addressEth + " :: " + address);

    console.log("proper conversion :: " + (addressEth === address) );




    var gatheredBitcoinAddress = this.getBitcoinAddress(checkNode);
    var gatheredEthereumAddress = this.getEthereumAddress(ethAccountNode);


//    var bigNumC = thirdparty.BigInteger.fromBuffer(
//    var keyPairC = thirdparty.bitcoin.ECPair(keyPair.network





//    pubKeyWordArray = thirdparty.CryptoJS.enc.Hex.parse(pubKeyHex);
//    console.log("B :: pubKeyWordArray :: " + pubKeyWordArray);
//    hash = thirdparty.CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
//    console.log("C :: hash :: " + hash);
//    address = hash.toString(thirdparty.CryptoJS.enc.Hex).slice(24);
//    console.log("D :: address :: " + address);

    console.log("" + this.totally.wont.exist)

    //https://github.com/ConsenSys/eth-lightwallet/blob/master/lib/keystore.js
//    KeyStore._computeAddressFromPrivKey = function (privKey) {
//        var keyPair = ec.genKeyPair();
//        keyPair._importPrivate(privKey, 'hex');
//        var compact = false;
//        var pubKey = keyPair.getPublic(compact, 'hex').slice(2);
//        var pubKeyWordArray = CryptoJS.enc.Hex.parse(pubKey);
//        var hash = CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
//        var address = hash.toString(CryptoJS.enc.Hex).slice(24);
//
//        return address;
//    };

    //https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/src/ecpair.js

//    ECPair.prototype.getAddress = function () {
//        var pubKey = this.getPublicKeyBuffer()
//        var pubKeyHash = bcrypto.hash160(pubKey)
//
//        var payload = new Buffer(21)
//        payload.writeUInt8(this.network.pubKeyHash, 0)
//        pubKeyHash.copy(payload, 1)
//
//        return bs58check.encode(payload)
//    }
}

HDWallet.prototype.purgeCache = function() {
    removeStoredData('transactionCache-' + this._storageKey);
}

HDWallet.prototype.getLastBackupDate = function() {
    var lastBackupTimestamp = getStoredData('lastBackupTimestamp-' + this._storageKey);
    if (lastBackupTimestamp) {
        return moment(parseInt(lastBackupTimestamp)).format("MMM/D/YYYY");
    }
    return "never";
}

HDWallet.prototype.confirmBackup = function() {
    storeData('lastBackupTimestamp-' + this._storageKey, (new Date()).getTime());
}

HDWallet.prototype.refresh = function () {
    if (this._worker) {
        this._worker.postMessage({
            action: 'refresh',
            content: { }
        });
    }
}

HDWallet.prototype.getQrCode = function (large) {

    if (large) {
        if (!this._largeQrCode) {
//            this.log('Blocked to generate QR big Code');
            this._largeQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this.currentReceiveAddress(), {type: "png", ec_level: "H", size: 7, margin: 1}).toString('base64');
        }

        return this._largeQrCode;
    }

    if (!this._smallQrCode) {
//        this.log('Blocked to generate QR small Code');
        this._smallQrCode =  "data:image/png;base64," + thirdparty.qrImage.imageSync("bitcoin:" + this.currentReceiveAddress(), {type: "png", ec_level: "H", size: 5, margin: 1}).toString('base64');
    }

    return this._smallQrCode;
}

/**
 *  Fiat conversion
 *
 *  Fiat will always be assumed to be a string, so math operations should not
 *  be attempted on them.
 */

HDWallet.prototype.getFiatUnit = function() {
    var fiatUnit = getStoredData('fiat');
    if (HDWallet.getFiatUnitPrefix(fiatUnit) === 'XX$') {
        fiatUnit = 'USD';
    }
    return fiatUnit;
}

HDWallet.prototype.setFiatUnit = function(fiatUnit) {
    storeData('fiat', fiatUnit);
}

HDWallet.prototype.getFiatUnitPrefix = function() {
    return HDWallet.getFiatUnitPrefix(this.getFiatUnit());
}

HDWallet.prototype.hasFiatExchangeRates = function(fiatUnit) {
    return HDWallet.hasFiatExchangeRates(fiatUnit);
}

HDWallet.prototype.convertSatoshisToFiat = function(satoshis, noPrefix) {
    return HDWallet.convertSatoshisToFiat(satoshis, this.getFiatUnit(), noPrefix);
}

HDWallet.prototype.convertFiatToSatoshis = function(fiatAmount) {
    return HDWallet.convertFiatToSatoshis(fiatAmount, this.getFiatUnit());
}


HDWallet.prototype.getTransactionFee = function() {
    return this._transactionFee;
}


HDWallet.prototype.getMnemonic = function() {
    return this._mnemonic;
}


/**
 *  Get the next external address, and reserve it for the lifetime of this
 *  instance.
 */
HDWallet.prototype.currentReceiveAddress = function() {
    this._load();

    return this._currentReceiveAddress;
}

HDWallet.prototype._privateKey = function(internal, index) {
    this._load();

    if (index < 0 || internal < 0) {
        throw new Error('Invalid private key');
    }

    var key = index + '-' + internal;
    var privateKey = this._privateKeyCache[key];

    if (!privateKey) {
        if (internal) {
            privateKey = HDWallet._derive(this._changeNode, index, false).keyPair;
        } else {
            privateKey = HDWallet._derive(this._receiveNode, index, false).keyPair;
        }
        this._privateKeyCache[key] = privateKey;
    }

    return privateKey;
}

HDWallet.prototype._buildTransaction = function(address, satoshis, transactionFee, doNotSign) {
    this._load();

    // Get all UTXOs, biggest to smallest)
    var unspent = this._getUnspentOutputs();
    unspent.sort(function (a, b) {
        return (a.amount - b.amount);
    });

    // @TODO: Build a better change picking algorithm; for now we select the largest first

    // Find a set of UTXOs that can afford the output amount
    var toSpend = [];
    var toSpendTotal = 0;
    while (toSpendTotal < satoshis + transactionFee) {
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
        return thirdparty.bitcoin.address.toOutputScript(address, NETWORK);
    }


    // Send the target their funds
    var outputs = [
        {
            address: address,
            amount: satoshis,
            addressIndex: null,
            addressInternal: null,

            // Keys for bip69 to sort on
            value: satoshis,
            script: addressToScript(address),
        }
    ];

    // Send the change back to us
    var change = toSpendTotal - satoshis - transactionFee;
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

    if (doNotSign) {
        return tx.buildIncomplete();
    }

    // Sign the transaction
    for (var i = 0; i < toSpend.length; i++) {
        var utxo = toSpend[i];
        tx.sign(i, this._privateKey(utxo.addressInternal, utxo.addressIndex));
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

    return transaction;
}

HDWallet.prototype.buildTransaction = function(address, satoshis, doNotSign) {
    var transactionFee = this._transactionFee;
    var tx = null;
    while (true) {
        tx = this._buildTransaction(address, satoshis, transactionFee, true);

        // Insufficient funds
        if (tx == null) {
            return null;
        }

        // How big is the transaction and what fee do we need? (we didn't sign so fill in 107 bytes for signatures)
        var size = tx.toHex().length / 2 + tx.ins.length * 107;
        var targetTransactionFee = Math.ceil(size / 1024) * this._transactionFee;

        // We have enough tx fee (sign it)
        if (targetTransactionFee <= transactionFee) {
            if (!doNotSign) {
                tx = this._buildTransaction(address, satoshis, transactionFee);
            }
            break;
        }

        // Add at least enough tx fee to cover our size thus far (adding tx may increase fee)
        while (targetTransactionFee > transactionFee) {
            transactionFee += this._transactionFee;
        }
    }

    tx._kkTransactionFee = transactionFee;
    tx.getTransactionFee = function() { return this._kkTransactionFee; }

    return tx;
}

HDWallet.prototype.sendTransaction = function(transaction, callback) {

    var mockTx = transaction._kkMockTx;
    var txid = mockTx.txid;

    this.log('Sending Transaction:', txid, transaction, transaction.toHex(), mockTx);

    if (this._transactions[txid]) {
        throw new Error('What?!'); //TODO ask richard what is this
    }

    this._transactions[txid] = mockTx;
    this._spendable = null;

    this._notify();

    // Post the transaction
    var self = this;
    $.ajax(BASE_URL +'/api/v1/tx/push', {
        complete: function(ajaxRequest, status) {
            if (status === 'success') {
                self._transactions[txid].status = 'success';
                self._notify();
            } else if (self._transactions[txid].status !== 'success') {
                //self._transactions[txid].status = 'failed';
                delete self._transactions[txid];
                self._notify();
            }

            self.log(ajaxRequest, status);
            if (callback) {
                callback(status, transaction);
            }
        },
        contentType: 'application/x-www-form-urlencoded',
        data: ('{"hex": "' + transaction.toHex() + '"}'),
        type: 'POST'
    });
}


/**
 *  Get all transactions for this wallet, sorted by date, earliest to latest.
 */
HDWallet.prototype.getTransactions = function() {
    var result = [];
    for (var key in this._transactions) {
        result.push(this._transactions[key]);
    }

    result.sort(function (a, b) {
        var deltaConf = (a.confirmations - b.confirmations);
        if (deltaConf) { return deltaConf; }
        return (b.timestamp - a.timestamp);
    });

    return result;
}

HDWallet.prototype.getHistory = function() {
    var transactions = this.getTransactions();

    var history = [];
    for (var ti = 0; ti < transactions.length; ti++) {
        var transaction = transactions[ti];

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
    }

    return history;
}

HDWallet.prototype._getUnspentOutputs = function() {
    var unspent = {};

    // Sigh... We don't get the transaction index (within a block), so we can't strictly order them

    var transactions = this.getTransactions();

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

    // Convert to an array of outputs
    var result = [];
    for (var utxoKey in unspent) {
        result.push(unspent[utxoKey]);
    }

    return result;
}



/**
 *  Get the current balance of all unspent transactions for this wallet.
 */
HDWallet.prototype.getBalance = function() {
    var balance = 0;

    var unspent = this._getUnspentOutputs();
    for (var i = 0; i < unspent.length; i++) {
        balance += unspent[i].amount;
    }

    return balance;
}

HDWallet.prototype.getSpendableBalance = function() {
    if (this._spendable !== null) {
        return this._spendable;
    }

    var spendable = this.getBalance();
    var address = this.currentReceiveAddress();
    while (spendable > 0) {
        var transaction = this.buildTransaction(address, spendable, true);
        if (transaction) { break; }
        spendable -= this.getTransactionFee();
    }
    if (spendable < 0) {
        spendable = 0;
    }

    this._spendable = spendable;

    return spendable;
}


HDWallet.prototype._updateExchangeRates = function() {
    var self = this;

    RequestSerializer.getJSON("https://api.bitcoinaverage.com/ticker/global/all", function (dataBTC) {
        if (!dataBTC || !dataBTC['USD'] || !dataBTC['USD'].last) {
            console.log('Failed to get exchange rates', dataBTC);
            return;
        }
        var usdRate = dataBTC['USD'].last;
        if (!HDWallet._exchangeRates || HDWallet._exchangeRates['USD'] != usdRate) {
            HDWallet._exchangeRates = dataBTC;
            self.log('New Exchange Rate (BTC): ' + usdRate);

            //Then get ETH_BTC rate

            RequestSerializer.getJSON("https://poloniex.com/public?command=returnTicker", function (dataETH) {
                if (!dataETH || !dataETH['BTC_ETH'] || !dataETH['BTC_ETH'].last) {
                    console.log('Failed to get exchange rates for ETH', dataETH);
                    return;
                }
                var btceth = dataETH['BTC_ETH'].last;
                var ethusd = (usdRate * btceth).toFixed(2);

                if (!EthereumWallet._exchangeRates || EthereumWallet._exchangeRates['USD'] != ethusd) {
                    self.log('New Exchange Rate (ETH): ' + ethusd);

                    for (var currency in dataBTC) {
                        // skip loop if the property is from prototype
                        if (!dataBTC.hasOwnProperty(currency))
                            continue;

                        var tempRate = [];

                        tempRate['ask'] = (dataBTC[currency]['ask'] * btceth).toFixed(2);
                        tempRate['bid'] = (dataBTC[currency]['bid'] * btceth).toFixed(2);
                        tempRate['last'] = (dataBTC[currency]['last'] * btceth).toFixed(2);

                        EthereumWallet._exchangeRates[currency]=tempRate;
                    }
                    self._notify();
                }
            });
        }
    });
}


HDWallet.prototype._notify = function(reason) {
    for (var i = 0; i < this._listeners.length; i++) {
        this._listeners[i]();
    }
}

HDWallet.prototype.addListener = function(callback) {
    this._listeners.push(callback);
}

HDWallet.prototype.removeListener = function(callback) {
    for (var i = this._listeners.length - 1; i >= 0; i--) {
        if (this._listeners[i] === callback) {
            this._listeners.splice(i, 1);
        }
    }
}

//HDWallet.prototype.signNamecoinTransaction = function(transaction) {
//    var key = this._namecoinNode;
//}

HDWallet.prototype.setOnename = function(onename) {
    storeData('onename-' + this._storageKey, onename);
}

HDWallet.prototype.getOnename = function() {
    return getStoredData('onename-' + this._storageKey);
}

HDWallet.prototype.getOnenameAddress = function() {
    this._load();
    if (!this._onenameAddress) {
        this._onenamePrivateKey = this._privateKey(true, 0x7fffffff);
        this._onenameAddress = this._onenamePrivateKey.getAddress();
    }
    return this._onenameAddress;
}

/*
HDWallet.prototype.registerOnename = function(passname, name, callback) {
    this._load();

    if (this.getOnename()) {
        throw new Error('Already have a onename registered');
    }
    if (!passname.match(/^[a-z]([a-z0-9-]{0,62}[a-z0-9])?$/)) {
        throw new Error('Invalid onename');
    }

    var url = 'https://glacial-plains-9083.herokuapp.com/v2/onename/register/' + passname;
    url += '?recipientAddress=' + this.getNamecoinAddress();
    url += '&bitcoinAddress=' + this._currentReceiveAddress;
    url += '&name=' + encodeURI(name);

    var self = this;
    RequestSerializer.getJSON(url, function (data) {
        self.log(data);
        //storeData('onename-' + this.getNamecoinAddress(), onename);
    });

}
*/
/*
HDWallet.prototype.getOnename = function() {
    return getStoredData('onename-' + this.getNamecoinAddress())
}
*/

//HDWallet.prototype.getNamecoinAddress = function() {

// Generate the namecoin node if we haven't already
//    if (!this._nameCoinNode) {
// See: http://doc.satoshilabs.com/slips/slip-0044.html
// m/purpose=44'/cointype=7'/account=0'/change=0/index=0
//this._namecoinNode = this._rootNode.deriveHardened(44).deriveHardened(7).deriveHardened(0).derive(0).derive(0);
//        this._namecoinNode = HDWallet._derive(HDWallet._derive(HDWallet._derive(HDWallet._derive(HDWallet._derive(this._rootNode, 44, true), 7, true), 0, true), 0, false), 0, false);
//    }

//    return this._namecoinNode.privKey.pub.getAddress(NamecoinNetwork).toString();
//}

HDWallet.prototype.setLogger = function(logger) {
    if (logger && logger.log) {
        this._logger = logger;
    } else {
        this._logger = console;
    }
}

HDWallet.prototype.log = function() {

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

HDWallet.prototype.dumpLog = function() {
    // Dump the deferred log set
    for (var i = 0; i < this._log.length; i++) {
        this._logger.log.apply(this._logger, this._log[i]);
    }
}
