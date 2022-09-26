require("dotenv").config();
const config = require("../config.json")
//const HDWalletProvider = require("@truffle/hdwallet-provider");

var moment = require('moment');
const Big = require('big.js');
//const Web3 = require('web3');
//let web3

const url = ''
const percentToBuy = process.env.PERCENT_TO_BUY
const diffSetting = process.env.PRICE_DIFFERENCE
const estimatedGasCost = process.env.GAS_PRICE

//if (!config.PROJECT_SETTINGS.isLocal) {
//    web3 = new Web3(`wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`)
//} else {
//    web3 = new Web3('ws://127.0.0.1:7545')
//}

// get the web3 connection
const { web3 } = require('./initialization')

//if (!config.PROJECT_SETTINGS.isLocal) {
//    const provider = new HDWalletProvider({
//        privateKeys: [process.env.PRIVATE_KEY],
//        providerOrUrl: `wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`
//    })
//    web3 = new Web3(provider)
//} else {
//    web3 = new Web3('ws://127.0.0.1:7545')
//}

const { ChainId, Token } = require("@uniswap/sdk")
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json")
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json')

/********************   COMMENTED OUT   ****************************************************
    I don't like this mammoth helper with 6 inputs and 12 outputs!
    simplify and call multiple times..

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
        await arbForTokenContract.methods.decimals().call(),
        await arbForTokenContract.methods.symbol().call(),
        await arbForTokenContract.methods.name().call()
    )
    const arbAgainstToken1 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken1Addr,
        await arbAgainstToken1Contract.methods.decimals().call(),
        await arbAgainstToken1Contract.methods.symbol().call(),
        await arbAgainstToken1Contract.methods.name().call()
    )
    const arbAgainstToken2 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken2Addr,
        await arbAgainstToken2Contract.methods.decimals().call(),
        await arbAgainstToken2Contract.methods.symbol().call(),
        await arbAgainstToken2Contract.methods.name().call()
    )
    const arbAgainstToken3 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken3Addr,
        await arbAgainstToken3Contract.methods.decimals().call(),
        await arbAgainstToken3Contract.methods.symbol().call(),
        await arbAgainstToken3Contract.methods.name().call()
    )
    const arbAgainstToken4 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken4Addr,
        await arbAgainstToken4Contract.methods.decimals().call(),
        await arbAgainstToken4Contract.methods.symbol().call(),
        await arbAgainstToken4Contract.methods.name().call()
    )
    const arbAgainstToken5 = new Token(
        ChainId.MAINNET,
        _arbAgainstToken5Addr,
        await arbAgainstToken5Contract.methods.decimals().call(),
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
****************  END COMMENTED OUT   ***************************************************/

async function getTokenAndContract(_tokenAddr) {

    const _tokenContract = new web3.eth.Contract(IERC20.abi, _tokenAddr)

    return { 
        token: new Token(
            ChainId.MAINNET,
            _tokenAddr,
            await _tokenContract.methods.decimals().call(),
            await _tokenContract.methods.symbol().call(),
            await _tokenContract.methods.name().call()
        ), 
        tokenContract: _tokenContract 
    }
} 

async function getPairAddress(_V2Factory, _token0, _token1) {
    const pairAddress = await _V2Factory.methods.getPair(_token0, _token1).call()
    return pairAddress
}

async function getPairContract(_V2Factory, _token0, _token1) {
    const pairAddress = await getPairAddress(_V2Factory, _token0, _token1)
    if (pairAddress === '0x0000000000000000000000000000000000000000') {
        // the exchange does not have the pair; calling program should look for null return.
        return null
    }
    const pairContract = new web3.eth.Contract(IUniswapV2Pair.abi, pairAddress)
    return pairContract
}

/* async function getReserves(_pairContract) {
    const reserves = await _pairContract.methods.getReserves().call()
    return [reserves.reserve0, reserves.reserve1]
} */

async function getReserves(_pairContract, _token0, _token1) {
    const reserves = await _pairContract.methods.getReserves().call()
    reservesToken0 = await _pairContract.methods.token0().call()
    if (reservesToken0 === _token0.address) {
        return [reserves.reserve0, reserves.reserve1]
    } else {
        return [reserves.reserve1, reserves.reserve0]
    }
}

async function calculatePrice(_pairContract, _decimals0, _decimals1, _token0, _token1) {
    const [reserve0, reserve1] = await getReserves(_pairContract, _token0, _token1)
    
    _decimals0 = 10 ** _decimals0
    _decimals1 = 10 ** _decimals1

    const reserveF0 = Big(reserve0).div(_decimals0)
    const reserveF1 = Big(reserve1).div(_decimals1)

    // avoid a divide-by-0 error here
    if (reserveF1 !== 0) {
        // return the price as a string with a decimal
        return Big(reserveF1).div(Big(reserveF0)).toString()
    } else {
        console.log(`\n   ... Avoiding divide-by-zero; returning a price of 0...\n`)
        return(0)
    }
}

// function calculateDifference(uPrice, sPrice) {
//     return (((uPrice - sPrice) / sPrice) * 100).toFixed(2)
// }

async function getEstimatedReturn(amount, _routerPath, _token0, _token1) {
    const trade1 = await _routerPath[0].methods.getAmountsOut(amount, [_token0.address, _token1.address]).call()
    const trade2 = await _routerPath[1].methods.getAmountsOut(trade1[1], [_token1.address, _token0.address]).call()

    const amountIn = Number(web3.utils.fromWei(trade1[0], 'ether'))
    const amountOut = Number(web3.utils.fromWei(trade2[1], 'ether'))

    return { amountIn, amountOut }
}

// strToDecimal:   function similar to fromWei() for eth.
// converts a number string (with no decimal) to a string with any decimal precision
// example:  strToDecimal('123456789', 5) = '1234.56789'
function strToDecimal(amountStr, _decimals) {
    _decimals = 10 ** _decimals
    return Big(amountStr).div(Big(_decimals)).toString()
}

// strRmDecimal:   the opposite of strToDecimal above
// converts a number string with a decimal, to a string with no decimal, adding 0's if needed
// example:  strRmDecimal('1234567.89', 5) = '123456789000'
function strRmDecimal(amountStr, _decimals) {
    // ensure our number doesn't go longer than precision of 21 places
    // (because .js math then uses scientific notation, making the string invalid)
    // this truncates to 8 places after decimal, allowing billions of tokens to work
    let decimalsF
    if (_decimals > 8) {
        decimalsF = 8
    } else {
        decimalsF = _decimals
    }
    const multiplier = 10 ** decimalsF

    let finalStr = (Number(amountStr) * multiplier).toFixed(0).toString()

    // now append 0's back to the string, to represent correct # of decimals
    for (i = 0; i < (_decimals - decimalsF); i++) {
        finalStr = finalStr + '0'
    }
    return finalStr
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

function outputPairStats(pairStats, totalStats, pairsActive) {
    // set up statistics output helper constants
    const parOpen = '('
    const percentClose = '%)'

    let numPairs = 5

    if (!pairsActive[1])        { numPairs = 1 }
    else if (!pairsActive[2])   { numPairs = 2 }
    else if (!pairsActive[3])   { numPairs = 3 }
    else if (!pairsActive[4])   { numPairs = 4 }

    // update percentages & averages with current values
    for (let pairID = 0; pairID < numPairs; pairID++) {
        pairStats[pairID].priceDiffMetPct = pairStats[pairID].priceDiffMet / totalStats.numEvents * 100
        if (totalStats.errorCnt > 0) {
            pairStats[pairID].errorCntPct = pairStats[pairID].errorCnt / totalStats.errorCnt * 100
        } else {
            pairStats[pairID].errorCntPct = 0
        }
        if (totalStats.profitCheckCnt > 0) {
            pairStats[pairID].profitCheckCntPct = pairStats[pairID].profitCheckCnt / totalStats.profitCheckCnt * 100
        } else {
            pairStats[pairID].profitCheckCntPct = 0
        }
        if (totalStats.tradeCnt > 0) {
            pairStats[pairID].tradeCntPct = pairStats[pairID].tradeCnt / totalStats.tradeCnt * 100
        } else {
            pairStats[pairID].tradeCntPct = 0
        }
        if (pairStats[pairID].tradeCnt > 0) {
            pairStats[pairID].tradeSuccPct = pairStats[pairID].tradeSucc / pairStats[pairID].tradeCnt * 100
        } else {
            pairStats[pairID].tradeSuccPct = 0 
        }
        if (pairStats[pairID].profitCheckCnt > 0) {
            pairStats[pairID].avgCheckProfit = pairStats[pairID].totalCheckProfit / pairStats[pairID].profitCheckCnt
        } else {
            pairStats[pairID].avgCheckProfit = 0
        }
        if (pairStats[pairID].tradeSucc > 0) {
            pairStats[pairID].avgTradeProfit = pairStats[pairID].tradeProfits / pairStats[pairID].tradeSucc
        } else {
            pairStats[pairID].avgTradeProfit = 0
        }

        pairStats[pairID].avgPriceDiff = pairStats[pairID].totalPriceDiffAmt / pairStats[pairID].numEvents

//        console.log(`totalCheckProfit for pairID ${pairID}   = ${pairStats[pairID].totalCheckProfit}`)
//        console.log(`profitCheckCnt for pairID ${pairID}     = ${pairStats[pairID].profitCheckCnt}`)
//        console.log(`avgCheckProfit for pairID ${pairID}     = ${pairStats[pairID].avgCheckProfit}`)
//        console.log(`highestCheckProfit for PairID ${pairID} = ${pairStats[pairID].highestCheckProfit}`)
    }

    console.log(`------------------------------------------------------------------------------------------------------------------`)
    console.log(`                                      CURRENT PAIR STATISTICS              Min Price Difference:  ${diffSetting}% `)
    console.log(`                                                                                                          `)
    console.log(`                   Num     Price        Num          Est.          Num       Num                   Avg    `)
    console.log(`          Num     Price    Diff        Profit       Profit        Attmpt    Actual     Trade      Trade   `)
    console.log(`Token    Events   Diffs   Avg/High     Checks      Avg/High       Trades    Trades     Profit     Profit  `)
    console.log(`-----    ------   ------  --------     ------      --------       ------    ------     ------     ------  `)
    // log the stats line for each pair
    for (let pairID = 0; pairID < numPairs; pairID++) {

        console.log(`${(pairStats[pairID].symbol).padEnd(9)}` +
                `${(pairStats[pairID].numEvents).toString().padEnd(9)}` +
                `${(pairStats[pairID].priceDiffMet).toString()}` + parOpen +
                `${(pairStats[pairID].priceDiffMetPct).toFixed(0).toString()}` + percentClose.padEnd(4) +
                `${(pairStats[pairID].avgPriceDiff).toFixed(2).toString()}/${(pairStats[pairID].highestPriceDiff).toString().padEnd(7)} ` +
                `${(pairStats[pairID].profitCheckCnt).toString()}` + parOpen +
                `${(pairStats[pairID].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[pairID].avgCheckProfit).toFixed(3)}/${(pairStats[pairID].highestCheckProfit).toString().padEnd(10)}` +
                `${(pairStats[pairID].tradeCnt).toString()}` + parOpen +
                `${(pairStats[pairID].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(pairStats[pairID].tradeSucc).toString()}` + parOpen +
                `${(pairStats[pairID].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(pairStats[pairID].tradeProfits).toString().padEnd(11)}` +
                `${(pairStats[pairID].avgTradeProfit).toFixed(2).toString()}`)
    }
    console.log(`------------------------------------------------------------------------------------------------------------------`)
    console.log(``)
}

function outputExchangeStats(exchangeStats, totalStats, exchangesActive) {
    // set up statistics output helper constants
    const numExchanges = 3
    const parOpen = '('
    const percentClose = '%)'

    // update percentages with current values
    for (let exchangeID = 0; exchangeID < numExchanges; exchangeID++) {
        if (exchangesActive[exchangeID]) {
            exchangeStats[exchangeID].highPriceCntPct = exchangeStats[exchangeID].highPriceCnt / 
                                                            exchangeStats[exchangeID].priceDiffMet * 100
            exchangeStats[exchangeID].lowPriceCntPct = exchangeStats[exchangeID].lowPriceCnt / 
                                                            exchangeStats[exchangeID].priceDiffMet * 100
            if (totalStats.errorCnt > 0) {
                exchangeStats[exchangeID].errorCntPct = exchangeStats[exchangeID].errorCnt / totalStats.errorCnt * 100
            } else {
                exchangeStats[exchangeID].errorCntPct = 0
            }
            if (totalStats.profitCheckCnt > 0) {
                exchangeStats[exchangeID].profitCheckCntPct = 
                            exchangeStats[exchangeID].profitCheckCnt / totalStats.profitCheckCnt * 100
            } else {
                exchangeStats[exchangeID].profitCheckCntPct = 0
            }
            if (totalStats.tradeCnt > 0) {
                exchangeStats[exchangeID].tradeCntPct = exchangeStats[exchangeID].tradeCnt / totalStats.tradeCnt * 100
            } else {
                exchangeStats[exchangeID].tradeCntPct = 0
            }
            if (exchangeStats[exchangeID].tradeCnt > 0) {
                exchangeStats[exchangeID].tradeSuccPct = exchangeStats[exchangeID].tradeSucc / 
                                                                exchangeStats[exchangeID].tradeCnt * 100
            } else {
                exchangeStats[exchangeID].tradeSuccPct = 0
            }
            if (exchangeStats[exchangeID].profitCheckCnt > 0) {
                exchangeStats[exchangeID].avgCheckProfit = exchangeStats[exchangeID].totalCheckProfit /
                                                                exchangeStats[exchangeID].profitCheckCnt
            } else {
                exchangeStats[exchangeID].avgCheckProfit = 0
            }
            if (exchangeStats[exchangeID].tradeSucc > 0) {
                exchangeStats[exchangeID].avgTradeProfit = exchangeStats[exchangeID].tradeProfits / 
                                                                exchangeStats[exchangeID].tradeSucc
            } else {
                exchangeStats[exchangeID].avgTradeProfit = 0
            }
        }
    }

    console.log(`--------------------------------------------------------------------------------------------------------------------`)
    console.log(`                                         CURRENT EXCHANGE STATISTICS                  Amount of Reserve to Buy:  ${(percentToBuy*100).toFixed(0)}% `)
    console.log(`                                                                                                                      `)
    console.log(`                   Low       High                      Num         Avg        Num       Num                   Avg     `)
    console.log(`           Num    Price      Price         Num        Profit       Est.      Attmpt    Actual     Trade      Trade    `)
    console.log(`Exchange  Events  Count      Count        Errors      Checks      Profit     Trades    Trades     Profit     Profit   `)
    console.log(`--------  ------  -----      -----        ------      ------      ------     ------    ------     ------     ------   `)
    // log the stats line for each exchange
    for (let exchangeID = 0; exchangeID < numExchanges; exchangeID++) {
        if (exchangesActive[exchangeID]) {
            console.log(`${(exchangeStats[exchangeID].name).padEnd(10)}` +
                `${(exchangeStats[exchangeID].numEvents).toString().padEnd(7)}` +
                `${(exchangeStats[exchangeID].lowPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].lowPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[exchangeID].highPriceCnt).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].highPriceCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[exchangeID].errorCnt).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].errorCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[exchangeID].profitCheckCnt).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].profitCheckCntPct).toFixed(0).toString()}` + percentClose.padEnd(9) +
                `${(exchangeStats[exchangeID].avgCheckProfit).toFixed(2).toString().padEnd(11)}` +
                `${(exchangeStats[exchangeID].tradeCnt).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].tradeCntPct).toFixed(0).toString()}` + percentClose.padEnd(7) +
                `${(exchangeStats[exchangeID].tradeSucc).toString()}` + parOpen +
                `${(exchangeStats[exchangeID].tradeSuccPct).toFixed(0).toString()}` + percentClose.padEnd(8) +
                `${(exchangeStats[exchangeID].tradeProfits).toString().padEnd(11)}` +
                `${(exchangeStats[exchangeID].avgTradeProfit).toFixed(2).toString()}`)
        }
    }
    console.log(`--------------------------------------------------------------------------------------------------------------------`)
    console.log(`\n`)
}

module.exports = {
    getTokenAndContract,
    getPairAddress,
    getPairContract,
    getReserves,
    calculatePrice,
    getEstimatedReturn,
    strToDecimal,
    strRmDecimal,
    outputTotalStats,
    outputPairStats,
    outputExchangeStats
}
