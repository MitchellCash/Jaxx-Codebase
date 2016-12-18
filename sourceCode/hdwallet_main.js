//@note: I'm not sure if the following @TODO is still relevant.
// @TODO: Handle dust properly - only necessary because blockchain.info remembers bad transactions through its pushtx
// https://github.com/bitcoin/bitcoin/blob/9fa54a1b0c1ae1b12c292d5cb3158c58c975eb24/src/primitives/transaction.h#L138

//@note: @context:
//the allegory is a "wallet"
//there are a number of "pouches" in this "wallet", which relate to different currency types.
//there are a number of "folds" inside this "pouch" which relate to subcurrencies (tokens). the primary "fold" is always the main currency that all the tokens are derived from.
//there are a number of "account" types that are the equivalent of a savings/chequing account for the same currency type.


var ACCOUNT_HD = 0;
var ACCOUNT_REGULAR = 1;
var ACCOUNT_WATCH = 2;
var ACCOUNT_NUMACCOUNTTYPES = 3;

var w_gObj;

var HDWalletMain = function() {
    this._mnemonic = "";

    this._pouches = [];
    this._helper = new HDWalletHelper();

    this._legacyEthereumWallet = null;
    this._hasGlitchedLegacyEthereumWallet = false;
    this._hasShownLegacySweep = false;
    this._shouldSetUpLegacyEthereumSweep = false;
    this._hasSetupLegacyEthereumSweep = false;

    this._legacyEthereumWalletLoadCallback = null;
    this._legacyEthereumWalletUpdateCallback = null;
}

HDWalletMain.TESTNET = TESTNET;


HDWalletMain.prototype.initialize = function() {
    this._helper.initialize();

    for (var i = 0; i < COIN_NUMCOINTYPES; i++) {
//    for (var i = 0; i < 1; i++) {
        if (coinIsTokenSubtype[i] !== true) {
            this._pouches[i] = new HDWalletPouch();
            this._pouches[i].setup(i, false, this._helper);
        }
    }

//    console.log("this._pouches.length :: " + this._pouches.length);

    this.setup();
}

HDWalletMain.prototype.setupWithEncryptedMnemonic = function(encMnemonic, callback) {
    console.log("g_Vault :: " + g_Vault + " :: this._pouches :: " + this._pouches.length);
    var self = this;

    g_Vault.decrypt(encMnemonic, function(error, res) {
        if (!error) {
//            console.log("decrypt success :: " + self._pouches.length);
            for (var i = 0; i < self._pouches.length; i++) {
                self._pouches[i].initializeWithMnemonic(encMnemonic, res);
            }

            self._mnemonic = res;

            callback();
        } else {
            var errStr = "error decoding mnemonic :: " + error;
            console.log("error decoding mnemonic :: " + error);

            callback(errStr);
        }
    });
}

HDWalletMain.prototype.switchToCoinType = function(targetCoinType) {
    if (targetCoinType === COIN_BITCOIN) {

    } else if (targetCoinType === COIN_ETHEREUM) {
//        if (this._mnemonic !== "") {
//            this.setupLegacyEthereumSweep();
//        } else {
//            if (this._hasSetupLegacyEthereumSweep === false) {
//                this._shouldSetUpLegacyEthereumSweep = true;
//            }
//        }
    }
}

HDWalletMain.prototype.completeSwitchToCoinType = function(targetCoinType) {
    this.getPouchFold(targetCoinType).refreshIfNecessary();
}

HDWalletMain.prototype.getHasSetupLegacyEthereumSweep = function() {
    return this._hasSetupLegacyEthereumSweep;
}

HDWalletMain.prototype.setShouldSetUpLegacyEthereumSweep = function(loadCallback, updateCallback) {
    this._shouldSetUpLegacyEthereumSweep = true;
    this._legacyEthereumWalletLoadCallback = loadCallback;
    this._legacyEthereumWalletUpdateCallback = updateCallback;
    this.setupLegacyEthereumSweep();
}

HDWalletMain.prototype.update = function() {
    for (var i = 0; i < this._pouches.length; i++) {
        this._pouches[i].update();
    }
}

HDWalletMain.prototype.setup = function() {
    if (getStoredData('fiat') === null) {
        storeData('fiat', 'USD');
    }

    w_gObj = this;

    this._log = [];
    this._logger = console;

    this._onenameAddress = null;
    this._onenamePrivateKey = null;

    this._privateKeyCache = {};

    this._spendable = null;


    var self = this;
}

HDWalletMain.prototype.shutDown = function(updateListener) {
    for (var i = 0; i < COIN_NUMCOINTYPES; i++) {
        this.getHelper().removeExchangeRateListener(i, updateListener);

        this.getPouchFold(i).shutDown();

        this.getPouchFold(i).removeListener(updateListener);
        this.getPouchFold(i).setLogger(null);
    }
}

HDWalletMain.prototype.getPouchFold = function(coinType) {
//    console.log("this._pouches[coinType] :: " + this._pouches[coinType] + " :: coinType :: " + coinType);

    if (coinType >= 0 && coinType < COIN_NUMCOINTYPES) {
        if (coinIsTokenSubtype[coinType] !== true) {
            return this._pouches[coinType];
        } else {
            return this._pouches[CoinToken.getMainTypeToTokenCoinHolderTypeMap(coinType)].getToken(CoinToken.getMainTypeToTokenMap(coinType));
        }
    }

    return null;
}

HDWalletMain.prototype.getHelper = function() {
    return this._helper;
}

HDWalletMain.prototype.getMnemonic = function() {
//    console.log("mnemonic :: " + this._mnemonic);
    return this._mnemonic;
}

HDWalletMain.prototype.setupLegacyEthereumSweep = function() {
    console.log("[ethereum] :: setup legacy sweep :: load callback :: " + this._legacyEthereumWalletLoadCallback);

    this._shouldSetUpLegacyEthereumSweep = false;
    this._hasSetupLegacyEthereumSweep = true;

    var setupTimeout = 1.5 * 60 * 1000;
    var legacyEthereumSweepRan = getStoredData("ethereum_legacySweepRan", false);

    if (!legacyEthereumSweepRan || legacyEthereumSweepRan !== "true" || this._legacyEthereumWalletLoadCallback !== null) {
        storeData("ethereum_legacySweepRan", "true", false);
        setupTimeout = 1500;
    }


    var self = this;

    setTimeout(function() {
        console.log("[ethereum] :: loading legacy wallet support");
        self._legacyEthereumWallet = new EthereumWallet();
        self._legacyEthereumWallet._finishedLoadingEthereumCallback = function(isGlitchedWallet) {
            self._hasGlitchedLegacyEthereumWallet = isGlitchedWallet;
            if (self._legacyEthereumWalletLoadCallback !== null) {
                self._legacyEthereumWalletLoadCallback();
            }
        }
        self._legacyEthereumWallet.addTXListener(function() {
            if (self._legacyEthereumWalletUpdateCallback) {
                self._legacyEthereumWalletUpdateCallback();
            }
        });

        self._legacyEthereumWallet.addBalanceListener(function() {
//            console.log("[ethereum] :: legacy balance :: " + self._legacyEthereumWallet.getBalance());(
            if (self._legacyEthereumWalletUpdateCallback) {
                self._legacyEthereumWalletUpdateCallback();
            }

            var legacyEthereumSpendableBalance = self._legacyEthereumWallet.getSpendableBalance();

            if (legacyEthereumSpendableBalance > 0) {
                if (self._hasShownLegacySweep === false) {
                    self._hasShownLegacySweep = true; Navigation.showEthereumLegacySweep(legacyEthereumSpendableBalance);
                }
            }
        });
        self._legacyEthereumWallet.initAndLoadAsync();
    }, setupTimeout);
}

HDWalletMain.prototype.hasGlitchedLegacyEthereumWallet = function() {
//    return true;
    return this._hasGlitchedLegacyEthereumWallet;
}

HDWalletMain.prototype.transferLegacyEthereumAccountToHDNode = function() {
    if (this._legacyEthereumWallet) {
        if (this._legacyEthereumWallet._address && this._legacyEthereumWallet._private) {
            var tx = this._legacyEthereumWallet.buildTransaction(this.getPouchFold(COIN_ETHEREUM).getCurrentReceiveAddress().toLowerCase(), this._legacyEthereumWallet.getSpendableBalance());

            if (tx) {
                this._legacyEthereumWallet.sendTransaction(tx, function(err, res) {
                    if (err) {
                        Navigation.flashBanner('Error: ' + err.message, 5);
                        console.log("transferLegacyEthereumAccountToHDNode :: error :: " + err.message);
                    } else {
                        Navigation.flashBanner('Successfully Transferred', 5);
                        console.log("transferLegacyEthereumAccountToHDNode :: success :: " + res);
                    }
                });
            } else {
                Navigation.flashBanner('Error: Invalid Transaction', 5);
            }
        }
    }
}

HDWalletMain.prototype.getAddressesAndKeysCSVForCoinType = function(coinType) {
    var returnStr = "";

    console.log(this.getPouchFold(coinType)._coinFullName + " :: export private keys");

    var accounts = this.getPouchFold(coinType).getAccountList();

    console.log("number of accounts :: " + accounts.length);

    for (var i = 0; i < accounts.length; i++) {
        returnStr += accounts[i].pubAddr + ", " + accounts[i].pvtKey;
        if (i !== accounts.length - 1) {
            returnStr += ",\n";
        } else {
        }
    }

    return returnStr;
}

HDWalletMain.prototype.getEthereumLegacyLightwalletAccount = function(coinType) {
    if (this._legacyEthereumWallet && this._legacyEthereumWallet._address && this._legacyEthereumWallet._private) {
        var accountItem = {};

        accountItem.pubAddr = this._legacyEthereumWallet._address;
        accountItem.pvtKey = this._legacyEthereumWallet._private.toString('hex');
        accountItem.balance = this._legacyEthereumWallet.getBalance();
//        accountItem.coinType = COIN_ETHEREUM;
        accountItem.isTheDAOAssociated = this._legacyEthereumWallet.isTheDAOAssociated();

//        console.log("ethereum legacy :: account :: " + JSON.stringify(accountItem));

        return accountItem;
    } else {
        return null;
    }
}

HDWalletMain.prototype.getEthereumLegacyStableKeypair = function(coinType) {
    return this.getPouchFold(COIN_ETHEREUM).getEthereumLegacyStableKeypair();
}


//@note: this is an equivalence function I build for the lightwallet fiasco, it may be relevant
//at some point in the future, but isn't actually called by anything at the moment.
HDWalletMain.prototype.checkAddress = function() {

    var checkNode = HDWallet._derive(this._receiveNode, 0, false);

    console.log("private key :: " + checkNode.keyPair.toWIF() + " :: " + this._privateKey(false, 0).toWIF());

    var keyPair = checkNode.keyPair;//this._privateKey(false, 0);

    var keyPairB = thirdparty.bitcoin.ECPair.fromWIF("KxxUwg3CwN8YjpnV8TzFRHmwrzP2vbkD9TymbdFM8EQnzpnRHDra", keyPair.network);

    console.log("WIFCheck :: " + (keyPair.getPublicKeyBuffer().toString('hex') == keyPairB.getPublicKeyBuffer().toString('hex')));

    //    console.log("CryptoJS :: " + thirdparty.CryptoJS.enc.Hex.parse);
    console.log("PRE :: keyPair.compressed :: " + keyPair.compressed);

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





HDWalletMain.prototype.setOnename = function(onename) {
    storeData('onename-' + this._storageKey, onename);
}

HDWalletMain.prototype.getOnename = function() {
    return getStoredData('onename-' + this._storageKey);
}

HDWalletMain.prototype.getOnenameAddress = function() {
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
