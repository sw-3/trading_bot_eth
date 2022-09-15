require("dotenv").config();
const config = require("../config.json")

var moment = require('moment');
const Big = require('big.js');
const Web3 = require('web3');
let web3

const url = ''
const percentToBuy = process.env.PERCENT_TO_BUY
const diffSetting = process.env.PRICE_DIFFERENCE
const estimatedGasCost = process.env.GAS_PRICE

if (!config.PROJECT_SETTINGS.isLocal) {
    web3 = new Web3(`wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`)
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

const { ChainId, Token } = require("@uniswap/sdk")
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json")
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json')

let numPairs = 5            // set this to the number of token-pairs we are monitoring
let numExchanges = 3        // set this to the number of exchanges we are monitoring

async function getTokenAndContract(_arbForTokenAddr, 
                                    _arbAgainstToken1Addr,
                                    _arbAgainstToken2Addr,
                                    _arbAgainstToken3Addr,
                                    _arbAgainstToken4Addr,
                                    _arbAgainstToken5Addr) 
{
    const arbForTokenContract = new web3.eth.Contract(IERC20.abi, _arbForTokenAddr)
    const arbAgainstToken1Contract = new web3.eth.Contract(IERC20.abi, _arbAgainstToken1Addr)
    const arbAgainstToken2Contract = new web3.eth.Contract(IERC20.abi, _arbAgainstToken2Addr)
    const arbAgainstToken3Contract = new web3.eth.Contract(IERC20.abi, _arbAgainstToken3Addr)
    const arbAgainstToken4Contract = new web3.eth.Contract(IERC20.abi, _arbAgainstToken4Addr)
    const arbAgainstToken5Contract = new web3.eth.Contract(IERC20.abi, _arbAgainstToken5Addr)

    const arbForToken = new Token(
        ChainId.MAINNET,
        _arbForTokenAddr,
        18,
        await arbForTokenContract.methods.symbol().call(),
        await arbForTokenContract.methods.name().call()
    )
    const arbAgainstToken1 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken1Addr,
        18,
        await arbAgainstToken1Contract.methods.symbol().call(),
        await arbAgainstToken1Contract.methods.name().call()
    )
    const arbAgainstToken2 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken2Addr,
        18,
        await arbAgainstToken2Contract.methods.symbol().call(),
        await arbAgainstToken2Contract.methods.name().call()
    )
    const arbAgainstToken3 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken3Addr,
        18,
        await arbAgainstToken3Contract.methods.symbol().call(),
        await arbAgainstToken3Contract.methods.name().call()
    )
    const arbAgainstToken4 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken4Addr,
        18,
        await arbAgainstToken4Contract.methods.symbol().call(),
        await arbAgainstToken4Contract.methods.name().call()
    )
    const arbAgainstToken5 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken5Addr,
        18,
        await arbAgainstToken5Contract.methods.symbol().call(),
        await arbAgainstToken5Contract.methods.name().call()
    )

    return { arbForToken, arbForTokenContract,
                arbAgainstToken1, arbAgainstToken1Contract,
                arbAgainstToken2, arbAgainstToken2Contract,
                arbAgainstToken3, arbAgainstToken3Contract,
                arbAgainstToken4, arbAgainstToken4Contract,
                arbAgainstToken5, arbAgainstToken5Contract }
}

async function getPairAddress(_V2Factory, _token0, _token1) {
    const pairAddress = await _V2Factory.methods.getPair(_token0, _token1).call()
    return pairAddress
}

async function getPairContract(_V2Factory, _token0, _token1) {
    const pairAddress = await getPairAddress(_V2Factory, _token0, _token1)
    const pairContract = new web3.eth.Contract(IUniswapV2Pair.abi, pairAddress)
    return pairContract
}

async function getReserves(_pairContract) {
    const reserves = await _pairContract.methods.getReserves().call()
    return [reserves.reserve0, reserves.reserve1]
}

async function calculatePrice(_pairContract) {
    const [reserve0, reserve1] = await getReserves(_pairContract)
    // avoid a divide-by-0 error here
    if (reserve1 !== 0) {
        return Big(reserve0).div(Big(reserve1)).toString()
    } else {
        console.log(`\n   ... Avoiding divide-by-zero; returning a price of 0...\n`)
        return(0)
    }
}

function calculateDifference(uPrice, sPrice) {
    return (((uPrice - sPrice) / sPrice) * 100).toFixed(2)
}

async function getEstimatedReturn(amount, _routerPath, _token0, _token1) {
    const trade1 = await _routerPath[0].methods.getAmountsOut(amount, [_token0.address, _token1.address]).call()
    const trade2 = await _routerPath[1].methods.getAmountsOut(trade1[1], [_token1.address, _token0.address]).call()

    const amountIn = Number(web3.utils.fromWei(trade1[0], 'ether'))
    const amountOut = Number(web3.utils.fromWei(trade2[1], 'ether'))

    return { amountIn, amountOut }
}

// ----------------------------------------------------------
// Statistics Output Functions
// ----------------------------------------------------------

function outputTotalStats(totalStats) {
    // set up statistics output helper constants
    const parOpen = '('
    const percentClose = '%)'

    // set up the current Run Time
    const diffTime = moment().diff(totalStats.startTime)           // miliseconds since startTime until now
    const dateDiffTime = moment(diffTime + 21600000)    // add 6 hours for local time, in miliseconds
    const diffTimeArray = dateDiffTime.toArray()        // capture run time as a Date/Time, in an array
    const runDays = diffTimeArray[2] - 1                // subtract 1 since Date format starts at Jan 1
    const runHours = diffTimeArray[3]                   // capture hours we have run
    const runMins = diffTimeArray[4]                    // capture minutes we have run
    const runSecs = diffTimeArray[5]                    // capture seconds we have run
    const runTimeString =   runDays.toString() + 'd ' +
                            runHours.toString() + 'h ' +
                            runMins.toString() + 'm ' +
                            runSecs.toString() + 's'

    // update percentages with current values
    totalStats.priceDiffMetPct = totalStats.priceDiffMet / totalStats.numEvents * 100
    totalStats.profitCheckCntPct = totalStats.profitCheckCnt / totalStats.priceDiffMet * 100
    totalStats.errorCntPct = totalStats.errorCnt / totalStats.priceDiffMet * 100
    totalStats.tradeCntPct = totalStats.tradeCnt / totalStats.profitCheckCnt * 100

    console.log(`\n`)
    console.log(`                    --------------------------------------------------------------------`)
    console.log(`                                          CURRENT RUN STATISTICS        ${runTimeString}     `)
    console.log(`                                                                     Est. Gas:  ${estimatedGasCost} `)
    console.log(`                                 Num                     Num                            `)
    console.log(`                       Num      Price        Num        Profit       Num        Total   `)
    console.log(`                      Events    Diffs       Errors      Checks      Trades     Profits  `)
    console.log(`                      ------    ------      ------      ------      ------     -------  `)
    console.log(`                      ${(totalStats.numEvents).toString().padEnd(10)}` +
                `${(totalStats.priceDiffMet).toString()}` + parOpen +
                `${(totalStats.priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(totalStats.errorCnt).toString()}` + parOpen +
                `${(totalStats.errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(totalStats.profitCheckCnt).toString()}` + parOpen +
                `${(totalStats.profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(totalStats.tradeCnt).toString()}` + parOpen +
                `${(totalStats.tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(totalStats.profits).toString()}`)
    console.log(`                    --------------------------------------------------------------------`)
    console.log(`\n`)
}

function outputPairStats(pairStats, totalStats) {
    // set up statistics output helper constants
    const parOpen = '('
    const percentClose = '%)'

    // update percentages with current values
    for (let pairID = 0; pairID < numPairs; pairID++) {
        pairStats[pairID].priceDiffMetPct = pairStats[pairID].priceDiffMet / totalStats.numEvents * 100
        if (totalStats.errorCnt > 0) {
            pairStats[pairID].errorCntPct = pairStats[pairID].errorCnt / totalStats.errorCnt * 100
        } else {
            pairStats[pairID].errorCntPct = 0
        }
        pairStats[pairID].profitCheckCntPct = pairStats[pairID].profitCheckCnt / totalStats.profitCheckCnt * 100
        pairStats[pairID].tradeCntPct = pairStats[pairID].tradeCnt / totalStats.tradeCnt * 100
        pairStats[pairID].tradeSuccPct = pairStats[pairID].tradeSucc / pairStats[pairID].tradeCnt * 100
        pairStats[pairID].avgCheckProfit = pairStats[pairID].totalCheckProfit / pairStats[pairID].profitCheckCnt
        pairStats[pairID].avgTradeProfit = pairStats[pairID].tradeProfits / pairStats[pairID].tradeSucc
        pairStats[pairID].avgPriceDiff = pairStats[pairID].totalPriceDiffAmt / pairStats[pairID].numEvents
    }

    console.log(`------------------------------------------------------------------------------------------------------------------`)
    console.log(`                                            CURRENT PAIR STATISTICS                Min Price Difference:  ${diffSetting}% `)
    console.log(`                                                                                                                   `)
    console.log(`                    Num     Price                    Num         Avg        Num       Num                   Avg    `)
    console.log(`          Num      Price    Diff         Num        Profit       Est.      Attmpt    Actual     Trade      Trade   `)
    console.log(`Token    Events    Diffs   Avg/High     Errors      Checks      Profit     Trades    Trades     Profit     Profit  `)
    console.log(`-----    ------    ------  --------     ------      ------      ------     ------    ------     ------     ------  `)
    // log for pair1
    console.log(`${(pairStats[0].symbol).padEnd(9)}` +
                `${(pairStats[0].numEvents).toString().padEnd(10)}` +
                `${(pairStats[0].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[0].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[0].avgPriceDiff).toFixed(2).toString()}/${(pairStats[0].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[0].errorCnt).toString()}` + parOpen +
                `${(pairStats[0].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[0].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[0].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[0].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(pairStats[0].tradeCnt).toString()}` + parOpen +
                `${(pairStats[0].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[0].tradeSucc).toString()}` + parOpen +
                `${(pairStats[0].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[0].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[0].avgTradeProfit).toFixed(2).toString()}`)
    // log for pair2
    console.log(`${(pairStats[1].symbol).padEnd(9)}` +
                `${(pairStats[1].numEvents).toString().padEnd(10)}` +
                `${(pairStats[1].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[1].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[1].avgPriceDiff).toFixed(2).toString()}/${(pairStats[1].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[1].errorCnt).toString()}` + parOpen +
                `${(pairStats[1].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[1].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[1].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[1].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(pairStats[1].tradeCnt).toString()}` + parOpen +
                `${(pairStats[1].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[1].tradeSucc).toString()}` + parOpen +
                `${(pairStats[1].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[1].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[1].avgTradeProfit).toFixed(2).toString()}`)
    // log for pair3
    console.log(`${(pairStats[2].symbol).padEnd(9)}` +
                `${(pairStats[2].numEvents).toString().padEnd(10)}` +
                `${(pairStats[2].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[2].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[2].avgPriceDiff).toFixed(2).toString()}/${(pairStats[2].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[2].errorCnt).toString()}` + parOpen +
                `${(pairStats[2].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[2].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[2].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[2].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(pairStats[2].tradeCnt).toString()}` + parOpen +
                `${(pairStats[2].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[2].tradeSucc).toString()}` + parOpen +
                `${(pairStats[2].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[2].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[2].avgTradeProfit).toFixed(2).toString()}`)
    // log for pair4
    console.log(`${(pairStats[3].symbol).padEnd(9)}` +
                `${(pairStats[3].numEvents).toString().padEnd(10)}` +
                `${(pairStats[3].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[3].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[3].avgPriceDiff).toFixed(2).toString()}/${(pairStats[3].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[3].errorCnt).toString()}` + parOpen +
                `${(pairStats[3].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[3].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[3].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[3].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(pairStats[3].tradeCnt).toString()}` + parOpen +
                `${(pairStats[3].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[3].tradeSucc).toString()}` + parOpen +
                `${(pairStats[3].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[3].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[3].avgTradeProfit).toFixed(2).toString()}`)
    // log for pair5
    console.log(`${(pairStats[4].symbol).padEnd(9)}` +
                `${(pairStats[4].numEvents).toString().padEnd(10)}` +
                `${(pairStats[4].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[4].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[4].avgPriceDiff).toFixed(2).toString()}/${(pairStats[4].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[4].errorCnt).toString()}` + parOpen +
                `${(pairStats[4].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[4].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[4].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(pairStats[4].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(pairStats[4].tradeCnt).toString()}` + parOpen +
                `${(pairStats[4].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[4].tradeSucc).toString()}` + parOpen +
                `${(pairStats[4].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[4].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[4].avgTradeProfit).toFixed(2).toString()}`)
    console.log(`------------------------------------------------------------------------------------------------------------------`)
    console.log(``)
}

function outputExchangeStats(exchangeStats, totalStats) {
    // set up statistics output helper constants
    const parOpen = '('
    const percentClose = '%)'

    // update percentages with current values
    for (let exchangeID = 0; exchangeID < numExchanges; exchangeID++) {
        exchangeStats[exchangeID].highPriceCntPct = exchangeStats[exchangeID].highPriceCnt / 
                                                        exchangeStats[exchangeID].priceDiffMet * 100
        exchangeStats[exchangeID].lowPriceCntPct = exchangeStats[exchangeID].lowPriceCnt / 
                                                        exchangeStats[exchangeID].priceDiffMet * 100
        if (totalStats.errorCnt > 0) {
            exchangeStats[exchangeID].errorCntPct = exchangeStats[exchangeID].errorCnt / totalStats.errorCnt * 100
        } else {
            exchangeStats[exchangeID].errorCntPct = 0
        }
        exchangeStats[exchangeID].profitCheckCntPct = 
                        exchangeStats[exchangeID].profitCheckCnt / totalStats.profitCheckCnt * 100
        exchangeStats[exchangeID].tradeCntPct = exchangeStats[exchangeID].tradeCnt / totalStats.tradeCnt * 100
        exchangeStats[exchangeID].tradeSuccPct = exchangeStats[exchangeID].tradeSucc / 
                                                            exchangeStats[exchangeID].tradeCnt * 100
        exchangeStats[exchangeID].avgCheckProfit = exchangeStats[exchangeID].totalCheckProfit /
                                                            exchangeStats[exchangeID].profitCheckCnt
        exchangeStats[exchangeID].avgTradeProfit = exchangeStats[exchangeID].tradeProfits / 
                                                            exchangeStats[exchangeID].tradeSucc
    }

    console.log(`--------------------------------------------------------------------------------------------------------------------`)
    console.log(`                                         CURRENT EXCHANGE STATISTICS                Amount of Reserve to Buy:  ${(percentToBuy*100).toFixed(0)}% `)
    console.log(`                                                                                                                    `)
    console.log(`                   Low       High                    Num         Avg        Num       Num                   Avg     `)
    console.log(`           Num    Price      Price       Num        Profit       Est.      Attmpt    Actual     Trade      Trade    `)
    console.log(`Exchange  Events  Count      Count      Errors      Checks      Profit     Trades    Trades     Profit     Profit   `)
    console.log(`--------  ------  -----      -----      ------      ------      ------     ------    ------     ------     ------   `)
    // log for exchange1
    console.log(`${(exchangeStats[0].name).padEnd(10)}` +
                `${(exchangeStats[0].numEvents).toString().padEnd(7)}` +
                `${(exchangeStats[0].lowPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[0].lowPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[0].highPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[0].highPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[0].errorCnt).toString()}` + parOpen +
                `${(exchangeStats[0].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[0].profitCheckCnt).toString()}` + parOpen +
                `${(exchangeStats[0].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[0].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(exchangeStats[0].tradeCnt).toString()}` + parOpen +
                `${(exchangeStats[0].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(exchangeStats[0].tradeSucc).toString()}` + parOpen +
                `${(exchangeStats[0].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(exchangeStats[0].tradeProfits).toString().padEnd(11)}` +
                `${(exchangeStats[0].avgTradeProfit).toFixed(2).toString()}`)
    // log for exchange2
    console.log(`${(exchangeStats[1].name).padEnd(10)}` +
                `${(exchangeStats[1].numEvents).toString().padEnd(7)}` +
                `${(exchangeStats[1].lowPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[1].lowPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[1].highPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[1].highPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[1].errorCnt).toString()}` + parOpen +
                `${(exchangeStats[1].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[1].profitCheckCnt).toString()}` + parOpen +
                `${(exchangeStats[1].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[1].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(exchangeStats[1].tradeCnt).toString()}` + parOpen +
                `${(exchangeStats[1].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(exchangeStats[1].tradeSucc).toString()}` + parOpen +
                `${(exchangeStats[1].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(exchangeStats[1].tradeProfits).toString().padEnd(11)}` +
                `${(exchangeStats[1].avgTradeProfit).toFixed(2).toString()}`)
    // log for exchange3
    console.log(`${(exchangeStats[2].name).padEnd(10)}` +
                `${(exchangeStats[2].numEvents).toString().padEnd(7)}` +
                `${(exchangeStats[2].lowPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[2].lowPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[2].highPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[2].highPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[2].errorCnt).toString()}` + parOpen +
                `${(exchangeStats[2].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[2].profitCheckCnt).toString()}` + parOpen +
                `${(exchangeStats[2].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[2].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(exchangeStats[2].tradeCnt).toString()}` + parOpen +
                `${(exchangeStats[2].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(exchangeStats[2].tradeSucc).toString()}` + parOpen +
                `${(exchangeStats[2].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(exchangeStats[2].tradeProfits).toString().padEnd(11)}` +
                `${(exchangeStats[2].avgTradeProfit).toFixed(2).toString()}`)
    console.log(`--------------------------------------------------------------------------------------------------------------------`)
    console.log(`\n`)
}

module.exports = {
    getTokenAndContract,
    getPairAddress,
    getPairContract,
    getReserves,
    calculatePrice,
    calculateDifference,
    getEstimatedReturn,
    outputTotalStats,
    outputPairStats,
    outputExchangeStats
}
