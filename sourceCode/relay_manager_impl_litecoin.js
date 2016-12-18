var RelayManagerLitecoin = function() {
    this._debugRelays = false; // Set to 'true' to report messages from the relay log.
    this._name = "LitecoinRelays"; // Just maybe used for testing.
    this._relayNodes = [];
}

RelayManagerLitecoin.prototype.initialize = function() {
    if (typeof(importScripts) !== 'undefined') {
        importScripts("../relays/relay_nodes_litecoin/blockr_litecoin_relay.js");
        //importScripts("../relays/relay_nodes_litecoin/jaxx_ltc_custom_relay.js");
    }

    this._relayNodes = [
        new LTCBlockrRelay(),
        //new LTCJaxxCustomRelay(),
    ]
}

if (typeof(exports) !== 'undefined') {
    exports.relayManagerImplementation = RelayManagerLitecoin;
}
