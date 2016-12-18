var RelayManagerZCash = function() {
    this._debugRelays = false; // Set to 'true' to report messages from the relay log.
    this._name = "ZCashRelays"; // Just maybe used for testing.
    this._relayNodes = [];
    this._defaultRelayIndex = 0;
}

RelayManagerZCash.prototype.initialize = function() {
    if (typeof(importScripts) !== 'undefined') {
        importScripts("../relays/relay_nodes_zcash/jaxx_zec_custom_relay.js");
    }

    this._relayNodes = [
        new ZECJaxxCustomRelay(),
        new ZECJaxxCustomRelay(),
    ]

//    this._relayNodes[0]._baseUrl = "http://52.41.118.219:3004/api/zec/";
//    this._relayNodes[1]._baseUrl = "http://jaxx.io/api/zec/";
}

RelayManagerZCash.prototype.getDefaultRelayIndex = function() {
    return this._defaultRelayIndex;
}

if (typeof(exports) !== 'undefined') {
    exports.relayManagerImplementation = RelayManagerZCash;
}
