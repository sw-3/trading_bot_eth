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

// create a signing account from a private key
// (not 100% sure this works with the current smart contract)
//const signer = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY)
//web3.eth.accounts.wallet.add(signer);

/*   this HDWalletProvider hangs the bot...
if (!config.PROJECT_SETTINGS.isLocal) {
    const provider = new HDWalletProvider({
        mnemonic: process.env.MNEMONIC_PHRASE,
        providerOrUrl: `wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        addressIndex: process.env.ADDRESS_INDEX
    })
    web3 = new Web3(provider)
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}
*/
const IUniswapV2Router02 = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json")

// load Exchange contracts
const uFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.UNISWAP.FACTORY_ADDRESS) // UNISWAP FACTORY CONTRACT
const uRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.UNISWAP.V2_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT
const sFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.SUSHISWAP.FACTORY_ADDRESS) // SUSHISWAP FACTORY CONTRACT
const sRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.SUSHISWAP.V2_ROUTER_02_ADDRESS) // SUSHISWAP ROUTER CONTRACT
const tFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.SHIBASWAP.FACTORY_ADDRESS) // SHIBASWAP FACTORY CONTRACT
const tRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.SHIBASWAP.V2_ROUTER_02_ADDRESS) // SHIBASWAP ROUTER CONTRACT

// load Exchange Names
const uName = config.EXCHANGES.UNISWAP.NAME
const sName = config.EXCHANGES.SUSHISWAP.NAME
const tName = config.EXCHANGES.SHIBASWAP.NAME

// load token information, starting with token to use as the Arb For
const ARBFORaddr = config.TOKENS.WETH.address
const WETHaddr = config.TOKENS.WETH.address
const USDTaddr = config.TOKENS.USDT.address
const USDCaddr = config.TOKENS.USDC.address
const DAIaddr = config.TOKENS.DAI.address
const SHIBaddr = config.TOKENS.SHIB.address
const UFTaddr = config.TOKENS.UFT.address           // not on ShibaSwap
const MATICaddr = config.TOKENS.MATIC.address
const LINKaddr = config.TOKENS.LINK.address
const MANAaddr = config.TOKENS.MANA.address
const RAILaddr = config.TOKENS.RAIL.address         // not on ShibaSwap

// load Arbitrage contract
const IArbitrage = require('../build/contracts/Arbitrage.json')
const arbitrage = new web3.eth.Contract(IArbitrage.abi, IArbitrage.networks[1].address);

// -- STATS VARIABLES -- //

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
    uFactory,
    uRouter,
    uName,
    sFactory,
    sRouter,
    sName,
    tFactory,
    tRouter,
    tName,
    web3,
    arbitrage,
    ARBFORaddr,
    WETHaddr,
    LINKaddr,
    MATICaddr,
    DAIaddr,
    SHIBaddr,
    MANAaddr,
    USDTaddr,
    USDCaddr,
    RAILaddr,
    UFTaddr,
    totalStats,
    pairStats,
    exchangeStats
}