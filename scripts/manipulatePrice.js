// manipulatePrice.js
// -----------------------------------------------------------------------------------------------
// This script sends a certain large amount of our ARB_AGAINST token, from a known "whale" 
// account, to one of our exchanges.  This will lower the price significantly, and trigger
// an arbitrage in our contract.
// -----------------------------------------------------------------------------------------------

// -- IMPORT PACKAGES -- //
// Include process module
//const process = require('process');
//import { argv } from 'node:process';
require("dotenv").config();

const Web3 = require('web3')
const {
    ChainId,
    Token,
    WETH
} = require("@uniswap/sdk")
const IUniswapV2Router02 = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json")
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json')

// -- SETUP NETWORK & WEB3 -- //

const chainId = ChainId.MAINNET
const web3 = new Web3('http://127.0.0.1:7545')

// -- IMPORT HELPER FUNCTIONS -- //

const { getPairContract, calculatePrice } = require('../helpers/helpers')

// -- IMPORT & SETUP UNISWAP/SUSHISWAP CONTRACTS -- //

const config = require('../config.json')
const uFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.UNISWAP.FACTORY_ADDRESS) // UNISWAP FACTORY CONTRACT
const sFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.SUSHISWAP.FACTORY_ADDRESS) // SUSHISWAP FACTORY CONTRACT
const tFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.EXCHANGES.SHIBASWAP.FACTORY_ADDRESS) // SUSHISWAP FACTORY CONTRACT
const uRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.UNISWAP.V2_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT
const sRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.SUSHISWAP.V2_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT
const tRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.EXCHANGES.SHIBASWAP.V2_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT

// -- CONFIGURE VALUES HERE -- //


const MY_ACCOUNT = process.env.ACCOUNT
const GAS = 450000
var V2_FACTORY_TO_USE = {}
var V2_ROUTER_TO_USE = {}
var UNLOCKED_ACCOUNT = ''
var AMOUNT = 0
var ARB_AGAINST_ADDRESS = ''
var ARB_AGAINST_CONTRACT = ''


// -- MAIN SCRIPT -- //

const main = async () => {

    var args = process.argv;
    var targetToken, targetExchange, progname
    args.forEach((val, index) => {
        if (index == 1) {
            progname = val
        }
        else if (index == 2) {
            targetToken = val
        }
        else if (index == 3) {
            targetExchange = val
        }
    });
    
    if (targetToken == null) {
        console.log("")
        console.log(`usage:  node path/manipulatePrice.js TOKEN [EXCHANGE]\n`)
        console.log(`where:  TOKEN = USDT | MATIC | DAI | SHIB | USDC`)
        console.log(`        EXCHANGE = Uniswap | SushiSwap | ShibaSwap\n\n`)
        return
    }
    else if ((targetExchange != 'Uniswap') && 
             (targetExchange != 'SushiSwap') &&
             (targetExchange != 'ShibaSwap')) {
        console.log(`\nEXCHANGE not recognized; defaulting to Uniswap\n\n`)
        targetExchange = 'Uniswap'
    }

    var ARB_FOR_ADDRESS = config.TOKENS.WETH.address
    var ARB_FOR_CONTRACT = new web3.eth.Contract(IERC20.abi, ARB_FOR_ADDRESS)

    if (targetToken == "USDT") {
        UNLOCKED_ACCOUNT = config.TOKENS.USDT.testData.manipulateAccount // Unlocked Account
        AMOUNT = config.TOKENS.USDT.testData.manipulateAmount     // # tokens to transfer from unlocked account
        ARB_AGAINST_ADDRESS = config.TOKENS.USDT.address
    }
    else if (targetToken == "MATIC") {
        UNLOCKED_ACCOUNT = config.TOKENS.MATIC.testData.manipulateAccount // Unlocked Account
        AMOUNT = config.TOKENS.MATIC.testData.manipulateAmount     // # tokens to transfer from unlocked account
        ARB_AGAINST_ADDRESS = config.TOKENS.MATIC.address
    }
    else if (targetToken == "DAI") {
        UNLOCKED_ACCOUNT = config.TOKENS.DAI.testData.manipulateAccount // Unlocked Account
        AMOUNT = config.TOKENS.DAI.testData.manipulateAmount     // # tokens to transfer from unlocked account
        ARB_AGAINST_ADDRESS = config.TOKENS.DAI.address
    }
    else if (targetToken == "SHIB") {
        UNLOCKED_ACCOUNT = config.TOKENS.SHIB.testData.manipulateAccount // Unlocked Account
        AMOUNT = config.TOKENS.SHIB.testData.manipulateAmount     // # tokens to transfer from unlocked account
        ARB_AGAINST_ADDRESS = config.TOKENS.SHIB.address
    }
    else if (targetToken == "USDC") {
        UNLOCKED_ACCOUNT = config.TOKENS.USDC.testData.manipulateAccount // Unlocked Account
        AMOUNT = config.TOKENS.USDC.testData.manipulateAmount     // # tokens to transfer from unlocked account
        ARB_AGAINST_ADDRESS = config.TOKENS.USDC.address
    }
    else {
        console.log(`Target token (${targetToken}) not recognized.\n`)
        console.log(`usage:  node path/manipulatePrice.js TOKEN [EXCHANGE]\n`)
        console.log(`where:  TOKEN = USDT | MATIC | DAI | SHIB | USDC`)
        console.log(`        EXCHANGE = Uniswap | SushiSwap | ShibaSwap\n\n`)
        return
    }

    // if we get here, we know that targetExchange has a valid setting
    if (targetExchange == 'Uniswap') {
        V2_FACTORY_TO_USE = uFactory
        V2_ROUTER_TO_USE = uRouter
    }
    else if (targetExchange == 'SushiSwap') {
        V2_FACTORY_TO_USE = sFactory
        V2_ROUTER_TO_USE = sRouter
    }
    else if (targetExchange == 'ShibaSwap') {
        V2_FACTORY_TO_USE = tFactory
        V2_ROUTER_TO_USE = tRouter        
    }

    console.log(`Token to manipulate:      ${targetToken}`)
    console.log(`Exchange to dump it on:   ${targetExchange}`)

    ARB_AGAINST_CONTRACT = new web3.eth.Contract(IERC20.abi, ARB_AGAINST_ADDRESS)

    const accounts = await web3.eth.getAccounts()
    // This will be the account to recieve ARB_FOR tokens after we perform the swap to manipulate price
    console.log(`loaded accounts...\n`)

    const account = accounts[1]

    const pairContract = await getPairContract(V2_FACTORY_TO_USE, ARB_AGAINST_ADDRESS, ARB_FOR_ADDRESS)
    console.log(`pairContract Address:  ${pairContract._address}\n`)

    const tokenFor = new Token(
        ChainId.MAINNET,
        ARB_FOR_ADDRESS,
        18,
        await ARB_FOR_CONTRACT.methods.symbol().call(),
        await ARB_FOR_CONTRACT.methods.name().call()
    )
    
    const tokenAgainst = new Token(
        ChainId.MAINNET,
        ARB_AGAINST_ADDRESS,
        18,
        await ARB_AGAINST_CONTRACT.methods.symbol().call(),
        await ARB_AGAINST_CONTRACT.methods.name().call()
    )

    // Fetch price of token pair before we execute the swap
    console.log('fetching priceBefore\n')
    const priceBefore = await calculatePrice(pairContract)
    console.log('calling manipulatePrice\n')
    await manipulatePrice(tokenFor, tokenAgainst, account)

    // Fetch price of token pair after the swap
    console.log('fetching priceAfter\n')
    const priceAfter = await calculatePrice(pairContract)

    const data = {
        'Price Before': `1 ${tokenFor.symbol} = ${Number(priceBefore).toFixed(0)} ${tokenAgainst.symbol}`,
        'Price After': `1 ${tokenFor.symbol} = ${Number(priceAfter).toFixed(0)} ${tokenAgainst.symbol}`,
    }

    console.table(data)

    let balance = await ARB_FOR_CONTRACT.methods.balanceOf(account).call()
    balance = web3.utils.fromWei(balance.toString(), 'ether')

    console.log(`\nBalance in reciever account: ${balance} WETH\n`)
}


main()


async function manipulatePrice(tokenFor, tokenAgainst, account) {

    console.log(`   ...Beginning to send tokens to manipulate price...\n`)

    console.log(`   ...Send Token: ${tokenAgainst.symbol}`)
    console.log(`   ...Receive Token (not used): ${tokenFor.symbol}\n`)

    const amountIn = new web3.utils.BN(
        web3.utils.toWei(AMOUNT, 'ether')
    )
    console.log(`   ...amountIn = ${amountIn}`)

    const path = [tokenAgainst.address, tokenFor.address]
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes

    console.log(`   ...approving to send...\n`)
    await ARB_AGAINST_CONTRACT.methods.approve(V2_ROUTER_TO_USE._address, amountIn).send({ from: UNLOCKED_ACCOUNT })
    console.log(`   ...sending tokens from unlocked acct: ${UNLOCKED_ACCOUNT}.`)
    const receipt = await V2_ROUTER_TO_USE.methods.swapExactTokensForTokens(amountIn, 0, path, account, deadline).send({ from: UNLOCKED_ACCOUNT, gas: GAS });

    console.log(`   ...manipulatePrice Complete!\n`)

    return receipt
}

