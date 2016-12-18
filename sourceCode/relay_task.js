var RelayTask = function(){
	//this._index = 0; // This should be unique for each task.
	this._relayFunctionName = "";
	this._relayFunctionArguments = [];
	this._callbackArgumentIndex = -1;
	this._startingRelayIndex = 0;
	this._currentRelayIndex = 0;
	this._returnValue = null;
	this._isCallbackSuccessfulFunction = null;
	this._isCallbackPermanentFailureFunction = null;
	this._actionTakenWhenTaskIsNotExecuted = null;
    this._passthroughParams = null;
	// In the future maybe we should include the following instance variables:
	// this._isComplete = {true | false}
	// this._currentRelayIndex = { 0 | 1 | 2 | 3 | .... }
}

RelayTask.prototype.initialize = function(newRelayFunctionName, newRelayFunctionArguments, callbackArgumentIndex, newStartingRelayIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted, passthroughParams){
	//this._index = newIndex;
	this._relayFunctionName = newRelayFunctionName; // Name of delegate function we want to call.
	this._relayFunctionArguments = newRelayFunctionArguments; // Array of delegate function arguments.
	this._startingRelayIndex = newStartingRelayIndex; // The relay index that we want to call first.
	this._callbackArgumentIndex = callbackArgumentIndex; // This is the argument position that will contain the callback. (-1 if none are callbacks)
	this._currentRelayIndex = newStartingRelayIndex; // The relay index of the relay that we are currently calling.

	if (typeof(isCallbackSuccessfulFunction) === 'undefined' || isCallbackSuccessfulFunction === null || isCallbackSuccessfulFunction === "default") {
		this._isCallbackSuccessfulFunction = function(status){return (typeof(status) === 'string' && status === "success");};
	} else { // @TODO: Check if the supplied argument is callable.
//        console.log("manual :: isCallbackSuccessfulFunction :: " + isCallbackSuccessfulFunction);
		this._isCallbackSuccessfulFunction = isCallbackSuccessfulFunction;
	}
	if (typeof(isCallbackPermanentFailureFunction) === 'undefined' || isCallbackPermanentFailureFunction === null || isCallbackPermanentFailureFunction === "default") {
		this._isCallbackPermanentFailureFunction = function(status){return false;};
	} else { // @TODO: Check if the supplied argument is callable.
		this._isCallbackPermanentFailureFunction = isCallbackPermanentFailureFunction;
	}
	if (typeof(actionTakenWhenTaskIsNotExecuted) === "undefined" || actionTakenWhenTaskIsNotExecuted === "null" || actionTakenWhenTaskIsNotExecuted === "default"){
		this._actionTakenWhenTaskIsNotExecuted = function(){console.log("RelayTask :: A Jaxx relay task failed permanently.");};
	} else {
		this._actionTakenWhenTaskIsNotExecuted = actionTakenWhenTaskIsNotExecuted;
	}

    this._passthroughParams = passthroughParams;

//    console.log("relayTask :: initialize :: passthroughParams :: " + JSON.stringify(passthroughParams));
}

RelayTask.prototype.getRelayFunctionName = function() {
	return this._relayFunctionName;
}

RelayTask.prototype.getRelayFunctionArguments = function(){
	return this._relayFunctionArguments;
}

RelayTask.prototype.getStartingRelayIndex = function() {
	return this._startingRelayIndex;
}

RelayTask.prototype.getCurrentRelayIndex = function() {
	return this._currentRelayIndex;
}

RelayTask.prototype.setCurrentRelayIndex = function(newIndex){
	this._currentRelayIndex = newIndex;
}

RelayTask.prototype.isCurrentRelayEqualToStartingRelay = function() {
	return (this._currentRelayIndex === this._startingRelayIndex);
}

RelayTask.prototype.getRelayCallbackIndex = function() {
	return this._callbackArgumentIndex;
}

RelayTask.prototype.getRelayCallback = function() {
	if (this._callbackArgumentIndex === -1){
		return null;
	}
	return this.getRelayFunctionArguments()[this.getRelayCallbackIndex()];
}

RelayTask.prototype.getArgumentsWithCallbackSubstituted = function(){
	return null; // @TODO: Write this function
}

RelayTask.prototype.setReturnValue = function(newReturnValue) {
	this._returnValue = newReturnValue;
}

RelayTask.prototype.getReturnValue = function() {
	return this._returnValue;
}

RelayTask.prototype.isCallbackSuccessful = function(status) {
	return this._isCallbackSuccessfulFunction(status);
}

RelayTask.prototype.isCallbackPermanentFailure = function(status) {
	return this._isCallbackPermanentFailureFunction(status);
}

RelayTask.prototype.takeActionOnTaskFailure = function() {
    // "{"0":"failure","1":{"data":"","2":["passthroughParameters"]}" // JSON.stringify(arguments);
    return this._actionTakenWhenTaskIsNotExecuted(arguments);
}

RelayTask.prototype.getRelayPassthroughParams = function() {
    return this._passthroughParams;
}

//RelayTask.prototype.runCallback = function() {
//	var callback = this.getRelayCallback();
//	if (typeof(callback) !== 'undefined' && callback !== null) {
//		// Run the callback
//	}
//}

if (typeof(exports) !== 'undefined') {
    exports.relayTask = RelayTask;
}
