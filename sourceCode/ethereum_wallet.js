//_getJSON = function(url, callback) {
//    console.log("calling JSON");
//    chrome.extension.sendRequest({action:'getJSON',url:url}, callback);
//}
//_extensionAjax = function(url, callback, type, async) {
//    console.log("calling ajax");
//    chrome.extension.sendRequest({action:'ajax',url:url, type:type, async:async}, callback);
//}
//
//_get = function(url, callback) {
//    console.log("sending get");
//    chrome.extension.sendRequest({action:'get',url:url}, callback);
//}
//
//_post = function(url, data, callback) {
//    console.log("sending post");
//    chrome.extension.sendRequest({action:'post', data: data, url:url}, callback);
//}

/**
 *  Wallet
 *
 *  A wallet takes in a hexidecimal seed to generate and manage a single
 *  Ethereum address.
 *
 */

// Stop-gap while address generation in ethereumjs-tx is broken
// We can remove elliptic from our deps once this is fixed
/*
var ECC = thirdparty.elliptic.ec('secp256k1');
function inplacePad32Array(a) {
    while (a.length < 32) {
        a.unshift(0);
    }
}
function privateToAddress(privateKey) {
    var secexp = new ethUtil.BN(privateKey);
    var publicKey = ECC.keyFromPrivate(secexp).getPublic();
    var x = publicKey.x.toArray(), y = publicKey.y.toArray();
    inplacePad32Array(x);
    inplacePad32Array(y);
    var hash = new ethUtil.sha3(Buffer.concat([new Buffer(x), new Buffer(y)]));
    return hash.toString('hex').slice(-40);
}
*/

function pad(num, size) {
    var s = num+"";
    while (s.length < size) {
        s = "0" + s;
    }
    return s;
}

function loadScript(sScriptSrc, oCallback, eCallback) {
    jQuery.ajax({
        async:false,
        type:'GET',
        url:sScriptSrc,
        data:null,
        success:oCallback,
        error:eCallback,
        dataType:'script'
    });
}

function onFunctionAvailable(sMethod, oCallback, oObject, bScope) {
    if (typeof(eval(sMethod)) === 'function') {
        bScope ? oCallback.call(oObject) : oCallback(oObject);
    } else {
        setTimeout(function () {
            onFunctionAvailable(sMethod, oCallback, oObject, bScope);
        }), 50
    }
}


var w_Obj;

function EthereumWallet(noBootstrap) {

    this._balance = 0;
    this._transactions = {};
    this._bestBlock = null;

    this._balance_listeners = [];
    this._tx_listeners = [];
    this._block_listeners = [];

    this._lightwallet = null;
    this._unitTestPath = '';
    this._finishedLoadingEthereumCallback = null;

    this._keystore = null;

    this._addressTypeMap = {};

    this._customGasLimit = 21000;
    this._recommendedCustomGasLimit = 21000;

    this._isTheDAOAssociated = -1;

    if (window.chrome && chrome.extension && chrome.extension.getBackgroundPage) {
        this._lightwallet = chrome.extension.getBackgroundPage().lightwallet;
    }
//
//    if (!noBootstrap) {
//        this._update();
//
//        var self = this;
//        this._poll = setInterval(function() { self._update(); }, 60000);
//    }
};

EthereumWallet.prototype.initAndLoadAsync = function() {
    console.log("[ EthereumWallet Legacy :: InitAndLoadAsync ]");

    var mnemonic = getStoredData('mnemonic',true); //Get mnemonic from localstorage
    var hashMnemonicKey = mnemonic + (TESTNET ? '-test': '-main');

    this._storageKey = thirdparty.bitcoin.crypto.sha256(hashMnemonicKey).toString('hex');

    var cachedPrivateHex = getStoredData('ethereum_cachedPrivateFromStorage_' + this._storageKey,true);
    var cachedAddress = getStoredData('ethereum_cachedAddressFromStorage_' + this._storageKey,true);

    var legacyCacheReset = getStoredData('ethereum_hasResetLegacyCache', false);
    if (typeof(legacyCacheReset) !== 'undefined' && legacyCacheReset !== null && legacyCacheReset !== 'true') {
        storeData('ethereum_hasResetLegacyCache', 'true', false);
        cachedPrivateHex = null;
        cachedAddress = null;
    }

    var self = this;

    w_Obj = this;
//    console.log("compare A :: " + (w_Obj === this));

    if (typeof(cachedPrivateHex) !== 'undefined' && cachedPrivateHex != null) {
        console.log("[ EthereumWallet Legacy :: loading from cached seed ]");
        var cachedPrivate = new Buffer(cachedPrivateHex, 'hex');
        w_Obj._private = cachedPrivate;
        w_Obj._address = cachedAddress;
//        console.log("@removeLog :: ethereum :: _private ::" + w_Obj._private);
//        console.log("@removeLog :: ethereum :: _address ::" + w_Obj._address);

        w_Obj.initializeAfterLoad();
    } else {
        if (typeof(w_Obj._lightwallet) !== 'undefined' && w_Obj._lightwallet !== null) {
            w_Obj.initHDStore(true);
        } else {
//            lightwallet = null;

            if (typeof(lightwallet) !== 'undefined' && lightwallet !== null) {
                console.log("[ EthereumWallet Legacy :: Found Lightwallet ]");
                w_Obj._lightwallet = lightwallet;
                w_Obj.initHDStore(true);
            } else {
                console.log("[ EthereumWallet Legacy :: Loading lightwallet.js ]");
                loadScript(this._unitTestPath + 'js/thirdparty/lightwallet.min.js', w_Obj.callbackOnLoadedLightwallet, w_Obj.callbackOnErrorLoadingLightwallet);
            }
        }
    }
}

EthereumWallet.prototype.callbackOnLoadedLightwallet = function() {
    console.log("[ EthereumWallet Legacy :: Loaded lightwallet.js ]");

    if (w_Obj._lightwallet == null) {
        w_Obj._lightwallet = lightwallet;
    }

    w_Obj.initHDStore(true);
}

EthereumWallet.prototype.callbackOnErrorLoadingLightwallet = function(jqXHR, textStatus, errorThrown) {
    console.log("[ EthereumWallet Legacy :: Error Loading lightwallet.js :: " + errorThrown + " ]");

}

EthereumWallet.prototype.getPrivateKey = function(){
    return getStoredData('ethereum_cachedPrivateFromStorage_' + w_Obj._storageKey, true);
}

EthereumWallet.prototype.getPublicAddress = function(){
    return getStoredData('ethereum_cachedAddressFromStorage_' + w_Obj._storageKey, true);
}

EthereumWallet.prototype.initHDStore = function(checkForEthereumIssue) {
    console.log("[ EthereumWallet Legacy :: Init HD Store ]");

    var secretSeed = getStoredData('mnemonic',true); //Get mnemonic from localstorage

    var password = 'password'; //set a fixed password to encrypt the HD keystore

    w_Obj._lightwallet.keystore.deriveKeyFromPassword(password, function(err, pwDerivedKey) {
        if (err) {
            console.log("error :: " + err);
        } else {
//            var hdPath = "m/44'/60'/0'"; //as defined in SLIP44



            w_Obj._keystore = new w_Obj._lightwallet.keystore(secretSeed, pwDerivedKey); //initiat e a new HD keystore

            //Generate a new address following standard HD derivation path

            var hdPath = "m/44'/60'/0'"; //as defined in SLIP44

            w_Obj._keystore.addHdDerivationPath(hdPath, pwDerivedKey, {curve: 'secp256k1', purpose: 'sign'});

            //--------------------Test validity of ETH creation mechanism. @TODO Remove after we nail this issue down
            var ethGenTestPass = "false"; //default to false
            if(PlatformUtils.mobileAndroidCheck() && checkForEthereumIssue === true) {

                var testMnemonicString = "film jaguar grow betray sense offer motor wisdom prefer blur beach cave";
                var testAddress = "0x05ab0947bf134ca2979fd4e679ec601b5d3c8efd";
                _keystore_test = new w_Obj._lightwallet.keystore(testMnemonicString, pwDerivedKey); //initiat e a new HD keystore
                _keystore_test.addHdDerivationPath(hdPath, pwDerivedKey, {curve: 'secp256k1', purpose: 'sign'});
                _keystore_test.generateNewAddress(pwDerivedKey, 1, hdPath);  //Generate a new address
                var generatedAddr = '0x'+ _keystore_test.getAddresses(hdPath)[0];
                if(generatedAddr==testAddress){
                   ethGenTestPass = "true";
                }
            }
            else {
                ethGenTestPass = "true"; //Assume that on non-android device generation is ok
            }

            //-------END test
            storeData('ethereum_generationPassed_' + w_Obj._storageKey, ethGenTestPass,false);

//            ethGenTestPass = false;

//            if(ethGenTestPass){
                w_Obj._keystore.generateNewAddress(pwDerivedKey, 1, hdPath);  //Generate a new address

                //Get private key
                var incompleteAddress = w_Obj._keystore.getAddresses(hdPath)[0];
                w_Obj._keystore.setDefaultHdDerivationPath(hdPath); //Set default HD path
                var hexSeedETH = w_Obj._keystore.exportPrivateKey(incompleteAddress, pwDerivedKey);

    //            var computedAddress = w_Obj._lightwallet.keystore._computeAddressFromPrivKey(hexSeedETH);

    //            console.log("computed address :: " + computedAddress);
    //            console.log("hexSeedETH :: " + hexSeedETH + " :: " + hexSeedETH.length);

                if (hexSeedETH.length < 64) {
    //                console.log("padding needed");
                    hexSeedETH = pad(hexSeedETH, 64);
                }

    //            console.log("hexSeedETH :: " + hexSeedETH + " :: " + hexSeedETH.length);

                w_Obj._private = new Buffer(hexSeedETH, 'hex');
                w_Obj._address = '0x' + incompleteAddress; //Add 0x to indicate hex

                storeData('ethereum_cachedPrivateFromStorage_' + w_Obj._storageKey, hexSeedETH,true);
                storeData('ethereum_cachedAddressFromStorage_' + w_Obj._storageKey, w_Obj._address,true);


                //    console.log("@removeLog :: ethereum :: _private ::" + w_Obj._private);
                //    console.log("@removeLog :: ethereum :: _address ::" + w_Obj._address);

                //    }

                //    console.log("compare B :: " + (w_Obj === this));
                w_Obj.initializeAfterLoad();
//            }
//            else {
//                g_JaxxApp.getUI().hideEthereumMode();
//                g_JaxxApp.getUI().showEthereumTestFailedModal();
//            }
        }
    });
}

EthereumWallet.prototype.initializeAfterLoad = function() {
    console.log("[ EthereumWallet Legacy :: Initialize ]");
    this._update();

    var self = this;
    this._poll = setInterval(function() { self._update(); }, 15000);

    if (this._finishedLoadingEthereumCallback !== null) {
//        storeData('ethereum_generationPassed_' + w_Obj._storageKey, "false", false);

//        console.log("ethereum_generationPassed :: " + getStoredData('ethereum_generationPassed_' + w_Obj._storageKey, false) + " :: " + typeof(getStoredData('ethereum_generationPassed_' + w_Obj._storageKey, false)));

        var isGlitchedWallet = false;
        if (getStoredData('ethereum_generationPassed_' + w_Obj._storageKey, false) !== "true") {
            isGlitchedWallet = true;
        }

        this._finishedLoadingEthereumCallback(isGlitchedWallet);
    }
}

EthereumWallet.generateQRCode = function(address, amount, modal) {
//    console.log("gen qr :: " + address)
    var url = "iban:" + EthereumWallet.getICAPAddress(address);
    if (amount) {
        url += '?amount=' + amount;
    }

    var size = 4;
    if (modal) {
        size = 7;
    }

    return thirdparty.qrImage.imageSync(url, {type: "png", ec_level: "H", size: size, margin: 0}).toString('base64');
}

/*
EthereumWallet.fromJSON = function(password, json, callback) {
    return new Wallet(EthereumWallet.hexSeedFromJSON(password, json, callback));
}


EthereumWallet.hexSeedFromJSON = function(password, json, callback) {
    var payload = JSON.parse(json);

    var version = parseInt(payload.version);
    if (payload.version && parseInt(payload.version) === 3) {
        // @TODO: Check here that the address in the wallet is equal to the address in the file
        return EthereumWallet._hexSeedFromJSONVersion3(password, payload, callback);
    } else if (payload.encseed && payload.ethaddr) {
        return EthereumWallet._hexSeedFromJSONEthSale(password, payload, callback);
    }

    throw new Error("Unsupported JSON wallet version");
}



// https://github.com/ethereum/pyethsaletool/blob/master/pyethsaletool.py

EthereumWallet._hexSeedFromJSONEthSale = function(password, payload, callback) {

    var encseed = new Buffer(payload.encseed, 'hex');

    var key = thirdparty.pbkdf2.pbkdf2Sync(password, password, 2000, 32, 'sha256').slice(0, 16);

    var iv = encseed.slice(0, 16);
    var encryptedSeed = encseed.slice(16);

    var decryption = new thirdparty.aes.ModeOfOperation.cbc(key, iv);
    var seed = [];
    for (var i = 0; i < encryptedSeed.length; i += 16) {
        var bytes = decryption.decrypt(encryptedSeed.slice(i, i + 16));
        for (var j = 0; j < 16; j++) {
            seed.push(bytes[j]);
        }
    }

    // Strip PKCS#7 padding
    var pad = seed[seed.length - 1];
    if (pad > 16 || pad > seed.length) {
        return null;
    }

    // Check PKCS#7 padding... 64 bytes is multiple of 16, so if fills the block with 16
    for (var i = seed.length - pad; i < seed.length; i++) {
        if (seed[i] !== pad) {
            return null;
        }
    }

    // Convert seed from binary encoding of hex into hex... Yes, this is a strange way to use entropy...
    var seedHex = '';
    for (var i = 0; i < seed.length - pad; i++) {
        seedHex += String.fromCharCode(seed[i]);
    }
    seed = new Buffer(ethUtil.sha3(new Buffer(seedHex)));

    //var address = ethUtil.publicToAddress(ethUtil.privateToPublic(seed)).toString('hex')
    var address = ethUtil.privateToAddress(seed).toString('hex')
    if (address !== payload.ethaddr) {
        return null;
    }

    return seed.toString('hex');

}


// See: https://github.com/ethereum/wiki/wiki/Web3-Secret-Storage-Definition
EthereumWallet._hexSeedFromJSONVersion3 = function(password, payload, callback) {
    // Get a value from a dictionary given a path, ignoring case
    var getValue = function(path) {
        var current = payload;

        var parts = path.split('/');
        for (var i = 0; i < parts.length; i++) {
            var search = parts[i].toLowerCase();
            var found = null;
            for (var key in current) {
                if (key.toLowerCase() === search) {
                    found = key;
                    break;
                }
            }
            if (found === null) {
                return null;
            }
            current = current[found];
        }

        return current;
    }

    var ciphertext = new Buffer(getValue("crypto/ciphertext"), 'hex');

    var key = null;

    // Derive the key
    var kdf = getValue("crypto/kdf");
    if (kdf && kdf.toLowerCase() === "scrypt") {

        // Scrypt parameters
        var salt = new Buffer(getValue('crypto/kdfparams/salt'), 'hex');
        var N = getValue('crypto/kdfparams/n');
        var r = getValue('crypto/kdfparams/r');
        var p = getValue('crypto/kdfparams/p');
        if (!N || !r || !p) {
            throw new Error("Invalid JSON Wallet (bad kdfparams)");
        }

        // We need exactly 32 bytes of derived key
        var dkLen = getValue('crypto/kdfparams/dklen');
        if (dkLen !== 32) {
            throw new Error("Invalid JSON Wallet (dkLen != 32)");
        }

        // Derive the key, calling the callback periodically with progress updates
        var derivedKey = thirdparty.scryptsy(new Buffer(password), salt, N, r, p, dkLen, function(progress) {
            if (callback) {
                callback(progress.percent);
            }
        });

        // Check the password is correct
        var mac = ethUtil.sha3(Buffer.concat([derivedKey.slice(16, 32), ciphertext])).toString('hex')
        if (mac.toLowerCase() !== getValue('crypto/mac').toLowerCase()) {
            console.log("Message Authentication Code mismatch (wrong password)");
            return null;
        }
        key = derivedKey.slice(0, 16);

    } else {
        throw new Error("Unsupported key derivation function");
    }


    var seed = null;

    var cipher = getValue('crypto/cipher');
    if (cipher === 'aes-128-ctr') {
        var counter = new thirdparty.aes.Counter(new Buffer(getValue('crypto/cipherparams/iv'), 'hex'));

        var aes = new thirdparty.aes.ModeOfOperation.ctr(key, counter);

        seed = aes.decrypt(ciphertext);

    } else {
        throw new Error("Unsupported cipher algorithm");
    }

    return seed.toString('hex');
};

*/

EthereumWallet.convertWeiToFiat = function(wei, fiatUnit, noPrefix) {

    var prefix = HDWalletHelper.getFiatUnitPrefix(fiatUnit);

    var rate = 0;
    if (EthereumWallet._exchangeRates[fiatUnit]) {
        rate = EthereumWallet._exchangeRates[fiatUnit].last;
    }

    var value = parseFloat(EthereumWallet.convertWeiToEther(wei)) * rate;

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

EthereumWallet.convertFiatToWei = function(fiatAmount, fiatUnit) {
    var rate = 0;
    if (EthereumWallet._exchangeRates[fiatUnit]) {
        rate = EthereumWallet._exchangeRates[fiatUnit].last;
    }

    if (rate === 0) { return null; }

    // Amount is approximate anyways (since it is fiat exchange rate)

    var wei = EthereumWallet.convertEtherToWei(fiatAmount / rate);

    return wei;
}

/**
 *  Wei->Ether
 */

EthereumWallet.convertWeiToEther = function(wei) {
    var balance = thirdparty.web3.fromWei(wei, 'ether');
    if (balance.indexOf('.') == -1) {
        balance += '.0';
    }

    return balance;
}


/**
 *  Ether->Wei
 */


EthereumWallet.convertEtherToWei = function(ether) {
    var balance = thirdparty.web3.toWei(ether, 'ether');
    if (balance.indexOf('.') == -1) {
        balance += '.0';
    }

    return balance;
}



EthereumWallet.getAddressFromKey = function(privateKey) {
    // re-use the already imported library ethereumjs-tx to avoid adding burden
    //Create a fake tx
    var mockupTxRaw = {
        nonce: EthereumWallet.hexify(1),
        gasPrice: EthereumWallet.hexify(thirdparty.web3.toBigNumber(thirdparty.web3.toWei(50, 'shannon')).plus(1000000000).toDigits(1)),
        gasLimit: EthereumWallet.hexify(21000),
        to: ethereumWallet.getAddress() ,
        value: EthereumWallet.hexify(1),
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

EthereumWallet.prototype.supportsExport = function(password) {
    if (window.crypto) {
        return true;
    }
    return false;
}

/*
EthereumWallet.prototype.exportJSON = function(password, callback, randomBytes) {
    if (password === undefined || password === null) {
        throw new Error('no password');
    }

    if (!randomBytes) {
        randomBytes = new Buffer(crypto.getRandomValues(new Uint8Array(32 + 16 + 16)))
    } else {
        randomBytes = new Buffer(randomBytes);
    }

    var nextRandomIndex = 0;
    var getRandomValues = function(count) {
        var result = randomBytes.slice(nextRandomIndex, nextRandomIndex + count);
        nextRandomIndex += count;
        if (result.length != count) {
            throw new Error('not enough random data');
        }
        return result;
    }

    var secret = this._private

    var salt = getRandomValues(32);
    var iv = getRandomValues(16);

    var derivedKey = thirdparty.scryptsy(new Buffer(password), salt, 262144, 1, 8, 32, function(progress) {
        if (callback) {
            callback(progress.percent);
        }
    });

    var counter = new thirdparty.aes.Counter(iv);
    //counter._counter = iv;

    var aes = new thirdparty.aes.ModeOfOperation.ctr(derivedKey.slice(0, 16), counter);

    var ciphertext = aes.encrypt(secret);

    var result = {
        address: this.getAddress().substring(2),
        Crypto: {
            cipher: "aes-128-ctr",
            cipherparams: {
                iv: iv.toString('hex'),
            },
            ciphertext: ciphertext.toString('hex'),
            kdf: "scrypt",
            kdfparams: {
                dklen: 32,
                n: 262144,
                r: 1,
                p: 8,
                salt: salt.toString('hex'),
            },
            mac: ethUtil.sha3(Buffer.concat([derivedKey.slice(16, 32), ciphertext])).toString('hex'),
        },
        id: thirdparty.uuid.v4({random: getRandomValues(16)}),
        version: 3,
    }

    return JSON.stringify(result);
}

EthereumWallet.prototype.exportFilename = function() {
    return 'UTC--' + thirdparty.strftime.utc()('%Y-%m-%dT%H-%M-%S') + '.0--' + this.getAddress().substring(2);
}
*/

/**
 *  @TODO: rename to stop?
 */
EthereumWallet.prototype.destroy = function() {
    clearInterval(this._poll);
}

/**
 *  The address this wallet represents.
 */
EthereumWallet.prototype.getAddress = function () {
//    console.log("compare C :: " + (w_Obj === this));

    return this._address;
};

// Convert ICAP addresses (IBAN/BBAN)
// https://github.com/ethereum/wiki/wiki/ICAP:-Inter-exchange-Client-Address-Protocol
(function() {
    function zeroPadLeft(text, length) {
        while(text.length < length) {
            text = '0' + text;
        }
        return text;
    }

    // @TODO: File a PR to expose addSpecification; for now, hijack
    thirdparty.iban.countries.XE30 = thirdparty.iban.countries.UA;
    delete thirdparty.iban.countries.UA;
    thirdparty.iban.countries.XE30.countryCode = 'XE';
    thirdparty.iban.countries.XE30.length = 34;
    thirdparty.iban.countries.XE30.structure = 'B30';

    thirdparty.iban.countries.XE31 = thirdparty.iban.countries.BE;
    delete thirdparty.iban.countries.BE;
    thirdparty.iban.countries.XE31.countryCode = 'XE';
    thirdparty.iban.countries.XE31.length = 35;
    thirdparty.iban.countries.XE31.structure = 'B31';

    EthereumWallet.getICAPAddress = function(data, forceBasic) {
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
        encoded = zeroPadLeft(encoded, length);

        return thirdparty.iban.fromBBAN('XE', encoded);
    }

    EthereumWallet.parseEthereumAddress = function(data) {

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
                    hexAddress = zeroPadLeft(hexAddress, 40);

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
})();

EthereumWallet.prototype.getSpendableBalance = function() {
    var spendableEther = thirdparty.web3.toBigNumber(this.getBalance()).minus(HDWalletHelper.getDefaultEthereumGasLimit().mul(HDWalletHelper.getDefaultEthereumGasPrice())).toString();

    return (spendableEther > 0) ? spendableEther : 0;
}

/**
 *  The current balance.
 */
EthereumWallet.prototype.getBalance = function () {
    return this._balance;
};

EthereumWallet.prototype.getDefaultGasPrice = function() {
    return thirdparty.web3.toWei(thirdparty.web3.toBigNumber('21'), 'shannon');
};


EthereumWallet.prototype.getDefaultGasLimit = function() {
    return 21000;
};

/**
 *  The QR Code.
 */

EthereumWallet.prototype.getQrCode = function(address) {
    return "data:image/png;base64," + EthereumWallet.generateQRCode(address);
}

/**
 *  All transactions, sorted by date ascending (the API call provides sorted-ness).
 */
EthereumWallet.prototype.getTransactions = function () {
    var transactions = [];

    for (var txid in this._transactions) {
        transactions.push(this._transactions[txid]);
    }

    return transactions;
};

EthereumWallet.prototype.getHistory = function() {
    var transactions = this.getTransactions();

    var history = [];
    for (var ti = 0; ti < transactions.length; ti++) {
        var transaction = transactions[ti];
//        console.log("ethereum transaction :: " + JSON.stringify(transaction));
        var cost = thirdparty.web3.fromWei(transaction.value);

        var toAddress = "unknown";

        if (transaction.to === this.getAddress()) {
            toAddress = transaction.from.substring(0, 7) + '...' + transaction.from.substring(transaction.from.length - 5);
            if (transaction.from === 'GENESIS') {
                toAddress = transaction.from;
            }

        } else if (transaction.from === this.getAddress()) {
            cost *= -1;
            toAddress = transaction.to.substring(0, 7) + '...' + transaction.to.substring(transaction.from.length - 5);

        } else {
            console.log('Weird', this.getAddress(), tx.to, tx.from);
        }

//        console.log("toAddress :: " + toAddress)
        var deltaBalance = cost;

        var txid = transaction.hash;

        var gasUsed = thirdparty.web3.fromWei(transaction.gasPrice * transaction.gasUsed);

        history.push({
            toAddress: toAddress,
            blockNumber: transaction.blockNumber,
            confirmations: transaction.confirmations,
            deltaBalance: deltaBalance,
            gasUsed: gasUsed,
            timestamp: transaction.timeStamp,
            txid: txid
        });
    }

    return history;
}


EthereumWallet.hexify = function (value) {
    if (typeof(value) === 'number' || typeof(value) === 'string') {
            value = thirdparty.web3.toBigNumber(value);
        }

        var hex = value.toString(16);
        if (hex.length % 2) {
            hex = '0' + hex;
        }

        return new Buffer(hex, 'hex');
}

/**
 *  Create a transaction to address for amount in wei.
 */
EthereumWallet.prototype.buildTransaction = function (address, amountWei, customGasLimit, txData) {
    if (address.substring(0, 2) != '0x') {
        address = '0x' + address;
    }

    if (address.length != 42) {
        console.log('Invalid address');
        return null;
    }

    var gasPrice = this.getDefaultGasPrice();

    var nonce = 0;
    for (var txid in this._transactions) {
        var tx = this._transactions[txid];
        if (tx.from === this.getAddress()) {
            nonce++;
        }
    }

    var rawTx = {
        nonce: EthereumWallet.hexify(nonce),
        gasPrice: EthereumWallet.hexify(thirdparty.web3.toBigNumber(gasPrice).toDigits(1)),
        gasLimit: EthereumWallet.hexify(this.getDefaultGasLimit()),
        to: address,
        value: EthereumWallet.hexify(amountWei),
        //data: '',
    };

    if (customGasLimit) {
        rawTx.gasLimit = customGasLimit;
    }

    if (txData) {
        rawTx.data = txData;
    }

    var transaction = new thirdparty.ethereum.tx(rawTx);
//    console.log("A :: ethereum buildTransaction :: " + JSON.stringify(transaction));

    transaction.sign(this._private);

    transaction._mockTx = {
        blockNumber: null,
        confirmations: 0,
        from: this.getAddress(),
        hash: ('0x' + transaction.hash().toString('hex')),
        timeStamp: (new Date()).getTime() / 1000,
        to: address,
        nonce: nonce,
        value: amountWei,
    };

//    console.log("B :: ethereum buildTransaction :: " + JSON.stringify(transaction));

    return transaction;
}


/**
 *  Sends a transaction previously created with EthereumWallet.buildTransaction().
 */
EthereumWallet.prototype.sendTransaction = function(transaction, callback) {
    var hex = '0x' + transaction.serialize().toString('hex');

//    console.log("send transaction :: " + JSON.stringify(transaction))
//    return;
//
    var self = this;
    $.getJSON('https://api.etherscan.io/api?module=proxy&action=eth_sendRawTransaction&hex=' + hex, function (data) {
        if (!data || !data.result || data.result.length !== 66) {
            if (callback) {
                var message = 'An error occurred';
                if (data && data.error && data.error.message) {
                    message = data.error.message;
                }
                callback(new Error(message));
            }
            console.log('Error sending', data);
            return;
        }
        if (callback) {
            callback(null, data.result);
        }

        self._transactions[transaction._mockTx.hash] = transaction._mockTx;

//        self._balance -= transaction.
        self._tx_notify();
        self._update();
    });
}


/**
 *  Add a listener for balance changes.
 */
EthereumWallet.prototype.addBalanceListener = function(callback) {
//    console.log("compare D :: " + (w_Obj === this));


    this._balance_listeners.push(callback);
}

/**
 *  Removes the first reference to balance callback.
 */
EthereumWallet.prototype.removeBalanceListener = function(callback) {
    for (var i = this._balance_listeners.length - 1; i >= 0; i--) {
        if (callback == this._balance_listeners[i]) {
            this._balance_listeners = this._balance_listeners.splice(i, 1);
            break;
        }
    }
}

/**
 *  Add a listener for TX changes.
 */
EthereumWallet.prototype.addTXListener = function(callback) {
    this._tx_listeners.push(callback);
}


/**
 *  Removes the first reference to TX callback.
 */
EthereumWallet.prototype.removeTXListener = function(callback) {
    for (var i = this._tx_listeners.length - 1; i >= 0; i--) {
        if (callback == this._tx_listeners[i]) {
            this._tx_listeners = this._tx_listeners.splice(i, 1);
            break;
        }
    }
}

/**
 *  Add a listener for block changes.
 */
EthereumWallet.prototype.addBlockListener = function(callback) {
    this._block_listeners.push(callback);
}


/**
 *  Removes the first reference to block callback.
 */
EthereumWallet.prototype.removeBlockListener = function(callback) {
    for (var i = this._block_listeners.length - 1; i >= 0; i--) {
        if (callback == this._block_listeners[i]) {
            this._block_listeners = this._block_listeners.splice(i, 1);
            break;
        }
    }
}

// Internal goop

// Notifies balance listeners of changes
EthereumWallet.prototype._balance_notify = function() {
    for (var i = 0; i < this._balance_listeners.length; i++) {
        this._balance_listeners[i]();
    }
}

// Notifies tx listeners of changes
EthereumWallet.prototype._tx_notify = function() {
    for (var i = 0; i < this._tx_listeners.length; i++) {
        this._tx_listeners[i]();
    }
}

// Notifies block listeners of changes
EthereumWallet.prototype._block_notify = function() {
    for (var i = 0; i < this._block_listeners.length; i++) {
        this._block_listeners[i]();
    }
}

EthereumWallet._exchangeRates = {};

EthereumWallet.hasFiatExchangeRates = function(fiatUnit) {
    if (EthereumWallet._exchangeRates[fiatUnit]) {
         return true;
    }

    return false;
}

//Updates ETH-fiat rates
EthereumWallet.prototype._updateExchangeRates = function() {
    var self = this;

    //First update BTC rates
    RequestSerializer.getJSON("https://rushwallet.com/ticker2.php", function (data) {
        if (!dataBTC || !dataBTC['USD'] || !dataBTC['USD'].last) {
            console.log('Failed to get exchange rates', dataBTC);
            return;
        }
        var usdbtc = dataBTC['USD'].last;

        //Then get ETH_BTC rate
        RequestSerializer.getJSON("https://poloniex.com/public?command=returnTicker", function (data) {
                if (!dataETH || !dataETH['BTC_ETH'] || !dataETH['BTC_ETH'].last) {
                    console.log('Failed to get exchange rates for ETH', dataETH);
                    return;
                }
                var btceth = dataETH['BTC_ETH'].last;
                var ethusd = (usdbtc * btceth).toFixed(2);

                if (!EthereumWallet._exchangeRates || EthereumWallet._exchangeRates['USD'] != ethusd) {
                    self.log('New Exchange Rate (ETH): ' + usdRate);

                    for (var currency in dataBTC) {
                        // skip loop if the property is from prototype
                        if (!dataBTC.hasOwnProperty(currency)) continue;
                        var tempRate = dataBTC[currency];

                        tempRate['ask'] = (tempRate['ask'] * btceth).toFixed(2);
                        tempRate['bid'] = (tempRate['bid'] * btceth).toFixed(2);
                        tempRate['last'] = (tempRate['last'] * btceth).toFixed(2);

                        EthereumWallet._exchangeRatesETH[currency]=tempRate;
                    }
                 }
            });


    });
}

EthereumWallet.prototype.getFiatUnit = function() {
    var fiatUnit = getStoredData('fiat');
//    if (HDWallet.getFiatUnitPrefix(fiatUnit) === 'XX$') {
//        fiatUnit = 'USD';
//    }
    return fiatUnit;
}

EthereumWallet.prototype.convertWeiToFiat = function(wei, noPrefix) {
    return EthereumWallet.convertWeiToFiat(wei, this.getFiatUnit(), noPrefix);
}

EthereumWallet.prototype.convertFiatToWei = function(fiatAmount) {
    return EthereumWallet.convertFiatToWei(fiatAmount, this.getFiatUnit());
}

EthereumWallet.prototype.isTheDAOAssociated = function() {
    if (this._isTheDAOAssociated === true) {
        return true;
    }

    var isAssociated = false;

    for (var txid in this._transactions) {
        var tx = this._transactions[txid];
//        console.log("tx :: " + tx.to + " :: theDAOAddress :: " + HDWalletHelper.theDAOAddress);
        if (tx.to === HDWalletHelper.theDAOAddress) {
            isAssociated = true;
            this._isTheDAOAssociated = true;
        }
    }

    return isAssociated;
}

// Called by a polling interval to update balance and transaction history
EthereumWallet.prototype._update = function(callback) {
//    console.log('[ Updating Ethereum ]');

    var self = this;
    var populateConfirmations = function() {
        var bestBlock = self._bestBlock;

        for (var txid in self._transactions) {
            var tx = self._transactions[txid];
            if (tx.blockNumber !== null && tx.blockNumber !== undefined && bestBlock !== null) {
                tx.confirmations = bestBlock - tx.blockNumber + 1;
            } else {
                tx.confirmations = 0;
            }
        }
    }

    $.getJSON('https://api.etherscan.io/api?module=account&action=txlist&address=' + this.getAddress() + '&sort=asc', function (data) {
        if (data.status != 1) { return; }
        for (var i = 0; i < data.result.length; i++) {
            var tx = data.result[i];
            self._transactions[tx.hash] = tx;
        }

        populateConfirmations();
        self._tx_notify();

        if (callback) {
            callback({transactions: self.getTransactions()});
        }
    });
    $.getJSON('https://api.etherscan.io/api?module=account&action=balance&address=' + this.getAddress() + '&tag=latest', function (data) {
        if (data.status != 1) { return; }
        self._balance = data.result;
        self._balance_notify();
        if (callback) {
            callback({balance: self._balance});
        }
    });
    $.getJSON('https://api.etherscan.io/api?module=proxy&action=eth_blockNumber', function (data) {
        if (!data || !data.result) { return; }
        self._bestBlock = parseInt(data.result, 16);
        populateConfirmations();
        self._block_notify();

        if (callback) {
            callback({bestBlock: self._bestBlock});
        }
    });
};

// @TODO: provide the option to provide a callback?
EthereumWallet.prototype.refresh = function(callback) {
    this._update(callback);
};

// ---------------------- Determine valid ETH smartcontract address
/*
  Async call to etherscan
  var contract = "0xf45717552f12ef7cb65e95476f217ea008167ae3";
  var person = "0x18e113d8177c691a61be785852fa5bb47aeebdaf";
  isSmartContractQuery(contract);
  isSmartContractQuery(person);
*/


//function isSmartContractCallback(ETHaddress,hasCode){
//    if(hasCode){
//        console.log('0x' + ETHaddress+' is a contract');
//    }
//    else {
//        console.log('0x' +ETHaddress+' is NOT the address of a contract');
//    }
//}

EthereumWallet.prototype.hasCachedAddressAsContract = function(address) {
    if (this._addressTypeMap[address]) {
        if (this._addressTypeMap[address] === true) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

//Uses etherscan geth proxy, getcode method.
EthereumWallet.prototype.checkIsSmartContractQuery = function(address, callback)
{
    if (this._addressTypeMap[address]) {
        callback(null, this._addressTypeMap[address]);
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
            self._addressTypeMap[address] = false;
            callback(null, false);
        } else {
            self._addressTypeMap[address] = true;
            callback(null, true);
        }
    });
}

/* this is the equivalent using ether.camp
function isSmartContractQueryEthercamp(ETHaddress)
{
    //Remove 0x
    if(ETHaddress.substr(0, 2) == '0x'){
        ETHaddress = ETHaddress.substr(2);
    }

    //Check validity
    if(ETHaddress.length != 40){
      console.log("Invalid Address :"+ETHaddress);
      return ;
    }

    var url = "https://state.ether.camp/api/v1/accounts/" + ETHaddress;

    RequestSerializer.getJSON(url, function (data) {
            if (!data) {
                console.log('Failed to get address info from :'+url, data);
                isSmartContractCallback(ETHaddress,null)
            }
            isSmartContractCallback(ETHaddress,data.code)
        });
}
*/

// -----------------------END ETH smartcontract detection

EthereumWallet.prototype.getCustomGasLimit = function() {
    return this._customGasLimit;
}

EthereumWallet.prototype.setCustomGasLimit = function(customGasLimit) {
    this._customGasLimit = customGasLimit;
}

EthereumWallet.prototype.getRecommendedCustomGasLimit = function() {
    return this._recommendedCustomGasLimit;
}

EthereumWallet.prototype.setRecommendedCustomGasLimit = function(recommendedCustomGasLimit) {
    this._recommendedCustomGasLimit = recommendedCustomGasLimit;
}
