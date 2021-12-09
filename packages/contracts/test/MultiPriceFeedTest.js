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
      let price = await priceFeed.lastGoodPrice();
      // $23,986.84
      assert.equal(`${price}`, '23986842311112663398400');
  });

  it("avoids rounding errors when index is large", async () => {
      await ethUSDFeed.setPrice(toBN('4100682166650000000000'));
      await ohmETHFeed.setPrice(toBN('141193844780215400'));
      await gOHM.setIndex(dec(10000, 9));
      await priceFeed.fetchPrice();
      let price = await priceFeed.lastGoodPrice();
      // $5,789,910.81
      assert.equal(`${price}`, '5789910813309143290203300');
  });

  it("minimizes rounding errors when eth price is large", async () => {
      await ethUSDFeed.setPrice(toBN('41006821666500000000000000'));
      await ohmETHFeed.setPrice(toBN('141193844780215400'));
      await gOHM.setIndex(toBN('41428690506'));
      await priceFeed.fetchPrice();
      let price = await priceFeed.lastGoodPrice();
      // $239,868,423.11
      assert.equal(`${price}`, '239868423111126633984000000');
  });

  it("minimizes rounding errors when OHM price is large", async () => {
      await ethUSDFeed.setPrice(toBN('4100682166650000000000'));
      await ohmETHFeed.setPrice(toBN('1411938447802154000000'));
      await gOHM.setIndex(toBN('41428690506'));
      await priceFeed.fetchPrice();
      let price = await priceFeed.lastGoodPrice();
      // $239,868,423.14
      assert.equal(`${price}`, '239868423141951461830708050');
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

  it("bothOraclesUntrusted ", async () => {
    await ethUSDFeed.setStatus(2);
    await ohmETHFeed.setStatus(2);
    await priceFeed.fetchPrice();
    let status = await priceFeed.status();
    assert.equal(status, 2);
  });

  it("chainlinkWorking ", async () => {
    await ethUSDFeed.setStatus(0);
    await ohmETHFeed.setStatus(0);         
    await priceFeed.fetchPrice();
    let status = await priceFeed.status();
    assert.equal(status, 0);
  });

  it("usingTellorChainlinkUntrusted ", async () => {
    await ethUSDFeed.setStatus(1);
    await ohmETHFeed.setStatus(0);         
    await priceFeed.fetchPrice();
    let status = await priceFeed.status();
    assert.equal(status, 1);
  });
  
  it("usingTellorChainlinkFrozen ", async () => {
    await ethUSDFeed.setStatus(3);
    await ohmETHFeed.setStatus(0);         
    await priceFeed.fetchPrice();
    let status = await priceFeed.status();
    assert.equal(status, 3);
  });    

  it("usingChainlinkTellorUntrusted ", async () => {
    await ethUSDFeed.setStatus(4);
    await ohmETHFeed.setStatus(0);         
    await priceFeed.fetchPrice();
    let status = await priceFeed.status();
    assert.equal(status, 4);
  });    

});