const MultiPriceFeed = artifacts.require("./MultiPriceFeed.sol")
const PriceFeedTestnet = artifacts.require("./PriceFeedTestnet.sol")
const gOHMTester = artifacts.require("./gOHMTester.sol")

const testHelpers = require("../utils/testHelpers.js")
const {dec, toBN} = testHelpers.TestHelper;

contract('PriceFeed', async accounts => {
  const [owner] = accounts;
  let ohmETHFeed;
  let ethUSDFeed;
  let gOHM;
  let priceFeed

  beforeEach(async () => {
    priceFeed = await MultiPriceFeed.new();
    MultiPriceFeed.setAsDeployed(priceFeed);
    ohmETHFeed = await PriceFeedTestnet.new();
    ethUSDFeed = await PriceFeedTestnet.new();
    PriceFeedTestnet.setAsDeployed(ohmETHFeed);
    PriceFeedTestnet.setAsDeployed(ethUSDFeed);
    
    gOHM = await gOHMTester.new();
    gOHMTester.setAsDeployed(gOHM);

    await priceFeed.setAddresses(
        ethUSDFeed.address,
        ohmETHFeed.address,
        gOHM.address,
        { from: owner }
    );
  });

  it("returns the USD price with 18 decimals", async () => {
      await ethUSDFeed.setPrice(toBN('4100682166650000000000'));
      await ohmETHFeed.setPrice(toBN('141193844780215400'));
      await gOHM.setIndex(toBN('41428690506'));
      await priceFeed.fetchPrice();
      let price = await priceFeed.lastPrice();
      // $23,986.84
      assert.equal(`${price}`, '23986842311112663398400');
  });

  it("reverts if the ETH-USD price is zero", async () => {
      await ethUSDFeed.setPrice(toBN('0'));
      await ohmETHFeed.setPrice(toBN('141193844780215400'));
      await gOHM.setIndex(toBN('41428690506'));
      try {
        await priceFeed.fetchPrice();
        assert.isTrue(false);
      } catch (err) {
        assert.include(err.message, "revert");
        assert.include(err.message, "ETH-USD");
      }
  });

  it("reverts if the OHM-ETH price is zero", async () => {
      await ethUSDFeed.setPrice(toBN('4100682166650000000000'));
      await ohmETHFeed.setPrice(toBN('0'));
      await gOHM.setIndex(toBN('41428690506'));
      try {
        await priceFeed.fetchPrice();
        assert.isTrue(false);
      } catch (err) {
        assert.include(err.message, "revert");
        assert.include(err.message, "OHM-ETH");
      }
  });
});