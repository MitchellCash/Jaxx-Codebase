var _exchangeRatesETH = {} ;  //Copy of HDWallet._exchangeRates, but with ETH instead

function updateEthRates()
{
	if(HDWallet._exchangeRates['USD'] ){
		 RequestSerializer.getJSON("https://poloniex.com/public?command=returnTicker", function (data) {
	        if (!data || !data['BTC_ETH'] || !data['BTC_ETH'].last) {
	            console.log('Failed to get exchange rates for ETH', data);
	            return;
	        }
	        var btceth = data['BTC_ETH'].last;

	        for (var currency in HDWallet._exchangeRates) {
			    // skip loop if the property is from prototype
			    if (!HDWallet._exchangeRates.hasOwnProperty(currency)) continue;
			    var tempRate = HDWallet._exchangeRates[currency];

				tempRate['ask'] = (tempRate['ask'] * btceth).toFixed(2);
				tempRate['bid'] = (tempRate['bid'] * btceth).toFixed(2);
				tempRate['last'] = (tempRate['last'] * btceth).toFixed(2);
				_exchangeRatesETH[currency]=tempRate;
			}
	    });
		console.log(JSON.stringify(_exchangeRatesETH)); //TODO comment
		//console.log(JSON.stringify(_exchangeRatesETH)); //TODO comment
	}
	else {
		console.log("Need to update btc rates first");
	}
}
