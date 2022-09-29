require("dotenv").config();
const config = require('../config.json')
const HDWalletProvider = require("@truffle/hdwallet-provider");

const Web3 = require('web3')
let web3

if (!config.PROJECT_SETTINGS.isLocal) {
    web3 = new Web3(`wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`)
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

/*****************************************************************************
 * TODO:  figure out how to create a signed transaction for the trades
 *****************************************************************************
 * 
 * // Option 1:  create a signing account from a private key
 * // (not 100% sure this works with the current smart contract)
 * const signer = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY)
 * web3.eth.accounts.wallet.add(signer);

 * // Option 2:  this HDWalletProvider hangs the bot...
 * if (!config.PROJECT_SETTINGS.isLocal) {
 *     const provider = new HDWalletProvider({
 *         mnemonic: process.env.MNEMONIC_PHRASE,
 *         providerOrUrl: `wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
 *         addressIndex: process.env.ADDRESS_INDEX
 *     })
 *     web3 = new Web3(provider)
 * } else {
 *     web3 = new Web3('ws://127.0.0.1:7545')
 * }
 *
 ****************************************************************************/

const IUniswapV2Router02 = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json")

// load Arbitrage contract
const IArbitrage = require('../build/contracts/Arbitrage.json')
const arbitrage = new web3.eth.Contract(IArbitrage.abi, IArbitrage.networks[1].address);

// -- CONFIGURE WHICH EXCHANGES & PAIRS ARE MONITORED BY THE BOT -- //
// ---------------  (defined in config.json file)  ---------------- //

const maxPairs = config.PROJECT_SETTINGS.maxPairs
const maxExchanges = config.PROJECT_SETTINGS.maxExchanges

// Load the exchange information (in order, are Uniswap, Sushiswap, and Shibaswap)
//var exchanges = []
var exchangeNames = []
var factories = []
var routers = []
var exchangesActive = []
var exchange

for (let eID = 0; eID < maxExchanges; eID++) {
    exchangesActive[eID] = false
    exchangeNames[eID] = ""
}

for (let eID = 0; eID < maxExchanges; eID++) {
    exchange = config.PROJECT_SETTINGS.exchanges[eID]
    if (exchange != "") {
        exchangesActive[eID] = config.EXCHANGES[exchange].MONITOR
        factories[eID] = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES[exchange].FACTORY_ADDRESS)
        routers[eID] = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES[exchange].V2_ROUTER_02_ADDRESS)
        exchangeNames[eID] = config.EXCHANGES[exchange].NAME
    }
}

// load the base token to be used in each pair (defined in config.json)
const ARBFORTOKEN = config.PROJECT_SETTINGS.baseToken
const ARBFORaddr = config.TOKENS[ARBFORTOKEN].address

// load the tokens to pair with the base token (defined in config.json)
var arbAgainstAddresses = []
var pairsActive = []
var token

for (let pID = 0; pID < maxPairs; pID++) {
    arbAgainstAddresses[pID] = ""
    pairsActive[pID] = false
}

for (let pID = 0; pID < maxPairs; pID++) {
    token = config.PROJECT_SETTINGS.pairTokens[pID]
    if (token != "") {
        arbAgainstAddresses[pID] = config.TOKENS[token].address
        pairsActive[pID] = true
    }
}

// -- INITIALIZE STATS TRACKING VARIABLES -- //
// ----------------------------------------- //
var totalStats =
    {
        startTime: null,
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        tradeCnt: 0,
        tradeCntPct: 0,
        profits: 0 
    }

var pairStats = [
    { 
        symbol: '',
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        totalPriceDiffAmt: 0,
        avgPriceDiff: 0,
        highestPriceDiff: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0,
        highestCheckProfit: -999,
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    {
        symbol: '',
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        totalPriceDiffAmt: 0,
        avgPriceDiff: 0,
        highestPriceDiff: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        highestCheckProfit: -999,
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    {
        symbol: '',
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        totalPriceDiffAmt: 0,
        avgPriceDiff: 0,
        highestPriceDiff: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        highestCheckProfit: -999,
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    {
        symbol: '',
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        totalPriceDiffAmt: 0,
        avgPriceDiff: 0,
        highestPriceDiff: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        highestCheckProfit: -999,
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    {
        symbol: '',
        numEvents: 0,
        priceDiffMet: 0,
        priceDiffMetPct: 0,
        totalPriceDiffAmt: 0,
        avgPriceDiff: 0,
        highestPriceDiff: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        highestCheckProfit: -999,
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    }
]

var exchangeStats = [
    { 
        name: 'Uniswap',
        numEvents: 0,
        priceDiffMet: 0,
        lowPriceCnt: 0,
        lowPriceCntPct: 0,
        highPriceCnt: 0,
        highPriceCntPct: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    { 
        name: 'SushiSwap',
        numEvents: 0,
        priceDiffMet: 0,
        lowPriceCnt: 0,
        lowPriceCntPct: 0,
        highPriceCnt: 0,
        highPriceCntPct: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    },
    { 
        name: 'ShibaSwap',
        numEvents: 0,
        priceDiffMet: 0,
        lowPriceCnt: 0,
        lowPriceCntPct: 0,
        highPriceCnt: 0,
        highPriceCntPct: 0,
        errorCnt: 0,
        errorCntPct: 0,
        profitCheckCnt: 0,
        profitCheckCntPct: 0,
        totalCheckProfit: 0,
        avgCheckProfit: 0, 
        tradeCnt: 0,
        tradeCntPct: 0,
        tradeSucc: 0,
        tradeSuccPct: 0,
        tradeProfits: 0,
        avgTradeProfit: 0
    }
]

module.exports = {
    factories,
    routers,
    exchangeNames,
    web3,
    arbitrage,
    exchangesActive,
    pairsActive,
    ARBFORaddr,
    arbAgainstAddresses,
    maxPairs,
    maxExchanges,
    totalStats,
    pairStats,
    exchangeStats
}