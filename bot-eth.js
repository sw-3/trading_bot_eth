// -- HANDLE INITIAL SETUP -- //

require('./helpers/server')
require("dotenv").config();
const Big = require('big.js');
var moment = require('moment');

const {
    BigNumber,
    FixedFormat,
    FixedNumber,
    formatFixed,
    parseFixed,
    // Types
    BigNumberish
} = require("@ethersproject/bignumber");

const config = require('./config.json')
const { 
        getTokenAndContract, getPairContract, calculatePrice, 
        getEstimatedReturn, getReserves, 
        outputTotalStats, outputPairStats, outputExchangeStats 
    } = require('./helpers/helpers')

// get the Exchange/Token info
const { 
    uFactory, uRouter, uName,
    sFactory, sRouter, sName,
    tFactory, tRouter, tName,
    web3, arbitrage, 
    WETHaddr, LINKaddr, MATICaddr, DAIaddr, SHIBaddr, MANAaddr
} = require('./helpers/initialization')

// get the statistics variables
var {totalStats, pairStats, exchangeStats} = require('./helpers/initialization')

// -- .ENV VALUES HERE -- //
const account = process.env.ACCOUNT // Account to recieve profit
const units = process.env.UNITS // Used for price display/reporting
const difference = process.env.PRICE_DIFFERENCE
const percentToBuy = process.env.PERCENT_TO_BUY
const gas = process.env.GAS_LIMIT
const estimatedGasCost = process.env.GAS_PRICE // Estimated Gas: 0.008453220000006144 ETH + ~10%

// -- GLOBALS -- //
let pairID = 0              // indicator for which trading pair we are on (0 .. numPairs-1)
let exchangeID = 0          // indicator for which exchange we are on (0, 1, 2)
let isExecuting = false
let isInitialCheck = false
let runExecutedTradeCnt = 0
let highPriceDiffCnt = 0
let runTotalGain = 0
let profitabilityErrorCnt = 0
let amount
let timeOfLastStatus = moment()     // to allow auto-output of status every 5 minutes

// store the latest known price per pair per exchange
// the array index (0, 1, 2) corresponds to the exchangeID
let exchangePrices = [
    {
        name: uName,                // 1st exchange name
        prices: [0, 0, 0, 0, 0]     // array index corresponds to pairID
    },
    {
        name: sName,        // 2nd exchnage name
        prices: [0, 0, 0, 0, 0]
    },
    {
        name: tName,        // 3rd exchange name
        prices: [0, 0, 0, 0, 0]
    }
]

const main = async () => {
    // record startTime for stats
    totalStats.startTime = moment()    // current time as moment object

    // get all token information from the blockchain
    const { arbForToken, arbForTokenContract,
          arbAgainstToken1, arbAgainstToken1Contract,
          arbAgainstToken2, arbAgainstToken2Contract,
          arbAgainstToken3, arbAgainstToken3Contract,
          arbAgainstToken4, arbAgainstToken4Contract,
          arbAgainstToken5, arbAgainstToken5Contract } = await getTokenAndContract(
                                                                                WETHaddr,
                                                                                LINKaddr,
                                                                                MATICaddr,
                                                                                DAIaddr, 
                                                                                SHIBaddr, 
                                                                                MANAaddr)

    // get the Uniswap contracts for each token-pair
    uPair1 = await getPairContract(uFactory, 
                                arbForToken.address, 
                                arbAgainstToken1.address)
    uPair2 = await getPairContract(uFactory, 
                                arbForToken.address, 
                                arbAgainstToken2.address)
    uPair3 = await getPairContract(uFactory, 
                                arbForToken.address, 
                                arbAgainstToken3.address)
    uPair4 = await getPairContract(uFactory, 
                                arbForToken.address, 
                                arbAgainstToken4.address)
    uPair5 = await getPairContract(uFactory, 
                                arbForToken.address, 
                                arbAgainstToken5.address)

    // get the SushiSwap contracts for each token-pair
    sPair1 = await getPairContract(sFactory, 
                                arbForToken.address, 
                                arbAgainstToken1.address)
    sPair2 = await getPairContract(sFactory, 
                                arbForToken.address, 
                                arbAgainstToken2.address)
    sPair3 = await getPairContract(sFactory, 
                                arbForToken.address, 
                                arbAgainstToken3.address)
    sPair4 = await getPairContract(sFactory, 
                                arbForToken.address, 
                                arbAgainstToken4.address)
    sPair5 = await getPairContract(sFactory, 
                                arbForToken.address, 
                                arbAgainstToken5.address)
    
    // get the ShibaSwap contracts for each token-pair
    tPair1 = await getPairContract(tFactory, 
                                arbForToken.address, 
                                arbAgainstToken1.address)
    tPair2 = await getPairContract(tFactory, 
                                arbForToken.address, 
                                arbAgainstToken2.address)
    tPair3 = await getPairContract(tFactory, 
                                arbForToken.address, 
                                arbAgainstToken3.address)
    tPair4 = await getPairContract(tFactory, 
                                arbForToken.address, 
                                arbAgainstToken4.address)
    tPair5 = await getPairContract(tFactory, 
                                arbForToken.address, 
                                arbAgainstToken5.address)

    // save the latest known price for each pair in each exchange


    // Execute a 1-time sweep of the pair prices after start-up
    var receipt
    if (!isExecuting) {
        isExecuting = true
        isInitialCheck = true
        exchangeID = 0      // Uniswap

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken1.symbol}...\n`)

        // Check first pair, as if a trade just happened on Uniswap
        pairID = 0
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken,
                                            arbForTokenContract,
                                            arbAgainstToken1,
                                            arbAgainstToken1Contract,
                                            uPair1, sPair1, tPair1)

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken2.symbol}...\n`)

        // Check 2nd pair, as if a trade just happened on Uniswap
        pairID = 1
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken, 
                                            arbForTokenContract,
                                            arbAgainstToken2,
                                            arbAgainstToken2Contract,
                                            uPair2, sPair2, tPair2)

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken3.symbol}...\n`)

        // Check 3rd pair, as if a trade just happened on Uniswap
        pairID = 2
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken, 
                                            arbForTokenContract,
                                            arbAgainstToken3,
                                            arbAgainstToken3Contract,
                                            uPair3, sPair3, tPair3)

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken4.symbol}...\n`)

        // Check 4th pair, as if a trade just happened on Uniswap
        pairID = 3
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken, 
                                            arbForTokenContract,
                                            arbAgainstToken4,
                                            arbAgainstToken4Contract,
                                            uPair4, sPair4, tPair4)

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken5.symbol}...\n`)

        // Check 5th pair, as if a trade just happened on Uniswap
        pairID = 4
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken, 
                                            arbForTokenContract,
                                            arbAgainstToken5,
                                            arbAgainstToken5Contract,
                                            uPair5, sPair5, tPair5)

        isInitialCheck = false
        isExecuting = false
    }

    console.log(`------------------------------------------------------------------`)
    console.log(`--------   Token Pair Contracts to Monitor                --------`)
    console.log(`------------------------------------------------------------------\n`)
    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken1.symbol}    ------------------------------------------`)
    console.log(`   ${uName} contract:    ${uPair1.options.address}`)
    console.log(`   ${sName} contract:  ${sPair1.options.address}`)
    console.log(`   ${tName} contract:  ${tPair1.options.address}`)
    console.log(``)

    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken2.symbol}    ------------------------------------------`)
    console.log(`   ${uName} contract:    ${uPair2.options.address}`)
    console.log(`   ${sName} contract:  ${sPair2.options.address}`)
    console.log(`   ${tName} contract:  ${tPair2.options.address}`)
    console.log(``)

    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken3.symbol}    ------------------------------------------`)
    console.log(`   ${uName} contract:    ${uPair3.options.address}`)
    console.log(`   ${sName} contract:  ${sPair3.options.address}`)
    console.log(`   ${tName} contract:  ${tPair3.options.address}`)
    console.log(``)

    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken4.symbol}    ------------------------------------------`)
    console.log(`   ${uName} contract:    ${uPair4.options.address}`)
    console.log(`   ${sName} contract:  ${sPair4.options.address}`)
    console.log(`   ${tName} contract:  ${tPair4.options.address}`)
    console.log(``)

    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken5.symbol}    ------------------------------------------`)
    console.log(`   ${uName} contract:    ${uPair5.options.address}`)
    console.log(`   ${sName} contract:  ${sPair5.options.address}`)
    console.log(`   ${tName} contract:  ${tPair5.options.address}`)
    console.log(`\n`)


    // Execute this code if the 1st exchange processes a trade of our pair1
    uPair1.events.Swap({}, async () => {

        exchangeID = 0
        pairID = 0

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken,
                                                arbForTokenContract,
                                                arbAgainstToken1,
                                                arbAgainstToken1Contract,
                                                uPair1, sPair1, tPair1)

            isExecuting = false
        }
    })

    // execute this code if the 2nd exchange processes a trade of our pair1
    sPair1.events.Swap({}, async () => {

        exchangeID = 1
        pairID = 0

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(sName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken1,
                                                arbAgainstToken1Contract,
                                                uPair1, sPair1, tPair1)
           
            isExecuting = false
        }
    })

    // execute this code if the 3rd exchange processes a trade of our pair1
    tPair1.events.Swap({}, async () => {

        exchangeID = 2
        pairID = 0

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(tName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken1,
                                                arbAgainstToken1Contract,
                                                uPair1, sPair1, tPair1)
           
            isExecuting = false
        }
    })

    // Execute this code if the 1st exchange processes a trade of our pair2
    uPair2.events.Swap({}, async () => {

        exchangeID = 0
        pairID = 1

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken2,
                                                arbAgainstToken2Contract,
                                                uPair2, sPair2, tPair2)

            isExecuting = false
        }
    })

    // execute this code if the 2nd exchange processes a trade of our pair2
    sPair2.events.Swap({}, async () => {

        exchangeID = 1
        pairID = 1

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(sName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken2,
                                                arbAgainstToken2Contract,
                                                uPair2, sPair2, tPair2)
           
            isExecuting = false
        }
    })

    // execute this code if the 3rd exchange processes a trade of our pair2
    tPair2.events.Swap({}, async () => {

        exchangeID = 2
        pairID = 1

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(tName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken2,
                                                arbAgainstToken2Contract,
                                                uPair2, sPair2, tPair2)
           
            isExecuting = false
        }
    })

    // Execute this code if the 1st exchange processes a trade of our pair3
    uPair3.events.Swap({}, async () => {

        exchangeID = 0
        pairID = 2

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken3,
                                                arbAgainstToken3Contract,
                                                uPair3, sPair3, tPair3)

            isExecuting = false
        }
    })

    // execute this code if the 2nd exchange processes a trade of our pair3
    sPair3.events.Swap({}, async () => {

        exchangeID = 1
        pairID = 2

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(sName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken3,
                                                arbAgainstToken3Contract,
                                                uPair3, sPair3, tPair3)
           
            isExecuting = false
        }
    })

    // execute this code if the 3rd exchange processes a trade of our pair3
    tPair3.events.Swap({}, async () => {

        exchangeID = 2
        pairID = 2

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(tName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken3,
                                                arbAgainstToken3Contract,
                                                uPair3, sPair3, tPair3)
           
            isExecuting = false
        }
    })

    // Execute this code if the 1st exchange processes a trade of our pair4
    uPair4.events.Swap({}, async () => {

        exchangeID = 0
        pairID = 3

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken4,
                                                arbAgainstToken4Contract,
                                                uPair4, sPair4, tPair4)

            isExecuting = false
        }
    })

    // execute this code if the 2nd exchange processes a trade of our pair4
    sPair4.events.Swap({}, async () => {

        exchangeID = 1
        pairID = 3

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(sName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken4,
                                                arbAgainstToken4Contract,
                                                uPair4, sPair4, tPair4)
           
            isExecuting = false
        }
    })

    // execute this code if the 3rd exchange processes a trade of our pair4
    tPair4.events.Swap({}, async () => {

        exchangeID = 2
        pairID = 3

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(tName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken4,
                                                arbAgainstToken4Contract,
                                                uPair4, sPair4, tPair4)
           
            isExecuting = false
        }
    })

    // Execute this code if the 1st exchange processes a trade of our pair5
    uPair5.events.Swap({}, async () => {

        exchangeID = 0
        pairID = 4

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken5,
                                                arbAgainstToken5Contract,
                                                uPair5, sPair5, tPair5)

            isExecuting = false
        }
    })

    // execute this code if the 2nd exchange processes a trade of our pair5
    sPair5.events.Swap({}, async () => {

        exchangeID = 1
        pairID = 4

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(sName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken5,
                                                arbAgainstToken5Contract,
                                                uPair5, sPair5, tPair5)
           
            isExecuting = false
        }
    })

    // execute this code if the 3rd exchange processes a trade of our pair5
    tPair5.events.Swap({}, async () => {

        exchangeID = 2
        pairID = 4

        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(tName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken5,
                                                arbAgainstToken5Contract,
                                                uPair5, sPair5, tPair5)
           
            isExecuting = false
        }
    })

    outputTotalStats(totalStats)
    outputPairStats(pairStats, totalStats)
    outputExchangeStats(exchangeStats, totalStats)
    console.log("Waiting for swap event...")
}

// processTradeEvent
//  process a trade event on any exchange for our pairs
//  determine if we can make a trade, and execute the trade if we can
const processTradeEvent = async (_exchangeName, _exchangeID, _pairID,
                                    _arbForToken,
                                    _arbForTokenContract, 
                                    _arbAgainstToken,
                                    _arbAgainstTokenContract,
                                    _uPair, _sPair, _tPair) => {

    // update stats
    totalStats.numEvents++
    pairStats[pairID].numEvents++
    exchangeStats[exchangeID].numEvents++

    // determine the exchange to buy on, and to sell on, for profit
    // Note: routerPath is a list of all routers, ordered from high to low price of the pair
    const routerPath = await deterimineRouterPath(_exchangeName, _exchangeID, _pairID,
                                                    _arbForToken, 
                                                    _arbAgainstToken,
                                                    _uPair, _sPair, _tPair)

    // if routerPath is null, the price difference was not enough, abort
    if (!routerPath) {

        // This event did not require any trade action.
        // Determine if it has been 5 minutes since we displayed the run status...

        // get time since last auto-status  (in miliseconds)
        const currentTime = moment()
        const timeSinceLastStatus = currentTime.diff(timeOfLastStatus)

        if (timeSinceLastStatus > 300000) {
            // it has been 5 minutes since the last auto-status; provide another
            console.log(`\n  Auto Stats generating...`)
            outputTotalStats(totalStats)
            outputPairStats(pairStats, totalStats)
            outputExchangeStats(exchangeStats, totalStats)
            console.log(`Waiting for swap event...\n`)            

            timeOfLastStatus = currentTime
        }
        return
    }

    // if we get here, price difference was past our threshold ... record it
    highPriceDiffCnt++

    const isProfitable = await determineProfitability(
                                                routerPath, 
                                                _arbForTokenContract, 
                                                _arbForToken, 
                                                _arbAgainstToken,
                                                _pairID)

    if (!isProfitable) {
        console.log(`Transaction not profitable.\nNo Arbitrage Currently Available`)
     
        if (!isInitialCheck) { 
            outputTotalStats(totalStats)
            outputPairStats(pairStats, totalStats)
            outputExchangeStats(exchangeStats, totalStats)
            console.log(`Waiting for swap event...\n`)
        }
        return
    }

    const receipt = await executeTrade(
                                    routerPath, 
                                    _arbForTokenContract, 
                                    _arbAgainstTokenContract, 
                                    _arbForToken,
                                    _pairID)

    return receipt
}

// determineRouterPath
// determine the exchange to buy on, and to sell on, for profit
// Note: routerPath is a list of all routers, ordered from high to low price of the pair
const deterimineRouterPath = async (exchangeName, exchangeID, pairID,
                                    token0, token1, uPair, sPair, tPair) => {
    isExecuting = true

    if (!isInitialCheck) {
        console.log(`${moment().format("h:mm:ss a")}:  ` +
                    `Swap Initiated on ${exchangeName} for ${token1.symbol}; ` +
                    `looking for arbitrage...`)
    }
    const currentBlock = await web3.eth.getBlockNumber()

    // get the price of the pair on the exchange which triggered the trade.
    // also, get the price of any pair which is currently 0
    if ( (0 === exchangeID) || (exchangePrices[0].prices[pairID] === 0) ) {
        //console.log(`getting price on Uniswap for pairID ${pairID}`)
        exchangePrices[0].prices[pairID] = await calculatePrice(uPair)
    }
    if ( (1 === exchangeID) || (exchangePrices[1].prices[pairID] === 0) ) {
        //console.log(`getting price on SushiSwap for pairID ${pairID}`)
        exchangePrices[1].prices[pairID] = await calculatePrice(sPair)
    }
    if ( (2 === exchangeID) || (exchangePrices[2].prices[pairID] === 0) ) {
        //console.log(`getting price on ShibaSwap for pairID ${pairID}`)
        exchangePrices[2].prices[pairID] = await calculatePrice(tPair)
    }

    const uPrice = exchangePrices[0].prices[pairID]
    const sPrice = exchangePrices[1].prices[pairID]
    const tPrice = exchangePrices[2].prices[pairID]

    const uFPrice = Number(uPrice).toFixed(units)
    const sFPrice = Number(sPrice).toFixed(units)
    const tFPrice = Number(tPrice).toFixed(units)

    let maxRouter, minRouter, maxPrice, minPrice

    // create the return value: 
    //      a list of all routers, ordered from high to low price of the pair
    let priceRouters = [
        {
            price: uPrice, 
            name: uName,
            router: uRouter,
            pair: uPair
        },
        {
            price: sPrice,
            name: sName,
            router: sRouter,
            pair: sPair
        },
        {
            price: tPrice,
            name: tName,
            router: tRouter,
            pair: tPair
        }
    ]

    // sort the Routers by price, descending
    priceRouters.sort((a, b) => {
        return b.price - a.price
    })

    // set the min/max exchange routers based on the prices
    maxPrice = priceRouters[0].price 
    maxName = priceRouters[0].name
    minPrice = priceRouters[2].price 
    minName = priceRouters[2].name

    // set the exchange ID for the min/max price exchange (for stats below)
    maxExchangeID = 0   // default to Uniswap
    if (maxName == 'SushiSwap') {maxExchangeID = 1}
    else if (maxName == 'ShibaSwap') {maxExchangeID = 2}
    minExchangeID = 0   // default to Uniswap
    if (minName == 'SushiSwap') {minExchangeID = 1}
    else if (minName == 'ShibaSwap') {minExchangeID = 2}

    const percentDifference = (((maxPrice - minPrice) / minPrice) * 100).toFixed(2)

    // update stats for price diff
    pairStats[pairID].totalPriceDiffAmt = pairStats[pairID].totalPriceDiffAmt + Number(percentDifference)
    if(percentDifference > pairStats[pairID].highestPriceDiff) {
        pairStats[pairID].highestPriceDiff = percentDifference
    }


    if (percentDifference >= difference) {
        console.log(``)
        console.log(`Price Difference Met - Current Block: ${currentBlock}`)
        console.log(`-----------------------------------------`)
        console.log(`Buy on  ${maxName}:  ${token1.symbol}/${token0.symbol}\t price = ${maxPrice}`)
        console.log(`Sell on ${minName}:  ${token1.symbol}/${token0.symbol}\t price = ${minPrice}\n`)
        console.log(`Percentage Difference: ${percentDifference}%\n`)

        // update stats
        totalStats.priceDiffMet++
        pairStats[pairID].priceDiffMet++
        exchangeStats[maxExchangeID].priceDiffMet++
        exchangeStats[maxExchangeID].highPriceCnt++
        exchangeStats[minExchangeID].priceDiffMet++
        exchangeStats[minExchangeID].lowPriceCnt++

        return priceRouters
    } else {
        // the price difference did not meet our threshold
        return null
    }
}

const determineProfitability = async (_routerList, 
                                        _token0Contract, 
                                        _token0, 
                                        _token1,
                                        _pairID) => {

    console.log(`Determining Profitability...\n`)

    // This is where you can customize your conditions on whether a profitable trade is possible.
    // This is a basic example of trading WETH/SHIB...

    let reservesToBuy, reservesToSell, exchangeToBuy, exchangeToSell, actualAmountOut

    const _routerPath = [_routerList[0].router, _routerList[2].router ]

    reservesToBuy = await getReserves(_routerList[0].pair)
    reservesToSell = await getReserves(_routerList[2].pair)
    exchangeToBuy = _routerList[0].name
    exchangeToSell = _routerList[2].name
    
    // set the exchange ID for the exchanges (for stats)
    let buyExchangeID = 0   // default to Uniswap
    if (exchangeToBuy == 'SushiSwap') {buyExchangeID = 1}
    else if (exchangeToBuy == 'ShibaSwap') {buyExchangeID = 2}
    let sellExchangeID = 0   // default to Uniswap
    if (exchangeToSell == 'SushiSwap') {sellExchangeID = 1}
    else if (exchangeToSell == 'ShibaSwap') {sellExchangeID = 2}

    reservesToBuyNumber = Number(web3.utils.fromWei(reservesToBuy[0].toString(), 'ether'))
    reservesToSellNumber = Number(web3.utils.fromWei(reservesToSell[0].toString(), 'ether'))
    
    if (Number(reservesToSellNumber) > Number(reservesToBuyNumber)) {
        // More reserves on Sell side than exist on Buy side; use Buy side amount
        actualAmountOut = ( (reservesToBuyNumber*percentToBuy*1000).toFixed(0) ) + '000000000000000'
    } else {
        // More reserves on Buy side, so we can use Sell side amount
        actualAmountOut = ( (reservesToSellNumber*percentToBuy*1000).toFixed(0) ) + '000000000000000'
    }

    try {

        // This returns the amount of WETH needed
        //let result = await _routerPath[0].methods.getAmountsIn(reservesToSell[0], [_token0.address, _token1.address]).call()
        let result = await _routerPath[0].methods.getAmountsIn(actualAmountOut, [_token0.address, _token1.address]).call()

        const token0In = result[0] // ARB_FOR
        const token1In = result[1] // ARB_AGAINST
        
        console.log(`Estimated amount of ${_token0.symbol} to buy ${web3.utils.fromWei(actualAmountOut, 'ether')} ${_token1.symbol} on ${exchangeToBuy}\t\t| ${web3.utils.fromWei(token0In, 'ether')}`)
   
        result = await _routerPath[1].methods.getAmountsOut(token1In, [_token1.address, _token0.address]).call()

         console.log(`Estimated amount of ${_token0.symbol} returned after swapping ${_token1.symbol} on ${exchangeToSell}\t| ${web3.utils.fromWei(result[1], 'ether')}\n`)

        const { amountIn, amountOut } = await getEstimatedReturn(token0In, _routerPath, _token0, _token1)

        let ethBalanceBefore = await web3.eth.getBalance(account)
        ethBalanceBefore = web3.utils.fromWei(ethBalanceBefore, 'ether')
        const ethBalanceAfter = ethBalanceBefore - estimatedGasCost

        const amountDifference = amountOut - amountIn
        let wethBalanceBefore = await _token0Contract.methods.balanceOf(account).call()
        wethBalanceBefore = web3.utils.fromWei(wethBalanceBefore, 'ether')

        const wethBalanceAfter = amountDifference + Number(wethBalanceBefore)
        const wethBalanceDifference = wethBalanceAfter - Number(wethBalanceBefore)

        const totalGained = wethBalanceDifference - Number(estimatedGasCost)

        console.log(`    Token0 = ${_token0.symbol}`)

        const data = {
            'ETH Balance Before': ethBalanceBefore,
            'ETH Balance After': ethBalanceAfter,
            'ETH Spent (gas)': estimatedGasCost,
            '-': {},
            'Token0 Balance BEFORE': wethBalanceBefore,
            'Token0 Balance AFTER': wethBalanceAfter,
            'Token0 Gained/Lost': wethBalanceDifference,
            '-': {},
            'Total Gained/Lost': totalGained
        }

        console.table(data)
        console.log()

        // update stats for total # of profit checks done without error
        totalStats.profitCheckCnt++
        pairStats[_pairID].profitCheckCnt++
        pairStats[_pairID].totalCheckProfit = pairStats[_pairID].totalCheckProfit + 
                                                            totalGained
        if (totalGained > pairStats[pairID].highestCheckProfit) {
            pairStats[pairID].highestCheckProfit = Number(totalGained).toFixed(3)
        }
        exchangeStats[sellExchangeID].profitCheckCnt++
        exchangeStats[buyExchangeID].profitCheckCnt++
        exchangeStats[sellExchangeID].totalCheckProfit = 
                        exchangeStats[sellExchangeID].totalCheckProfit + totalGained
        exchangeStats[buyExchangeID].totalCheckProfit = 
                        exchangeStats[buyExchangeID].totalCheckProfit + totalGained

        if (amountOut < amountIn) {
            return false
        }

        amount = token0In

        return true

    } catch (error) {
        // update error stats
        totalStats.errorCnt++
        pairStats[_pairID].errorCnt++
        exchangeStats[buyExchangeID].errorCnt++
        exchangeStats[sellExchangeID].errorCnt++

        profitabilityErrorCnt++
        console.log(error)
        console.log(`\nError occured while trying to determine profitability...\n`)
        console.log(`This can typically happen because an issue with reserves, see README for more information.\n`)
        return false
    }
}

const executeTrade = async (_routerList, _token0Contract, _token1Contract, _token0, _pairID) => {
    console.log(`Attempting Arbitrage...\n`)

    let firstExchange, secondExchange

    // get the indicators of the exchanges to use for the arbitrage
    firstExchange = 2
    if (_routerList[0].name == 'Uniswap' ) {
        firstExchange = 0
    } else if (_routerList[0].name == 'SushiSwap') {
        firstExchange = 1
    }

    secondExchange = 2
    if (_routerList[2].name == 'Uniswap' ) {
        secondExchange = 0
    } else if (_routerList[2].name == 'SushiSwap') {
        secondExchange = 1
    }

    // Fetch token balance before
    const balanceBefore = await _token0Contract.methods.balanceOf(account).call()
    const ethBalanceBefore = await web3.eth.getBalance(account)

    // stats for the trade executed
    totalStats.tradeCnt++
    pairStats[_pairID].tradeCnt++
    exchangeStats[firstExchange].tradeCnt++
    exchangeStats[secondExchange].tradeCnt++

    if (config.PROJECT_SETTINGS.isDeployed) {
        await arbitrage.methods.executeTrade(firstExchange, secondExchange, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })
    } else {
        console.log(`\nNot deployed; trade not executed.\n\n`)
    }

    console.log(`Trade Complete:\n`)

    // stats for successful trades
    pairStats[_pairID].tradeSucc++
    exchangeStats[firstExchange].tradeSucc++
    exchangeStats[secondExchange].tradeSucc++

    // Fetch token balance after
    const balanceAfter = await _token0Contract.methods.balanceOf(account).call()
    const ethBalanceAfter = await web3.eth.getBalance(account)

    const balanceDifference = balanceAfter - balanceBefore
    const totalSpent = ethBalanceBefore - ethBalanceAfter

    runTotalGain = runTotalGain + Number(web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether'))
    runTotalGain = Math.round(runTotalGain * 1000) / 1000
    
    // update stats for profits
    runExecutedTradeCnt++
    if (runTotalGain > 0) {
        totalStats.profits = totalStats.profits + runTotalGain
        pairStats[_pairID].tradeProfits = pairStats[_pairID].tradeProfits + runTotalGain
        exchangeStats[firstExchange].tradeProfits = exchangeStats[firstExchange].tradeProfits + runTotalGain
        exchangeStats[secondExchange].tradeProfits = exchangeStats[secondExchange].tradeProfits + runTotalGain
    }
    
    console.log(`    Token0 = ${_token0.symbol}`)

    const data = {
        'ETH Balance Before': web3.utils.fromWei(ethBalanceBefore, 'ether'),
        'ETH Balance After': web3.utils.fromWei(ethBalanceAfter, 'ether'),
        'ETH Spent (gas)': web3.utils.fromWei((ethBalanceBefore - ethBalanceAfter).toString(), 'ether'),
        '-': {},
        'Token0 Balance BEFORE': web3.utils.fromWei(balanceBefore.toString(), 'ether'),
        'Token0 Balance AFTER': web3.utils.fromWei(balanceAfter.toString(), 'ether'),
        'Token0 Gained/Lost': web3.utils.fromWei(balanceDifference.toString(), 'ether'),
        '-': {},
        'Total Gained/Lost': `${web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether')} ETH`
    }

    console.table(data)
    console.log(``)
    if (!isInitialCheck) {
        outputTotalStats(totalStats)
        outputPairStats(pairStats, totalStats)
        outputExchangeStats(exchangeStats, totalStats)
        console.log(`Waiting for swap event...\n`)
    }
}

main()
