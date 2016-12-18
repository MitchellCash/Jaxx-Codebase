var RelayManagerBitcoin = function() {
	this._debugRelays = false; // Set to 'true' to report messages from the relay log.
	this._name = "BitcoinRelays"; // Just maybe used for testing.
    this._relayNodes = [];
}

RelayManagerBitcoin.prototype.initialize = function() {
    if (typeof(importScripts) !== 'undefined') {
        importScripts("../relays/relay_nodes_bitcoin/blockr_bitcoin_relay.js");
        //importScripts("../relays/relay_nodes_bitcoin/blockexplorer_relay.js");
    }

    this._relayNodes = [
        new BTCBlockrRelay(),
        //new BTCBlockExplorerRelay()
    ]
}

if (typeof(exports) !== 'undefined') {
    exports.relayManagerImplementation = RelayManagerBitcoin;
}
