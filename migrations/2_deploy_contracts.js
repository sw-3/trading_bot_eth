const Arbitrage = artifacts.require("Arbitrage")

const config = require("../config.json")

module.exports = async function (deployer) {
    await deployer.deploy(
        Arbitrage,
        config.EXCHANGES.SUSHISWAP.V2_ROUTER_02_ADDRESS,
        config.EXCHANGES.UNISWAP.V2_ROUTER_02_ADDRESS,
        config.EXCHANGES.SHIBASWAP.V2_ROUTER_02_ADDRESS
    );
};