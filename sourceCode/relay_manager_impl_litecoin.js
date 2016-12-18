var RelayManagerLitecoin = function() {
    this._debugRelays = false; // Set to 'true' to report messages from the relay log.
    this._name = "LitecoinRelays"; // Just maybe used for testing.
    this._relayNodes = [];
    this._defaultRelayIndex = 0;
}

RelayManagerLitecoin.prototype.initialize = function() {
    if (typeof(importScripts) !== 'undefined') {
        importScripts("../relays/relay_nodes_litecoin/blockr_litecoin_relay.js");
        importScripts("../relays/relay_nodes_litecoin/jaxx_ltc_custom_relay.js");
    }

    this._relayNodes = [
        new LTCBlockrRelay(),
        new LTCBlockrRelay()
        // new LTCJaxxCustomRelay(),
    ]
}

RelayManagerLitecoin.prototype.getDefaultRelayIndex = function() {
    return this._defaultRelayIndex;
}

if (typeof(exports) !== 'undefined') {
    exports.relayManagerImplementation = RelayManagerLitecoin;
}

// Console Test Functions:
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(0, 'getAddressBalance', ['LNReyvWiG4Sj4t667eQquVJVYREpM58yVq', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getAddressBalance
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(0, 'getTxList', ['LgEiPL9v8Z4VKYGXSE9ahBHUnhwo49HjuA,LNReyvWiG4Sj4t667eQquVJVYREpM58yVq', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getTxList
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(0, 'getTxDetails', [["83ef56144910f7799dd0a044b92a488b2db21c8630a5c1a3d7ecff5f5a20a6c1", "9f4da4554f02c209e98040cc478720c922b50edb14f4071f8c4c73e74a9243bf"], function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getTxDetails
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(0, 'getUTXO', ['LNReyvWiG4Sj4t667eQquVJVYREpM58yVq', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getUTXO
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(0, 'getTxCount', ['LgEiPL9v8Z4VKYGXSE9ahBHUnhwo49HjuA,LNReyvWiG4Sj4t667eQquVJVYREpM58yVq', function(){console.log(JSON.stringify(arguments));}], 1, "default", "default"); // getTxCount
// g_JaxxApp.getLitecoinRelays().startRelayTaskWithArbitraryRelay(1, 'getRelayTypeWithCallback', [function(){console.log(JSON.stringify(arguments));}, "Some pass through parameters"], 1, "default", "default"); // Pass through parameter test.
// A more complex one for push raw Tx is needed.
