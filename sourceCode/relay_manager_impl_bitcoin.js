var RelayManagerBitcoin = function() {
	this._debugRelays = false; // Set to 'true' to report messages from the relay log.
	this._name = "BitcoinRelays"; // Just maybe used for testing.
    this._relayNodes = [];

    this._defaultRelayIndex = 0;
}

RelayManagerBitcoin.prototype.initialize = function() {
    if (typeof(importScripts) !== 'undefined') {
        importScripts("../relays/relay_nodes_bitcoin/blockr_bitcoin_relay.js");
        importScripts("../relays/relay_nodes_bitcoin/jaxx_btc_insight_relay.js");
        //importScripts("../relays/relay_nodes_bitcoin/blockexplorer_relay.js");
    }

    this._relayNodes = [
        new BTCBlockrRelay(),
        new BTCJaxxInsightRelay()
        //new BTCJaxxInsightRelay(),
        //new BTCBlockExplorerRelay()
    ]
}

RelayManagerBitcoin.prototype.getDefaultRelayIndex = function() {
    return this._defaultRelayIndex;
}

if (typeof(exports) !== 'undefined') {
    exports.relayManagerImplementation = RelayManagerBitcoin;
}

// Console Test Functions:
// g_JaxxApp.getBitcoinRelays().startRelayTaskWithArbitraryRelay(1, 'getAddressBalance', ['1E4nwotKjhYpeA3xiMrMt9vxJD6FXm8poR', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getAddressBalance
// g_JaxxApp.getBitcoinRelays().startRelayTaskWithArbitraryRelay(1, 'getTxList', ['1E4nwotKjhYpeA3xiMrMt9vxJD6FXm8poR,1HtwuPiVC59CBD4uhSC1bZ24sophQQFVCE', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getTxList
// g_JaxxApp.getBitcoinRelays().startRelayTaskWithArbitraryRelay(1, 'getTxDetails', [["46e70657db6404f4b1dedb1b795ef31a7904605bf36bf9e1fa8d83f23a023f76", "bd426def94158d2f67a859beff82d40d8c8ccf6c34d776b78296d3cd22ae0d56"], function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getTxDetails
// getUTXO
