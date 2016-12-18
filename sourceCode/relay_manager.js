//@note: @here: for android.
if (typeof(console) === 'undefined' || console === null) {
    console = {};
    console.log = function() {};
}


var RelayManager = function() {
	this._debugRelays = false; // Set to 'true' to report messages from the relay log.
	this._bestRelay = 0; // This will be set to an integer when the relay is first set up. This integer corresponds to an element in this._relays
	this._name = "Unknown Relay Manager"; // Just maybe used for testing.
    this._relaysImplementation = null;

    this._relays = []; // This stores a list of relays that can potentially run each task.
	this._relayTasks = {}; // This stores a list of relay tasks that are indexed by integers (dictionary).
	this._relayTaskCounter = 0; // This stores the number of tasks that have been queued.
}

RelayManager.prototype.initialize = function(relaysImplementation) {
    this._relaysImplementation = relaysImplementation;

    this._relaysImplementation.initialize();

    this._debugRelays = this._relaysImplementation._debugRelays;
    this._name = this._relaysImplementation._name;

    for (var i = 0; i < this._relaysImplementation._relayNodes.length; i++) {
        this._relays.push(this._relaysImplementation._relayNodes[i]);
    }

    for (var i = 0; i < this._relays.length; i++) {
        this._relays[i].initialize(this);
    }
}

RelayManager.prototype.setup = function(callback) {
    console.log("[ " + this._name + " Setup ] :: setup with " + this._relays.length + " relays");

    var self = this;

    this.fetchBlockHeights(function(resultParams) {
        console.log("[ " + self._name + " ] :: fetchBlockHeights :: " + JSON.stringify(resultParams));
        //@note: @here: this is needing to be changed.. there is a timeout firing after fetchBlockHeights is assumed to have finished. that assumption is incorrect.

        console.log("[ " + self._name + " ] :: setup :: Now setting up best relay.");
        self.getPrimaryRelay(function(bestRelay) {
            if (bestRelay !== null) {
                console.log("[ "  + self._name + " ] :: setup :: best relay index set to: " + bestRelay);
                self.setBestRelayIndex(bestRelay);
            } else {
                console.log("btcRelays :: error :: no relays available");
                // (Dan and Abby): Force Jaxx to fail.
            }
        });

        callback(resultParams);

        setInterval(function() {
            self.checkRelayForRoundRobin();
        }, 10*60*1000); //TODO check if needed some other background tasks instead
    });
}

RelayManager.prototype.fetchBlockHeights = function(callback) {
    var passthroughParams = {numRelaysTotal: this._relays.length, numRelaysProcessed: 0, numRelaysSuccess: 0, numRelaysFailure: 0};

	for (var i = 0; i < this._relays.length; i++){
		this._relays[i].fetchLastBlockHeight(function(status, passthroughParams) {
            if (status === 'success') {
                passthroughParams.numRelaysSuccess++;
            } else {
                passthroughParams.numRelaysFailure++;
            }
            passthroughParams.numRelaysProcessed++;

            if (passthroughParams.numRelaysProcessed >= passthroughParams.numRelaysTotal) {
                callback(passthroughParams);
            }
        }, passthroughParams);
	}
}

// ***********************************************************************
// The following functions are housekeeping functions
// ***********************************************************************
// relayLog
// ***********************************************************************

RelayManager.prototype.relayLog = function() {
    if (this._debugRelays === false) {
        return;
    }
    var args = [].slice.call(arguments);
    args.unshift('RelayLog:');
    console.log(args);
    //    postMessage({action: 'log', content: args});
}

// ***********************************************************************
// The following functions are for selecting a best relay and maintaining a preferred relay.
// ***********************************************************************
//
// ***********************************************************************

RelayManager.prototype.getPrimaryRelay = function(callback) {
    // @Note: At some point we expect that callback(bestRelay) will be executed.
	// (Dan and Abby): We decide what bestRelay will be here (bestRelay is a local variable).
	isValidRelay = []; // This will be an array of booleans indexed by the relay index. ie. if isValidRelay[1] === false then this._relays[1] has problems.
	for (var i = 0; i < this._relays.length; i++) {
   		isValidRelay[i] = true;
	}
	// @Note: find out how height can be retrieved from a relay.
	// We set arrays to false if we cannot get the block number.
	// Throw an error if the block heights among remaining blocks.
	// Get relay with longest block height.
	var longestHeight = 0;
	var bestRelay = -1;

    //@note: @here: there should be a threshold of block heights to, which would check to see if this particular relay has stalled.
	for (var i = 0; i < this._relays.length; i++){
		var tempBlockHeight = this._relays[i].getLastBlockHeight(); // Javascript optimization.
		if (longestHeight < tempBlockHeight && this.isRelayTrusted(i)){
			bestRelay = i;
			longestHeight = tempBlockHeight;
		}
	}

	if (bestRelay === -1) {
        this.relayLog("[ " + this._name + " ] :: getPrimaryRelay :: None of the relays that are open can retrieve a block height.");
		// (Dan and Abby): Make Jaxx Fail Gracefully.
	} else {
        this.relayLog("[ " + this._name + " ] :: getPrimaryRelay :: relay chosen with index " + bestRelay);
		callback(bestRelay); // This should set the best relay: this._bestRelay = bestRelay;
	}
}

RelayManager.prototype.getRelays = function() { // Getter method
	return this._relays;
}

RelayManager.prototype.getRelayByIndex = function(index) {
	return this._relays[index];
}

RelayManager.prototype.getBestRelay = function() {
	return this._relays[this.getBestRelayIndex()];
}

RelayManager.prototype.getBestRelayIndex = function() { // Getter method
	return this._bestRelay;
}

RelayManager.prototype.setBestRelayIndex = function(newRelayIndex){ // Setter method
	this._bestRelay = newRelayIndex;
}

RelayManager.prototype.checkRelayForRoundRobin = function(callback) {
	// @Note: Ensure the best relay is set at this point.
	if (this.isBestRelayValidInteger()) {
		var startingIndex = this.getBestRelayIndex();
		while (this.isBestRelayTrusted()) {
			this.chooseNextRelay(); // Increment _bestRelay.
			// Note: consider not setting the current relay and only setting it at the end of this function if it actually works.
			if (startingIndex === this.getBestRelayIndex()) { // if startingIndex matches the bestRelay index then make Jaxx fail.
				return; // (Dan and Abby): Fail Jaxx Gracefully
			}
		}
	} else {
        this.relayLog("[ " + this._name + " ] :: checkRelayForRoundRobin :: best relay is not a valid integer (" + this.getBestRelayIndex() + ")");
	}
	if (typeof(callback) !== 'undefined' && callback !== null && typeof(callback) === 'function') {
		callback();
	}
}

RelayManager.prototype.isBestRelayTrusted = function() {
	// Returns true if the best relay is still a relay that we trust.
	return this.isRelayTrusted(this.getBestRelayIndex());
}

RelayManager.prototype.isRelayTrusted = function(relayIndex){
	// Returns true if this._relays[relayIndex] is a valid relay that we trust.
	if (this._relays[relayIndex].getLastBlockHeight() === 0) {
		return false;
	}
	return true;
	// (Dan and Abby): This is used by the checkRelayForRoundRobin function and possibly the inital setup of the relays.
}

RelayManager.prototype.chooseNextRelay = function() {
	if (this.isBestRelayValidInteger()) {
		this.setBestRelayIndex((this.getBestRelayIndex() + 1) % this._relays.length); // Increment bestRelay
        this.relayLog("[ " + this._name + " ] :: chooseNextRelay :: the relay index is being changed to " + this.getBestRelayIndex());
	} else {
        this.relayLog("[ " + this._name + " ] :: chooseNextRelay :: best relay is not a valid integer.");
	}
}

RelayManager.prototype.isBestRelayValidInteger = function() {
	return (!isNaN(this._bestRelay) && (this._bestRelay > -1) && (this._bestRelay < this._relays.length));
}

// ***********************************************************************
// The following functions are the backbone of the relay system
// ***********************************************************************
// BitcoinRelays.prototype.startRelayTaskWithBestRelay
// BitcoinRelays.prototype.launchRelayTask
// BitcoinRelays.prototype.relayTaskCallbackHelper
// ***********************************************************************

RelayManager.prototype.startRelayTaskWithBestRelay = function(delegateFunction, delegateArguments, callbackIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted, passthroughParams){
    this.startRelayTaskWithArbitraryRelay(this.getBestRelayIndex(), delegateFunction, delegateArguments, callbackIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted, passthroughParams);
}

RelayManager.prototype.startRelayTaskWithArbitraryRelay = function(relayIndex, delegateFunction, delegateArguments, callbackIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted, passthroughParams) {
    // Calls delegateFunction corresponding to relay with relayIndex.
    // Parameters:
    // delegateFunction: A string matching the name of the delegate function we want to call.
    // delegateArguments: An array of the arguments that should be passed to the delegate function.
    // callbackIndex: The argument index of the callback in delegateArguments array.
    // Ensure parameters are appropriate values

//    console.log("starting relay task with relay :: " + relayIndex);

    //@note: @here: @todo: need to update this to reenable the try->catch blocks.
//    try {
    if (typeof(callbackIndex) === 'undefined' || callbackIndex === null) {
        callbackIndex = 0; // Callback index is set to 0 unless specified explicitly.
    }
    if (typeof(delegateArguments) === 'undefined' || delegateArguments === null) {
        this.relayLog("[ " + this._name + " ] :: startRelayTaskWithBestRelay :: No arguments specified for the delegate function.");
        delegateArguments = [];
    }
    if (typeof(delegateFunction) !== 'string') {
        this.relayLog("[ " + this._name + " ] startRelayTaskWithBestRelay :: the function name is not a string as required.");
        return;
    }
    if (callbackIndex === -1) {// If no callback is specified.
        // @TODO : Allow round robin to occur for cases where function is not defined for certain relays.
        return this.getRelayByIndex(relayIndex)[delegateFunction].apply(this.getRelayByIndex(relayIndex), delegateArguments);
    }
    if (delegateArguments[callbackIndex] === 'undefined' || delegateArguments[callbackIndex] === null || typeof(delegateArguments[callbackIndex]) !== 'function') {// Check that callback is indeed callable.
        this.relayLog("Callback argument supplied is not callable.")
        return;
    }
    this.relayLog("[ " + this._name + " ] startRelayTaskWithBestRelay :: Starting new relay task.")
    var self = this; // We need this so that we can get relay data.
    // Set indexing variables.
    var relayTaskIndex = this._relayTaskCounter; // This value will be used in the wrapperCallback to reference the task details.
    this._relayTaskCounter = this._relayTaskCounter + 1; // Increment the task counter.
    // Set delegateArguments to a robust value.

    // Add a task to the task array.
    var newTask = new RelayTask();
    newTask.initialize(delegateFunction, delegateArguments, callbackIndex, relayIndex, isCallbackSuccessfulFunction, isCallbackPermanentFailureFunction, actionTakenWhenTaskIsNotExecuted, passthroughParams);
    this._relayTasks[relayTaskIndex] = newTask;
    // Launch the new task.
    return this.launchRelayTask(relayTaskIndex);
    //    } catch(err) {
//        console.log(err.message);
//    }
}

RelayManager.prototype.launchRelayTask = function(relayTaskIndex){
	// The callback in this function uses the relayTaskIndex.
//	try {
		var self = this;
		var currentRelayTask = this._relayTasks[relayTaskIndex];
		var currentRelayIndex = currentRelayTask.getCurrentRelayIndex();
		var currentRelay = this._relays[currentRelayIndex];
		var delegateFunction = currentRelayTask.getRelayFunctionName();
		var delegateArguments = currentRelayTask.getRelayFunctionArguments();
        var passthroughParams = currentRelayTask.getRelayPassthroughParams();
		// Call function specified by the relayTaskIndex with the callback argument substituted.
		var callback = currentRelayTask.getRelayCallback(); // Get the callback argument delegateArguments.
		var substituteCallback = function() {
//            console.log("arguments(a) :: " + JSON.stringify(arguments));
//            console.log("passthroughParams :: " + JSON.stringify(passthroughParams));

            arguments[Object.keys(arguments).length] = passthroughParams

//            console.log("arguments(b) :: " + JSON.stringify(arguments));
			// The reserved word 'arguments' is used here to handle the arguments that are given by the callback.
            self.relayTaskCallbackHelper(relayTaskIndex, callback, arguments); // We expect an arguments variable to be specified.
		};
		var newArguments = delegateArguments.slice(0); // Create a variable called newArguments which is an identical copy of delegateArguments.
		// We can assume that currentRelayTask.getRelayCallbackIndex() !== -1
		newArguments[currentRelayTask.getRelayCallbackIndex()] = substituteCallback;
		// Substitute the callback variable of newArgumentss with 'substituteCallback'.
		var functionToCall = this.getRelayByIndex(currentRelayIndex)[delegateFunction];
		if (typeof(functionToCall) !== 'undefined' && functionToCall !== null) {
			currentRelayTask.setReturnValue(functionToCall.apply(currentRelay, newArguments)); // Call the delegate function with 'newArguments'.
		} else {
            this.relayLog("[ " + this._name + " ] :: launchRelayTask :: The function was not defined for the target relay.");
			this.relayTaskCallbackHelper(currentRelayTaskIndex, "", []);
		}
		return currentRelayTask.getReturnValue();
//	} catch(err) {
//    	console.log(err.message);
//	}
}

RelayManager.prototype.relayTaskCallbackHelper = function(relayTaskIndex, callback, callbackArguments){
	// This function is used to handle the recursive nature of the callbacks that are sent to the relay objects.
	// The wrapper callback will take the same parameters that we would expect to pass to callback eventually.
	// Note: the reserved word 'arguments' gets the arguments that are passed to this callback (which we can expect to use in callback).
//	try {
		var currentRelayTask = this._relayTasks[relayTaskIndex]; // Variable defined for code condensing in rest of function.
		var callback = currentRelayTask.getRelayCallback();
		if (typeof(callbackArguments) !== 'undefined' && callbackArguments !== null) {  // Assures 'arguments' is defined
			if (typeof(callbackArguments[0]) !== 'undefined' && callbackArguments[0] !== null) {
				if (currentRelayTask.isCallbackSuccessful(callbackArguments[0])) { // Checks for a successful response from the serializer so that we know we can execute the callback.
					// @TODO: remove the relaytasks variable from our collection.
					if (typeof(callback) !== 'undefined' && callback !== null) {
                        this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: The callback is being executed.");
//                        console.log("returning callbackArguments :: " + JSON.stringify(callbackArguments));
                        callbackArguments.length = Object.keys(callbackArguments).length;
						return callback.apply(callback, callbackArguments); // Call the callback function using the callback arguments.
					} else {
                        this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: This code should be unreachable since a callback should exist at this point. :: relay task data :: ");
						console.log(currentRelayTask);
					}
				} else if (this._relayTasks[relayTaskIndex].isCallbackPermanentFailure(callbackArguments[0])) {
                    this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: Next message shows status value");
					this.relayLog(callbackArguments[0]);
					callbackArguments.length = Object.keys(callbackArguments).length;
					console.log("Arguments in case of permanent failure are: " + JSON.stringify(callbackArguments));
                    return this._relayTasks[relayTaskIndex].takeActionOnTaskFailure.apply(this._relayTasks[relayTaskIndex], callbackArguments); // Fail the relay task Gracefully.
				} else { // If the callback does not have a 'success' response from the serializer.
					var currentRelayIndex = currentRelayTask.getCurrentRelayIndex(); // Increment the relay index using the 'self' variable
					currentRelayIndex = (currentRelayIndex + 1) % this._relays.length;
					currentRelayTask.setCurrentRelayIndex(currentRelayIndex);
					if (currentRelayTask.isCurrentRelayEqualToStartingRelay()) { // If the relay index now matches the original index.
                        this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: Next message shows status value");
						this.relayLog(callbackArguments[0]);
						return currentRelayTask.takeActionOnTaskFailure(); // Fail the relay task Gracefully.
					} else {
                        this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: Next message shows status value");
						this.relayLog(callbackArguments[0]);
						this.launchRelayTask(relayTaskIndex); // Otherwise, run the process started at the end of this function again with the next relay.
					}
				}
			} else {
                this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: This code should be unreachable. The first argument is not defined for the callback function. Be sure that the first argument of your callback function contains a variable indicating the success of the call :: relay task data :: ");
				console.log(currentRelayTask);
			}
		} else {
            this.relayLog("[ " + this._name + " ] :: relayTaskCallbackHelper :: This code should be unreachable. The arguments variable is not set (This should not happen since absense of callback arguments should simply just be an empty array) :: relay task data :: ");
			this.relayLog(currentRelayTask);
		}
//	} catch(err) {
//    	console.log(err.message);
//	}
}

// ***********************************************************************
// The following functions are used to test the backbone of the relay system.
// ***********************************************************************
// BitcoinRelays.prototype.getRelayType
// BitcoinRelays.prototype.getRelayTypeWithCallback
// BitcoinRelays.prototype.getRelayTypeWithCallbackForgettingStatus
// ***********************************************************************

RelayManager.prototype.getRelayType = function() {
	// Test by running the following command in the javascript console after Jaxx starts:
	// this._relayManager.getRelayType();
	return this.startRelayTaskWithBestRelay('getRelayType', Array.prototype.slice.call(arguments), -1); // -1 means no arguments are callbacks.
	// return this.getBestRelay()['getBestRelayType']();
}

RelayManager.prototype.getRelayTypeWithCallback = function(callback) {
	// Test by running the following command in the javascript console after Jaxx starts:
	// this._relayManager.getRelayTypeWithCallback(function(status, stringToPrint) {console.log("The relay type is " + stringToPrint);})
	return this.startRelayTaskWithBestRelay('getRelayTypeWithCallback', Array.prototype.slice.call(arguments), 0); // 0 means first argument is a callback.
}

RelayManager.prototype.getRelayTypeWithCallbackForgettingStatus = function(callback) {
	// Test by running the following command in the javascript console after Jaxx starts:
	// this._relayManager.getRelayTypeWithCallbackForgettingStatus(function(status, stringToPrint) {console.log("The relay type is " + stringToPrint);})
	return this.startRelayTaskWithBestRelay('getRelayTypeWithCallbackForgettingStatus', Array.prototype.slice.call(arguments), 0); // 0 means first argument is a callback.
}

// ***********************************************************************
// The following functions use the relay system.
// ***********************************************************************
//
// ***********************************************************************

RelayManager.prototype.getUTXO = function(address, callback){
	// this.getBitcoinRelays().getUTXO(keypair.getAddress(),
	// this._relayManager.getUTXO('16pVhzgtHfyji8pdp7aaEAp1uvo1bWKyzp', function(){console.log(JSON.stringify(arguments));});
	// Test case for genesis address: this._relayManager.getUTXO('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', function(){console.log(JSON.stringify(arguments));});
	var actionTakenWhenTaskIsNotExecuted = function() {
		console.log("Cannot get unspent transaction outputs.");
	}
	return this.startRelayTaskWithBestRelay('getUTXO', Array.prototype.slice.call(arguments), 1, "default", "default", actionTakenWhenTaskIsNotExecuted); // 1 means first argument is a callback.
}

RelayManager.prototype.pushRawTx = function(transaction, callback){
	// Test case for genesis address: this._relayManager.pushRawTx('goats', function(){console.log(JSON.stringify(arguments));});
	// this._relayManager.pushRawTx( 'f864a11051e74403151f9f91ec368183ae4dcd422d201c7a91107764330ecd8b', function(){console.log(JSON.stringify(arguments));});
	var actionTakenWhenTaskIsNotExecuted = function() {
		Navigation.clearSettings();
		Navigation.flashBanner("Cannot send transaction.", 5);
	}
	return this.startRelayTaskWithBestRelay('pushRawTx', Array.prototype.slice.call(arguments), 1, "default", "default", actionTakenWhenTaskIsNotExecuted); // 1 means first argument is a callback.
}

if (typeof(exports) !== 'undefined') {
    exports.relayManager = RelayManager;
}
