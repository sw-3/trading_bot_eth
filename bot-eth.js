// -- HANDLE INITIAL SETUP -- //

require('./helpers/server')
require("dotenv").config();
const Big = require('big.js');
var moment = require('moment');
const config = require('./config.json')

// get helper functions
const { 
        getTokenAndContract, getPairContract, calculatePrice, 
        getEstimatedReturn, getReserves,
        strToDecimal, strRmDecimal,
        outputTotalStats, outputPairStats, outputExchangeStats
    } = require('./helpers/helpers')

// get the initialized Exchange/Token/contract info
const { 
    uFactory, uRouter, uName,
    sFactory, sRouter, sName,
    tFactory, tRouter, tName,
    web3, arbitrage, 
    ARBFORaddr, WETHaddr, LINKaddr, 
    MATICaddr, DAIaddr, SHIBaddr, 
    MANAaddr, USDTaddr, USDCaddr, 
    RAILaddr, UFTaddr
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

// which exchanges are active?
//      The 3 exchanges, in order, are Uniswap, Sushiswap, and Shibaswap
//      Set them to true, if using
const exchangesActive = [true, true, false]

// how many pairs are active?  Up to 5.  Set the last one(s) to false if using fewer
const pairsActive = [true, true, true, true, true]

const main = async () => {
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
    const arbForToken = tokenAndContract.token
    const arbForTokenContract = tokenAndContract.tokenContract

    tokenAndContract = await getTokenAndContract(SHIBaddr)
    const arbAgainstToken1 = tokenAndContract.token
    const arbAgainstToken1Contract = tokenAndContract.tokenContract
    pairStats[0].symbol = arbAgainstToken1.symbol

    tokenAndContract = await getTokenAndContract(MANAaddr)
    const arbAgainstToken2 = tokenAndContract.token
    const arbAgainstToken2Contract = tokenAndContract.tokenContract
    pairStats[1].symbol = arbAgainstToken2.symbol

    tokenAndContract = await getTokenAndContract(UFTaddr)
    const arbAgainstToken3 = tokenAndContract.token
    const arbAgainstToken3Contract = tokenAndContract.tokenContract
    pairStats[2].symbol = arbAgainstToken3.symbol

    tokenAndContract = await getTokenAndContract(RAILaddr)
    const arbAgainstToken4 = tokenAndContract.token
    const arbAgainstToken4Contract = tokenAndContract.tokenContract
    pairStats[3].symbol = arbAgainstToken4.symbol

    tokenAndContract = await getTokenAndContract(MATICaddr)
    const arbAgainstToken5 = tokenAndContract.token
    const arbAgainstToken5Contract = tokenAndContract.tokenContract
    pairStats[4].symbol = arbAgainstToken5.symbol


    // get the Uniswap contracts for each token-pair
    let uPair1, uPair2, uPair3, uPair4, uPair5
    if (exchangesActive[0]) {
        uPair1 = await getPairContract(uFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken1.address)
        if (uPair1 === null) {
            console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken1.symbol} on Uniswap.`)
            process.exit(-3)
        }
        if (pairsActive[1]) {
            uPair2 = await getPairContract(uFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken2.address)
            if (uPair2 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken2.symbol} on Uniswap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[2]) {
            uPair3 = await getPairContract(uFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken3.address)
            if (uPair3 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken3.symbol} on Uniswap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[3]) {
            uPair4 = await getPairContract(uFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken4.address)
            if (uPair4 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken4.symbol} on Uniswap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[4]) {
            uPair5 = await getPairContract(uFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken5.address)
            if (uPair5 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken5.symbol} on Uniswap.`)
                process.exit(-3)
            }
        }
    }

    // get the SushiSwap contracts for each token-pair
    let sPair1, sPair2, sPair3, sPair4, sPair5
    if (exchangesActive[1]) {
        sPair1 = await getPairContract(sFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken1.address)
        if (sPair1 === null) {
            console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken1.symbol} on SushiSwap.`)
            process.exit(-3)
        }
        if (pairsActive[1]) {
            sPair2 = await getPairContract(sFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken2.address)
            if (sPair2 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken2.symbol} on SushiSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[2]) {
            sPair3 = await getPairContract(sFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken3.address)
            if (sPair3 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken3.symbol} on SushiSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[3]) {
            sPair4 = await getPairContract(sFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken4.address)
            if (sPair4 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken4.symbol} on SushiSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[4]) {
            sPair5 = await getPairContract(sFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken5.address)
            if (sPair5 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken5.symbol} on SushiSwap.`)
                process.exit(-3)
            }
        }
    }

    // get the ShibaSwap contracts for each token-pair
    let tPair1, tPair2, tPair3, tPair4, tPair5
    if (exchangesActive[2]) {
        tPair1 = await getPairContract(tFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken1.address)
        if (tPair1 === null) {
            console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken1.symbol} on ShibaSwap.`)
            process.exit(-3)
        }
        if (pairsActive[1]) {
            tPair2 = await getPairContract(tFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken2.address)
            if (tPair2 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken2.symbol} on ShibaSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[2]) {
            tPair3 = await getPairContract(tFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken3.address)
            if (tPair3 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken3.symbol} on ShibaSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[3]) {
            tPair4 = await getPairContract(tFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken4.address)
            if (tPair4 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken4.symbol} on ShibaSwap.`)
                process.exit(-3)
            }
        }
        if (pairsActive[4]) {
            tPair5 = await getPairContract(tFactory, 
                                    arbForToken.address, 
                                    arbAgainstToken5.address)
            if (tPair5 === null) {
                console.log(`ERROR: did not find ${arbForToken.symbol}/${arbAgainstToken5.symbol} on ShibaSwap.`)
                process.exit(-3)
            }
        }
    }

    // Execute a 1-time sweep of the pair prices after start-up
    var receipt
    if (!isExecuting) {
        isExecuting = true
        isInitialCheck = true
        if (exchangesActive[0])         { exchangeID = 0 }      // Uniswap
        else if (exchangesActive[1])    { exchangeID = 1 }      // SushiSwap
        else if (exchangesActive[2])    { exchangeID = 2 }      // ShibaSwap

        console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken1.symbol}...\n`)

        // Check first pair, as if a trade just happened
        pairID = 0
        receipt = await processTradeEvent(uName, exchangeID, pairID,
                                            arbForToken,
                                            arbForTokenContract,
                                            arbAgainstToken1,
                                            arbAgainstToken1Contract,
                                            uPair1, sPair1, tPair1)

        if (pairsActive[1]) {
            console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken2.symbol}...\n`)

            // Check 2nd pair, as if a trade just happened
            pairID = 1
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken2,
                                                arbAgainstToken2Contract,
                                                uPair2, sPair2, tPair2)
        }
        if (pairsActive[2]) {
            console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken3.symbol}...\n`)

            // Check 3rd pair, as if a trade just happened
            pairID = 2
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken3,
                                                arbAgainstToken3Contract,
                                                uPair3, sPair3, tPair3)
        }
        if (pairsActive[3]) {
            console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken4.symbol}...\n`)

            // Check 4th pair, as if a trade just happened
            pairID = 3
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken4,
                                                arbAgainstToken4Contract,
                                                uPair4, sPair4, tPair4)
        }
        if (pairsActive[4]) {
            console.log(`\nInitial price check for ${arbForToken.symbol}/${arbAgainstToken5.symbol}...\n`)

            // Check 5th pair, as if a trade just happened
            pairID = 4
            receipt = await processTradeEvent(uName, exchangeID, pairID,
                                                arbForToken, 
                                                arbForTokenContract,
                                                arbAgainstToken5,
                                                arbAgainstToken5Contract,
                                                uPair5, sPair5, tPair5)
        }
        isInitialCheck = false
        isExecuting = false
    }

    console.log(`------------------------------------------------------------------`)
    console.log(`--------   Token Pair Contracts to Monitor                --------`)
    console.log(`------------------------------------------------------------------\n`)
    console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken1.symbol}    ------------------------------------------`)
    if (exchangesActive[0]) {console.log(`   ${uName} contract:    ${uPair1.options.address}`)}
    if (exchangesActive[1]) {console.log(`   ${sName} contract:  ${sPair1.options.address}`)}
    if (exchangesActive[2]) {console.log(`   ${tName} contract:  ${tPair1.options.address}`)}
    console.log(``)

    if (pairsActive[1]) {
        console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken2.symbol}    ------------------------------------------`)
        if (exchangesActive[0]) {console.log(`   ${uName} contract:    ${uPair2.options.address}`)}
        if (exchangesActive[1]) {console.log(`   ${sName} contract:  ${sPair2.options.address}`)}
        if (exchangesActive[2]) {console.log(`   ${tName} contract:  ${tPair2.options.address}`)}
        console.log(``)
    }
    if (pairsActive[2]) {
        console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken3.symbol}    ------------------------------------------`)
        if (exchangesActive[0]) {console.log(`   ${uName} contract:    ${uPair3.options.address}`)}
        if (exchangesActive[1]) {console.log(`   ${sName} contract:  ${sPair3.options.address}`)}
        if (exchangesActive[2]) {console.log(`   ${tName} contract:  ${tPair3.options.address}`)}
        console.log(``)
    }
    if (pairsActive[3]) {
        console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken4.symbol}    ------------------------------------------`)
        if (exchangesActive[0]) {console.log(`   ${uName} contract:    ${uPair4.options.address}`)}
        if (exchangesActive[1]) {console.log(`   ${sName} contract:  ${sPair4.options.address}`)}
        if (exchangesActive[2]) {console.log(`   ${tName} contract:  ${tPair4.options.address}`)}
        console.log(``)
    }
    if (pairsActive[4]) {
        console.log(`--------   ${arbForToken.symbol}/${arbAgainstToken5.symbol}    ------------------------------------------`)
        if (exchangesActive[0]) {console.log(`   ${uName} contract:    ${uPair5.options.address}`)}
        if (exchangesActive[1]) {console.log(`   ${sName} contract:  ${sPair5.options.address}`)}
        if (exchangesActive[2]) {console.log(`   ${tName} contract:  ${tPair5.options.address}`)}
        console.log(`\n`)
    }

    if (exchangesActive[0]) {
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
    }

    if (exchangesActive[1]) {
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
    }

    if (exchangesActive[2]) {
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
    }

    if (pairsActive[1]) {
        if (exchangesActive[0]) {
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
        }
        if (exchangesActive[1]) {
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
        }
        if (exchangesActive[2]) {
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
        }
    }

    if (pairsActive[2]) {
        if (exchangesActive[0]) {
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
        }

        if (exchangesActive[1]) {
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
        }

        if (exchangesActive[2]) {
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
        }
    }

    if (pairsActive[3]) {
        if (exchangesActive[0]) {
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
        }
        if (exchangesActive[1]) {
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
        }
        if (exchangesActive[2]) {
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
        }
    }

    if (pairsActive[4]) {
        if (exchangesActive[0]) {
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
        }
        if (exchangesActive[1]) {
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
        }
        if (exchangesActive[2]) {
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
        }
    }

    outputTotalStats(totalStats)
    outputPairStats(pairStats, totalStats, pairsActive)
    outputExchangeStats(exchangeStats, totalStats, exchangesActive)
    console.log(`${moment().format("h:mm:ss a")}:  ` + `Waiting for swap event...`)
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

/*console.log(`_exchangeName, exchID, PairID = ${_exchangeName}, ${_exchangeID}, ${_pairID}`)
console.log(`_arbForToken = ${_arbForToken.address}`)
console.log(`_arbAgainstToken = ${_arbAgainstToken.address}`)
console.log(`_arbForTokenContract = ${_arbForTokenContract.address}`)
console.log(`_arbAgainstTokenContract = ${_arbAgainstTokenContract.address}`)
console.log(`_uPair = ${_uPair.address}`)
console.log(`_sPair = ${_sPair.address}`)
console.log(`_tPair = ${_tPair.address}`)
*/

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
// Note: routerPath is a list of all routers, ordered from high to low price of the pair
const deterimineRouterPath = async (exchangeName, exchangeID, pairID,
                                    _arbForToken, _arbAgainstToken, uPair, sPair, tPair) => {
    isExecuting = true

    if (!isInitialCheck) {
        console.log(`${moment().format("h:mm:ss a")}:  ` +
                    `Swap Initiated on ${exchangeName} for ${_arbAgainstToken.symbol}; ` +
                    `looking for arbitrage...`)
    }
    const currentBlock = await web3.eth.getBlockNumber()
//    console.log(`currentBlock = ${currentBlock}`)

    // handle different decimal precisions
    const decimalsFor = _arbForToken.decimals
    const decimalsAgainst = _arbAgainstToken.decimals
    console.log(`decimals for ${_arbForToken.symbol} = ${decimalsFor}`)
    console.log(`decimals for ${_arbAgainstToken.symbol} = ${decimalsAgainst}`)

    // get the price of the pair on the exchange which triggered the trade.
    // also, get the price of any pair which is currently 0
    if ( 
            (0 === exchangeID) 
                || 
            ( (exchangesActive[0]) && (exchangePrices[0].prices[pairID] === 0) ) 
        ) {
            console.log(`getting price on Uniswap for pairID ${pairID}`)
            exchangePrices[0].prices[pairID] = await calculatePrice(uPair, 
                                                                decimalsFor, 
                                                                decimalsAgainst, 
                                                                _arbForToken, 
                                                                _arbAgainstToken)
    }
    if ( 
            (1 === exchangeID) 
                || 
            ( (exchangesActive[1]) && (exchangePrices[1].prices[pairID] === 0) )
        ) {
            console.log(`getting price on SushiSwap for pairID ${pairID}`)
            exchangePrices[1].prices[pairID] = await calculatePrice(sPair,
                                                                decimalsFor, 
                                                                decimalsAgainst, 
                                                                _arbForToken, 
                                                                _arbAgainstToken)
    }
    if ( 
            (2 === exchangeID) 
                || 
            ( (exchangesActive[2]) && (exchangePrices[2].prices[pairID] === 0) ) 
        ) {
            console.log(`getting price on ShibaSwap for pairID ${pairID}`)
            exchangePrices[2].prices[pairID] = await calculatePrice(tPair,
                                                                decimalsFor, 
                                                                decimalsAgainst, 
                                                                _arbForToken, 
                                                                _arbAgainstToken)
    }

    let uPrice = exchangePrices[0].prices[pairID]
    let sPrice = exchangePrices[1].prices[pairID]
    let tPrice = exchangePrices[2].prices[pairID]

    // if any exchange is not used, its price will be 0, which would always be the "low" price.
    // we need to change its price so it will not be low or high (make it in the middle)

//console.log(`uPrice | sPrice | tPrice = ${uPrice} | ${sPrice} | ${tPrice}`)
    if (uPrice === 0) {
        uPrice = (Number(sPrice) + Number(tPrice)) / 2
    }
    else if (sPrice === 0) {
        sPrice = (Number(uPrice) + Number(tPrice)) / 2
    }
    else if (tPrice === 0) {
        tPrice = (Number(uPrice) + Number(sPrice)) / 2
    }
//console.log(`uPrice | sPrice | tPrice = ${uPrice} | ${sPrice} | ${tPrice}`)

//    const uFPrice = Number(uPrice).toFixed(units)
//    const sFPrice = Number(sPrice).toFixed(units)
//    const tFPrice = Number(tPrice).toFixed(units)

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
        console.log(`Buy on  ${maxName}:  ${_arbAgainstToken.symbol}/${_arbForToken.symbol}\t price = ${maxPrice}`)
        console.log(`Sell on ${minName}:  ${_arbAgainstToken.symbol}/${_arbForToken.symbol}\t price = ${minPrice}\n`)
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
                                        _arbForTokenContract, 
                                        _arbForToken, 
                                        _arbAgainstToken,
                                        _pairID) => {

    console.log(`Determining Profitability...\n`)

    // This is where you can customize your conditions on whether a profitable trade is possible.
    // This is a basic example of trading WETH/SHIB...

    let reservesOnBuyDex, reservesOnSellDex, exchangeToBuy, exchangeToSell, actualAmountOut

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

//    console.log(`Reserves of (${_arbForToken.symbol} ${decimalsFor}) on ${exchangeToBuy}:  ${reservesOnBuyDex[0]}`)
//    console.log(`Reserves of (${_arbForToken.symbol} ${decimalsFor}) on ${exchangeToSell}:  ${reservesOnSellDex[0]}`)
    console.log(`Reserves of (${_arbAgainstToken.symbol} ${decimalsAgainst}) on ${exchangeToBuy}:  ${reservesOnBuyDex[1]}`)
    console.log(`Reserves of (${_arbAgainstToken.symbol} ${decimalsAgainst}) on ${exchangeToSell}:  ${reservesOnSellDex[1]}`)

//    let arbForReservesOnBuyDex = strToDecimal(reservesOnBuyDex[0].toString(), decimalsFor)
//    let arbForReservesOnSellDex = strToDecimal(reservesOnSellDex[0].toString(), decimalsFor)
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
        
//        console.log(`Estimated amount of ${_arbForToken.symbol} to buy ${strToDecimal(actualAmountOut, decimalsAgainst)} ${_arbAgainstToken.symbol} on ${exchangeToBuy}\t\t| ${web3.utils.fromWei(token0In, 'ether')}`)
        console.log(`Estimated amount of ${_arbForToken.symbol} to buy ${strToDecimal(actualAmountOut, decimalsAgainst)} ${_arbAgainstToken.symbol} on ${exchangeToBuy}\t\t| ${strToDecimal(token0In, decimalsFor)}`)

        result = await _routerPath[1].methods.getAmountsOut(token1In, [_arbAgainstToken.address, _arbForToken.address]).call()

//        console.log(`Estimated amount of ${_arbForToken.symbol} returned after swapping ${_arbAgainstToken.symbol} on ${exchangeToSell}\t| ${web3.utils.fromWei(result[1], 'ether')}\n`)
        console.log(`Estimated amount of ${_arbForToken.symbol} returned after swapping ${_arbAgainstToken.symbol} on ${exchangeToSell}\t| ${strToDecimal(result[1], decimalsFor)}\n`)

        const { amountIn, amountOut } = await getEstimatedReturn(token0In, _routerPath, _arbForToken, _arbAgainstToken)

        let ethBalanceBefore = await web3.eth.getBalance(account)
        ethBalanceBefore = web3.utils.fromWei(ethBalanceBefore, 'ether')
        const ethBalanceAfter = ethBalanceBefore - estimatedGasCost

//        const amountDifference = amountOut - amountIn
//        let wethBalanceBefore = await _arbForTokenContract.methods.balanceOf(account).call()
//        wethBalanceBefore = web3.utils.fromWei(wethBalanceBefore, 'ether')
        const amountDifference = amountOut - amountIn
        let arbForBalanceBefore = await _arbForTokenContract.methods.balanceOf(account).call()
        arbForBalanceBefore = strToDecimal(arbForBalanceBefore, decimalsFor)

//        const wethBalanceAfter = amountDifference + Number(wethBalanceBefore)
//        const wethBalanceDifference = wethBalanceAfter - Number(wethBalanceBefore)
        const arbForBalanceAfter = amountDifference + Number(arbForBalanceBefore)
        const arbForBalanceDifference = arbForBalanceAfter - Number(arbForBalanceBefore)

//        const totalGained = wethBalanceDifference - Number(estimatedGasCost)
        const totalGained = arbForBalanceDifference - gasCostInArbFor

        console.log(`    ArbFor = ${_arbForToken.symbol}`)

        const data = {
//            'ETH Balance Before': ethBalanceBefore,
//            'ETH Balance After': ethBalanceAfter,
//            'ETH Spent (gas)': estimatedGasCost,
//            '-': {},
//            'ArbFor Balance BEFORE': wethBalanceBefore,
//            'ArbFor Balance AFTER': wethBalanceAfter,
//            'ArbFor Gained/Lost': wethBalanceDifference,
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
        if (totalGained > pairStats[pairID].highestCheckProfit) {
            pairStats[pairID].highestCheckProfit = Number(totalGained).toFixed(3)
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
        return false
    }
}

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
//        'ArbFor Balance BEFORE': web3.utils.fromWei(balanceBefore.toString(), 'ether'),
//        'ArbFor Balance AFTER': web3.utils.fromWei(balanceAfter.toString(), 'ether'),
//        'ArbFor Gained/Lost': web3.utils.fromWei(balanceDifference.toString(), 'ether'),
//        '-': {},
//        'Total Gained/Lost': `${web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether')} ETH`
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
