/**********************************************
 * bot-eth.js                                 *
 * An arbitrage bot for the Ethereum network. *
 *                                            *
 * For educational purposes only...           *
 *                   ...use at your own risk! *
 *********************************************/

// -- HANDLE INITIAL SETUP -- //

require('./helpers/server')
require("dotenv").config();
var moment = require('moment');
const config = require('./config.json')

// get helper functions
const { 
        getTokenAndContract, getPairContract, calculatePrice, 
        getEstimatedReturn, getReserves,
        strToDecimal, strRmDecimal,
        outputTotalStats, outputPairStats, outputExchangeStats
    } = require('./helpers/helpers')

// get the initialized Exchange/Token/Contract/Stats info
const { 
    factories, routers, exchangeNames,
    web3, arbitrage,
    exchangesActive, pairsActive,
    ARBFORaddr, arbAgainstAddresses,
    maxPairs, maxExchanges
} = require('./helpers/initialization')

// get the initialized statistics variables
var {totalStats, pairStats, exchangeStats} = require('./helpers/initialization')

// -- .ENV VALUES HERE -- //
const account = process.env.ACCOUNT // Account to recieve profit
const units = process.env.UNITS     // Used for price display/reporting
const difference = process.env.PRICE_DIFFERENCE
const percentToBuy = process.env.PERCENT_TO_BUY
const gas = process.env.GAS_LIMIT
const estimatedGasCost = process.env.GAS_PRICE
const gasCostInArbFor = process.env.EST_GAS_IN_ARBFOR

// -- GLOBALS -- //
let pairID = 0              // indicator for which trading pair we are on (0 .. numPairs-1)
let exchangeID = 0          // indicator for which exchange we are on (0, 1, 2)
let isExecuting = false
let isInitialCheck = false
let timeOfLastStatus = moment()     // to allow auto-output of status every 5 minutes

// exchangePrices will store the price of each token-pair on each exchange
var exchangePrices = []
for (let eID = 0; eID < maxExchanges; eID++) {
    exchangePrices[eID] = {
        name: exchangeNames[eID],
        prices: []
    }
    for (let pID = 0; pID < maxPairs; pID++) {
        exchangePrices[eID].prices[pID] = 0
    }
}

var researchRun = false

// -- MAIN PROGRAM -- //

const main = async () => {
    var args = process.argv;
    var progname, cliOpt1

    args.forEach((val, index) => {
        if (index == 1) {
            progname = val
        }
        else if (index == 2) {
            cliOpt1 = val
        }
    });

    var usageExit = false

    if (cliOpt1 != null) {
        if (cliOpt1 === "--research") {
            researchRun = true
            console.log("")
            console.log(`Beginning Research Mode Run...\n`)
        } else if (cliOpt1 === "--help") {
            usageExit = true
        } else {
            console.log("Unrecognized command line option.")
            usageExit = true
        }
    }
    if (usageExit) {
        console.log("")
        console.log(`usage:  node ${progname} [--help] [--research]\n`)
        console.log(`where:  --help     = this usage message`)
        console.log(`        --research = output pool and reserve info for configured pairs and exit\n\n`)
        process.exit(usageExit)
    }

    var arbForToken
    var arbForTokenContract
    var allPairs = []
    var arbAgainstTokens = []
    var arbAgainstTokenContracts = []

    // Swap event handler function
    const swapEventHandler = async (_exchID, _pairID) => {
    console.log(`event handler called!  eID = ${_exchID}, pID = ${_pairID}`)
        if (!isExecuting) {
            isExecuting = true

            // process this event
            receipt = await processTradeEvent(exchangeNames, _exchID, _pairID,
                                                arbForToken,
                                                arbForTokenContract,
                                                arbAgainstTokens[_pairID],
                                                arbAgainstTokenContracts[_pairID],
                                                allPairs)

            isExecuting = false
        }
    }

    // record startTime for stats
    totalStats.startTime = moment()    // current time as moment object

    // sanity checks
    let numExchanges = 0
    let numPairs = 0
    for (let i = 0; i < 3; i++) {
        if (exchangesActive[i]) {numExchanges++}
    }
    for (let i = 0; i < 5; i++) {
        if (pairsActive[i]) {numPairs++}
        else {break}
    }
    if (numExchanges < 2) {
        console.log("ERROR:  not enough Exchanges defined!  Exiting.")
        process.exit(-1)
    }
    if (numPairs < 1) {
        console.log("ERROR:  not enough Pairs defined!  Exiting.")
        process.exit(-2)
    }

    // get all token information from the blockchain
    var tokenAndContract = await getTokenAndContract(ARBFORaddr)
    arbForToken = tokenAndContract.token
    arbForTokenContract = tokenAndContract.tokenContract

    for (let pID = 0; pID < maxPairs; pID++) {
        if (pairsActive[pID]) {
            tokenAndContract = await getTokenAndContract(arbAgainstAddresses[pID])
            arbAgainstTokens[pID] = tokenAndContract.token
            arbAgainstTokenContracts[pID] = tokenAndContract.tokenContract
            pairStats[pID].symbol = arbAgainstTokens[pID].symbol
        }
    }

    // fill allPairs[] with the DEX contracts for each token-pair
    // IF the exchange is not active, fill it's pair contracts with 'null'
    // If a pair is not active, fill it's contract with 'null' in all
    if (researchRun) {
        console.log(`Looking for configured exchanges and pairs...\n`)
    }
    var exitValue = 0
    var exchPair
    for (let eID = 0; eID < maxExchanges; eID++) {
        // for each exchange ...
        allPairs[eID] = []
        for (let pID = 0; pID < maxPairs; pID++) {
            // for each pair ...
            if (exchangesActive[eID]) {
                // if the exchange is active ...
                if (pairsActive[pID]) {
                    // AND if the pair is active ... get the contract
                    exchPair = await getPairContract(factories[eID], 
                                                            arbForToken.address, 
                                                            arbAgainstTokens[pID].address)
                    if (exchPair === null) {
                        console.log(`ERROR: did not find` +
                                    ` ${arbForToken.symbol}/${arbAgainstTokens[pID].symbol}` +
                                    ` on ${exchangeNames[eID]}.`)
                        exitValue = -3
                    }
                } else {
                    // if the exch is active, but not the pair, set this contract to null
                    exchPair = null
                }
            }
            else {
                // if the exchange is not active, set this contract to null
                exchPair = null
            }
            allPairs[eID][pID] = exchPair
        }
    }

    /* -------------  RESEARCH MODE STUFF  ----------------------------------------
    -------------------------------------------------------------------------------*/
    if (researchRun) {
        var exchangeReserves = []
        // get the data
        for (let eID = 0; eID < maxExchanges; eID++) {
            exchangeReserves[eID] = []
            if (exchangesActive[eID]) {

                for (let pID = 0; pID < maxPairs; pID++) {
                    exchangeReserves[eID][pID] = [0, 0]
                    if (pairsActive[pID]) {
                        // if the pair was found...
                        if (allPairs[eID][pID] != null) {
                            // get current price for the pairs on each exchange
                            exchangePrices[eID].prices[pID] = await calculatePrice(allPairs[eID][pID],
                                                                    arbForToken.decimals,
                                                                    arbAgainstTokens[pID].decimals,
                                                                    arbForToken,
                                                                    arbAgainstTokens[pID])
                            // get reserves for the pairs on each exchange
                            exchangeReserves[eID][pID] = await getReserves(allPairs[eID][pID],
                                                                        arbForToken,
                                                                        arbAgainstTokens[pID])
                        }
                    }
                }
            }
        }
        // output the research data
        console.log(`--------------------------------------------------------------------------------------------------------`)
        console.log(`--------------------------           Research on Token Pair Pools           ----------------------------`)
        console.log(`--------------------------------------------------------------------------------------------------------\n`)

        for (let pID = 0; pID < maxPairs; pID++) {
            if (pairsActive[pID]) {
                console.log(`--------   ${arbForToken.symbol.padEnd(5)}/ ${arbAgainstTokens[pID].symbol.padEnd(5)} Pools   ` +
                            `------------------------------------------------------------------------`)
                for (let eID = 0; eID < maxExchanges; eID++) {
                    if (exchangesActive[eID]) {
                        if (Number(exchangePrices[eID].prices[pID]) > 0) {
                            const fmtPrice = Number(exchangePrices[eID].prices[pID]).toFixed(4)
                            const fmtRes1 = Number(strToDecimal(exchangeReserves[eID][pID][0],
                                                                arbForToken.decimals)).toFixed(4)
                            const fmtRes2 = Number(strToDecimal(exchangeReserves[eID][pID][1],
                                                                arbAgainstTokens[pID].decimals)).toFixed(4)
                            console.log(`   ${exchangeNames[eID].padEnd(15)}:  ` +
                                        `price for 1 ${arbForToken.symbol} = ${fmtPrice}   ` +
                                        `reserves = ${fmtRes1} ${arbForToken.symbol} ` +
                                        `| ${fmtRes2} ${arbAgainstTokens[pID].symbol}]`)
                        } else {
                            console.log(`   ${exchangeNames[eID].padEnd(15)}:  `)
                        }
                    }
                }
                console.log(``)
            }
        }
        console.log(``)

        // done with research mode, exit
        process.exit()
    }

    // Exit gracefully, if any of the configured pairs were not found
    if (exitValue == -3) { process.exit(-3) }

    // Execute a 1-time sweep of the pair prices after start-up
    var receipt
    if (!isExecuting) {
        isExecuting = true
        isInitialCheck = true
        if (exchangesActive[0])         { exchangeID = 0 }      // Uniswap
        else if (exchangesActive[1])    { exchangeID = 1 }      // SushiSwap
        else if (exchangesActive[2])    { exchangeID = 2 }      // ShibaSwap

        for (let pID = 0; pID < maxPairs; pID++) {
            if (pairsActive[pID]) {
                console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstTokens[pID].symbol}...\n`)
                receipt = await processTradeEvent(exchangeNames, exchangeID, pID,
                                                    arbForToken,
                                                    arbForTokenContract,
                                                    arbAgainstTokens[pID],
                                                    arbAgainstTokenContracts[pID],
                                                    allPairs)
            }
        }

        isInitialCheck = false
        isExecuting = false
    }

    /*-------------  Output a summary of the Pair Contracts we will monitor  ----------------
     ----------------------------------------------------------------------------------------*/

    console.log(`------------------------------------------------------------------`)
    console.log(`--------   Token Pair Contracts to Monitor                --------`)
    console.log(`------------------------------------------------------------------\n`)

    for (let pID = 0; pID < maxPairs; pID++) {
        if (pairsActive[pID]) {
            console.log(`--------   ${arbForToken.symbol}/${arbAgainstTokens[pID].symbol}    ------------------------------------------`)
            for (let eID = 0; eID < maxExchanges; eID++) {
                if (exchangesActive[eID]) {
                    console.log(`   ${exchangeNames[eID]} contract:    ${allPairs[eID][pID].options.address}`)
                }
            }
            console.log(``)
        }
    }
    console.log(``)

    /*-------------  Set up the Swap Event Handlers  ----------------------------------------
     ----------------------------------------------------------------------------------------*/
    for (let eID = 0; eID < maxExchanges; eID++) {
        if (exchangesActive[eID]) {
            // exchange is active; set up event handler for active pairs
            for (let pID = 0; pID < maxPairs; pID++) {
                if (pairsActive[pID]) {
                    // pair is active
                    allPairs[eID][pID].events.Swap({}, async () => { swapEventHandler(eID, pID) })
                }
            }
        }
    }

    /*-------------  Output Run Stats  ------------------------------------------------------
     ----------------------------------------------------------------------------------------*/
    outputTotalStats(totalStats)
    outputPairStats(pairStats, totalStats, pairsActive)
    outputExchangeStats(exchangeStats, totalStats, exchangesActive)
    console.log(`${moment().format("h:mm:ss a")}:  ` + `Waiting for swap event...`)
}

// processTradeEvent
//  process a trade event on any exchange for our pairs
//  determine if we can make a trade, and execute the trade if we can
const processTradeEvent = async (_exchangeNames, _exchangeID, _pairID,
                                    _arbForToken,
                                    _arbForTokenContract, 
                                    _arbAgainstToken,
                                    _arbAgainstTokenContract,
                                    _allPairs) => {

    // update stats
    totalStats.numEvents++
    pairStats[_pairID].numEvents++
    exchangeStats[_exchangeID].numEvents++

    // determine the exchange to buy on, and to sell on, for profit
    // Note: routerPath is a list of all routers, ordered from high to low price of the pair
    const routerPath = await deterimineRouterPath(_exchangeNames, _exchangeID, _pairID,
                                                    _arbForToken, 
                                                    _arbAgainstToken,
                                                    _allPairs)

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
            outputPairStats(pairStats, totalStats, pairsActive)
            outputExchangeStats(exchangeStats, totalStats, exchangesActive)
            console.log(`${moment().format("h:mm:ss a")}:  ` + `Waiting for swap event...\n`)

            timeOfLastStatus = currentTime
        }
        return
    }

    const flashLoanAmount = await determineProfitability(
                                                routerPath, 
                                                _arbForTokenContract, 
                                                _arbForToken, 
                                                _arbAgainstToken,
                                                _pairID)

    if (flashLoanAmount === 0) {
        console.log(`Transaction not profitable.\nNo Arbitrage Currently Available`)
     
        if (!isInitialCheck) { 
            outputTotalStats(totalStats)
            outputPairStats(pairStats, totalStats, pairsActive)
            outputExchangeStats(exchangeStats, totalStats, exchangesActive)
            console.log(`${moment().format("h:mm:ss a")}:  ` + `Waiting for swap event...\n`)
        }
        return
    }

    const receipt = await executeTrade(
                                    routerPath, 
                                    _arbForTokenContract, 
                                    _arbAgainstTokenContract, 
                                    _arbForToken,
                                    _pairID,
                                    flashLoanAmount)

    return receipt
}

// determineRouterPath
// determine the exchange to buy on, and to sell on, for profit
// Return Value:
//   Array of routers, ordered from high to low price of the pair, OR
//   null   (if the price difference did not meet the threshold)
const deterimineRouterPath = async (exchangeNames, exchangeID, pairID,
                                    _arbForToken, _arbAgainstToken, allPairs) => {
    isExecuting = true

    if (!isInitialCheck) {
        console.log(`${moment().format("h:mm:ss a")}:  ` +
                    `Swap Initiated on ${exchangeNames[exchangeID]} for ${_arbAgainstToken.symbol}; ` +
                    `looking for arbitrage...`)
    }
    const currentBlock = await web3.eth.getBlockNumber()

    // handle different decimal precisions
    const decimalsFor = _arbForToken.decimals
    const decimalsAgainst = _arbAgainstToken.decimals
    console.log(`decimals for ${_arbForToken.symbol} = ${decimalsFor}`)
    console.log(`decimals for ${_arbAgainstToken.symbol} = ${decimalsAgainst}`)

    // get the price of the pair on the exchange which triggered the trade.
    // also, get the price of any pair which is currently 0
    for (let eID = 0; eID < maxExchanges; eID++) {
        if ( 
                (eID === exchangeID)
                    ||
                ( (exchangesActive[eID]) && (exchangePrices[eID].prices[pairID] === 0) )
            ) {
                console.log(`getting price on ${exchangeNames[eID]} for pairID ${pairID}`)
                exchangePrices[eID].prices[pairID] = await calculatePrice(allPairs[eID][pairID], 
                                                                    decimalsFor, 
                                                                    decimalsAgainst, 
                                                                    _arbForToken, 
                                                                    _arbAgainstToken)
        }
    }

    var prices = []
    var priceRouters = []

    // first create a list of all exchange routers and their price for this pair
    for (let eID = 0; eID < maxExchanges; eID++) {
        prices[eID] = exchangePrices[eID].prices[pairID]
        priceRouters[eID] = {
            exchangeID: eID,
            name: exchangeNames[eID],
            price: prices[eID],
            router: routers[eID],
            pair: allPairs[eID][pairID]
        }
    }

    // sort the Routers by price, descending
    priceRouters.sort((a, b) => {
        return b.price - a.price
    })

    var maxPrice, minPrice, maxExchangeID, minExchangeID

    // find the min/max exchange prices (there could be prices of 0, for inactive exchanges)
    maxPrice = priceRouters[0].price 
    maxExchangeID = priceRouters[0].exchangeID
    for (let eID = maxExchanges-1; eID > 0; eID--) {
        if (priceRouters[eID].price > 0) {
            minPrice = priceRouters[eID].price 
            minExchangeID = priceRouters[eID].exchangeID
            break
        }
    }

    // for any exchange prices of 0, we need to change its price so it will not be 
    // low or high (make it in the middle)
    for (let eID = maxExchanges-1; eID > 0; eID--) {
        if (priceRouters[eID].price === 0) {
            priceRouters[eID].price = (Number(minPrice) + Number(maxPrice)) / 2
        }
        else {
            break
        }
    }

    // Now re-sort the Routers by price, descending.  Max will be first, min will be last.
    priceRouters.sort((a, b) => {
        return b.price - a.price
    })

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
        console.log(`Buy on  ${exchangeNames[maxExchangeID]}: ` +
                    ` ${_arbAgainstToken.symbol}/${_arbForToken.symbol}\t price = ${maxPrice}`)
        console.log(`Sell on ${exchangeNames[minExchangeID]}: ` +
                    ` ${_arbAgainstToken.symbol}/${_arbForToken.symbol}\t price = ${minPrice}\n`)
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

// determineProfitability
// Determines whether the trade will actually be profitable, based on prices and reserve
// amounts and the cost of gas.
// Return Value:
//    The amount of the flashloan needed, OR 0 if not profitable
const determineProfitability = async (_routerList, 
                                        _arbForTokenContract, 
                                        _arbForToken, 
                                        _arbAgainstToken,
                                        _pairID) => {

    console.log(`Determining Profitability...\n`)

    // This is where you can customize your conditions on whether a profitable trade is possible.
    // This is a basic example of trading WETH/SHIB...

    let reservesOnBuyDex, reservesOnSellDex, exchangeToBuy, exchangeToSell, actualAmountOut

///////////////////////////////////////////////////////////////////////////////////////
//
//        SDW:  NEED TO FIX THIS NOT TO USE HARD-CODED 0 AND 2 !!!
//
///////////////////////////////////////////////////////////////////////////////////////
    const _routerPath = [_routerList[0].router, _routerList[2].router ]

    decimalsFor = _arbForToken.decimals
    decimalsAgainst = _arbAgainstToken.decimals
    reservesOnBuyDex = await getReserves(_routerList[0].pair, _arbForToken, _arbAgainstToken)
    reservesOnSellDex = await getReserves(_routerList[2].pair, _arbForToken, _arbAgainstToken)

    exchangeToBuy = _routerList[0].name
    exchangeToSell = _routerList[2].name
    
    // set the exchange ID for the exchanges (for stats)
    let buyExchangeID = 0   // default to Uniswap
    if (exchangeToBuy == 'SushiSwap') {buyExchangeID = 1}
    else if (exchangeToBuy == 'ShibaSwap') {buyExchangeID = 2}
    let sellExchangeID = 0   // default to Uniswap
    if (exchangeToSell == 'SushiSwap') {sellExchangeID = 1}
    else if (exchangeToSell == 'ShibaSwap') {sellExchangeID = 2}

    console.log(`Reserves of (${_arbAgainstToken.symbol} ${decimalsAgainst}) on ${exchangeToBuy}:  ${reservesOnBuyDex[1]}`)
    console.log(`Reserves of (${_arbAgainstToken.symbol} ${decimalsAgainst}) on ${exchangeToSell}:  ${reservesOnSellDex[1]}`)

    let arbAgainstReservesOnBuyDex = strToDecimal(reservesOnBuyDex[1].toString(), decimalsAgainst)
    let arbAgainstReservesOnSellDex = strToDecimal(reservesOnSellDex[1].toString(), decimalsAgainst)

    console.log(`arbAgainstReservesOnBuyDex:  ${arbAgainstReservesOnBuyDex}`)
    console.log(`arbAgainstReservesOnSellDex: ${arbAgainstReservesOnSellDex}`)

    if (Number(arbAgainstReservesOnSellDex) > Number(arbAgainstReservesOnBuyDex)) {
        // More reserves on Sell side than exist on Buy side; use Buy side amount
        actualAmountOut = strRmDecimal((arbAgainstReservesOnBuyDex * percentToBuy), decimalsAgainst)
    } else {
        // More reserves on Buy side, so we can use Sell side amount
        actualAmountOut = strRmDecimal((arbAgainstReservesOnSellDex * percentToBuy), decimalsAgainst)
    }

    console.log(`actualAmountOut = ${actualAmountOut}`)

    try {

        // This returns the amount of ArbFor needed from the flash loan, to buy enough ArbAgainst in the 1st trade 
        let result = await _routerPath[0].methods.getAmountsIn(actualAmountOut, [_arbForToken.address, _arbAgainstToken.address]).call()

        const token0In = result[0] // ARB_FOR
        const token1In = result[1] // ARB_AGAINST
        
        console.log(`Estimated amount of ${_arbForToken.symbol} to buy ${strToDecimal(actualAmountOut, decimalsAgainst)} ${_arbAgainstToken.symbol} on ${exchangeToBuy}\t\t| ${strToDecimal(token0In, decimalsFor)}`)

        result = await _routerPath[1].methods.getAmountsOut(token1In, [_arbAgainstToken.address, _arbForToken.address]).call()

        console.log(`Estimated amount of ${_arbForToken.symbol} returned after swapping ${_arbAgainstToken.symbol} on ${exchangeToSell}\t| ${strToDecimal(result[1], decimalsFor)}\n`)

        const { amountIn, amountOut } = await getEstimatedReturn(token0In, _routerPath, _arbForToken, _arbAgainstToken)

        let ethBalanceBefore = await web3.eth.getBalance(account)
        ethBalanceBefore = web3.utils.fromWei(ethBalanceBefore, 'ether')
        const ethBalanceAfter = ethBalanceBefore - estimatedGasCost

        const amountDifference = amountOut - amountIn
        let arbForBalanceBefore = await _arbForTokenContract.methods.balanceOf(account).call()
        arbForBalanceBefore = strToDecimal(arbForBalanceBefore, decimalsFor)

        const arbForBalanceAfter = amountDifference + Number(arbForBalanceBefore)
        const arbForBalanceDifference = arbForBalanceAfter - Number(arbForBalanceBefore)

        const totalGained = arbForBalanceDifference - gasCostInArbFor

        console.log(`    ArbFor = ${_arbForToken.symbol}`)

        const data = {
            'ETH Balance Before': ethBalanceBefore,
            'ETH Balance After': ethBalanceAfter,
            'ETH Spent (gas)': estimatedGasCost,
            'Gas cost in ArbFor': gasCostInArbFor,
            '-': {},
            'ArbFor Balance BEFORE': arbForBalanceBefore,
            'ArbFor Balance AFTER': arbForBalanceAfter,
            'ArbFor Gained/Lost': arbForBalanceDifference,
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
        if (totalGained > pairStats[_pairID].highestCheckProfit) {
            pairStats[_pairID].highestCheckProfit = Number(totalGained).toFixed(3)
        }
        exchangeStats[sellExchangeID].profitCheckCnt++
        exchangeStats[buyExchangeID].profitCheckCnt++
        exchangeStats[sellExchangeID].totalCheckProfit = 
                        exchangeStats[sellExchangeID].totalCheckProfit + totalGained
        exchangeStats[buyExchangeID].totalCheckProfit = 
                        exchangeStats[buyExchangeID].totalCheckProfit + totalGained

        // profit must be 2x the cost in gas fees, otherwise not profitable enough
        if ( (amountOut - amountIn) < (gasCostInArbFor * 2) ) {
            return 0
        }

        // if we get here, we are profitable; return token0In as the flashloan amount
        return token0In

    } catch (error) {
        // update error stats
        totalStats.errorCnt++
        pairStats[_pairID].errorCnt++
        exchangeStats[buyExchangeID].errorCnt++
        exchangeStats[sellExchangeID].errorCnt++

        console.log(error)
        console.log(`\nError occured while trying to determine profitability...\n`)
        console.log(`This can typically happen because an issue with reserves, see README for more information.\n`)
        return 0
    }
}

// executeTrade
// Routine to call the arbitrage smart contract to execute the trades.
// Return Value:  None.   (Should return some kind of receipt??)
const executeTrade = async (_routerList, 
                            _arbForTokenContract, 
                            _arbAgainstTokenContract, 
                            _arbForToken, 
                            _pairID,
                            _flashLoanAmount) => {
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

    const decimalsFor = _arbForToken.decimals

    // Fetch token balance before
    const balanceBefore = await _arbForTokenContract.methods.balanceOf(account).call()
    const ethBalanceBefore = await web3.eth.getBalance(account)

    // stats for the trade executed
    totalStats.tradeCnt++
    pairStats[_pairID].tradeCnt++
    exchangeStats[firstExchange].tradeCnt++
    exchangeStats[secondExchange].tradeCnt++

    if (config.PROJECT_SETTINGS.isDeployed) {
        await arbitrage.methods.executeTrade(firstExchange, secondExchange, _arbForTokenContract._address, _arbAgainstTokenContract._address, _flashLoanAmount).send({ from: account, gas: gas })
    } else {
        console.log(`\nNot deployed; trade not executed.\n\n`)
    }

    console.log(`Trade Complete:\n`)

    // stats for successful trades
    pairStats[_pairID].tradeSucc++
    exchangeStats[firstExchange].tradeSucc++
    exchangeStats[secondExchange].tradeSucc++

    // Fetch token balance after
    const balanceAfter = await _arbForTokenContract.methods.balanceOf(account).call()
    const ethBalanceAfter = await web3.eth.getBalance(account)

    const arbForBalanceDifference = balanceAfter - balanceBefore
    const totalEthSpent = ethBalanceBefore - ethBalanceAfter

    let tradeTotalGain = Number(strToDecimal(arbForBalanceDifference, decimalsFor)) - gasCostInArbFor
    tradeTotalGain = Math.round(tradeTotalGain * 1000) / 1000
    
    // update stats for profits
    if (tradeTotalGain > 0) {
        totalStats.profits = totalStats.profits + tradeTotalGain
        pairStats[_pairID].tradeProfits = pairStats[_pairID].tradeProfits + tradeTotalGain
        exchangeStats[firstExchange].tradeProfits = exchangeStats[firstExchange].tradeProfits + tradeTotalGain
        exchangeStats[secondExchange].tradeProfits = exchangeStats[secondExchange].tradeProfits + tradeTotalGain
    }
    
    console.log(`    ArbFor = ${_arbForToken.symbol}`)

    const data = {
        'ETH Balance Before': web3.utils.fromWei(ethBalanceBefore, 'ether'),
        'ETH Balance After': web3.utils.fromWei(ethBalanceAfter, 'ether'),
        'ETH Spent (gas)': web3.utils.fromWei((ethBalanceBefore - ethBalanceAfter).toString(), 'ether'),
        'Gas cost in ArbFor': gasCostInArbFor,
        '-': {},
        'ArbFor Balance BEFORE': strToDecimal(balanceBefore.toString(), decimalsFor),
        'ArbFor Balance AFTER': strToDecimal(balanceAfter.toString(), decimalsFor),
        'ArbFor Gained/Lost': strToDecimal(arbForBalanceDifference.toString(), decimalsFor),
        '-': {},
        'Total Gained/Lost': `${strToDecimal(arbForBalanceDifference, decimalsFor) - gasCostInArbFor}`
    }

    console.table(data)
    console.log(``)
    if (!isInitialCheck) {
        outputTotalStats(totalStats)
        outputPairStats(pairStats, totalStats, pairsActive)
        outputExchangeStats(exchangeStats, totalStats, exchangesActive)
        console.log(`${moment().format("h:mm:ss a")}:  ` + `Waiting for swap event...\n`)
    }
}

main()
