const { artifacts } = require("hardhat")
const deploymentHelper = require("../utils/deploymentHelpers.js")
const testHelpers = require("../utils/testHelpers.js")
const NonPayable = artifacts.require('NonPayable.sol')

const th = testHelpers.TestHelper
const dec = th.dec
const toBN = th.toBN
const mv = testHelpers.MoneyValues
const timeValues = testHelpers.TimeValues

const TroveManagerTester = artifacts.require("TroveManagerTester")
const DebtToken = artifacts.require("DebtToken")
const ERC20Mock = artifacts.require("./ERC20Mock.sol")



contract('ActivePool', async accounts => {
  const [
    owner,
    A, B, C, D, E] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  let borrowerOperations
  let priceFeed
  let activePool;

  let contracts

  async function openTroveHelper(account, collAmount, debtAmount) {
      await collateralToken.mint(account, collAmount);
      await collateralToken.approveInternal(account, borrowerOperations.address, collAmount);
      await borrowerOperations.openTrove(collAmount, th._100pct, debtAmount, th.ZERO_ADDRESS, th.ZERO_ADDRESS, { from: account })
  }

  beforeEach(async () => {
    collateralToken = await ERC20Mock.new("Test Collateral Token", "TEST", owner, 0);
    ERC20Mock.setAsDeployed(collateralToken)

    contracts = await deploymentHelper.deployLiquityCore(collateralToken)
    contracts.troveManager = await TroveManagerTester.new()
    contracts.debtToken = await DebtToken.new(
      contracts.troveManager.address,
      contracts.stabilityPool.address,
      contracts.borrowerOperations.address
    )
    const LQTYContracts = await deploymentHelper.deployLQTYContracts(bountyAddress, lpRewardsAddress, multisig)

    priceFeed = contracts.priceFeedTestnet
    collSurplusPool = contracts.collSurplusPool
    borrowerOperations = contracts.borrowerOperations
    activePool = contracts.activePool

    await deploymentHelper.connectCoreContracts(contracts, LQTYContracts)
    await deploymentHelper.connectLQTYContracts(LQTYContracts)
    await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, contracts)
  })

  describe("debt limit", () => {
      beforeEach(async () => {
        await activePool.setDebtLimit(0);
      });

      it("can raise debt limit", async () => {
        const initialLimit = await activePool.getDebtLimit();
        assert.equal(initialLimit, 0);
        await activePool.setDebtLimit(dec(100, 18));
        let updated = await activePool.getDebtLimit();
        assert.equal(updated, dec(100, 18));
      });

      it("can lower the debt limit", async () => {
        const initialLimit = await activePool.getDebtLimit();
        assert.equal(initialLimit, 0);
        await activePool.setDebtLimit(dec(1000000, 18));
        let updated = await activePool.getDebtLimit();
        assert.equal(updated, dec(1000000, 18));
        await activePool.setDebtLimit(dec(100, 18));
        updated = await activePool.getDebtLimit();
        assert.equal(updated, dec(100, 18));
      })

      it("can enforce the debt limit", async () => {
        // debt limit set to borrow amount 10,000 + 200 gas comp + 50 fees
        await activePool.setDebtLimit(dec(10250, 18));
        let updated = await activePool.getDebtLimit();
        assert.equal(updated, dec(10250, 18));
        await openTroveHelper(A, dec(100000, 18), dec(10000, 18));
        try {
            await openTroveHelper(B, dec(100000, 18), dec(10000, 18));
            assert.isTrue(false);
        } catch (err) {
            assert.include(err.message, "revert");
            assert.include(err.message, "ActivePool: Cannot exceed debt limit");
        }
      })

      it("can lower the debt limit to the current debt", async () => {
        await contracts.activePool.setDebtLimit("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        await openTroveHelper(A, dec(100000, 18), dec(10000, 18));
        // debt limit set to borrow amount 10,000 + 200 gas comp + 50 fees
        await activePool.setDebtLimit(dec(10250, 18));
        let updated = await activePool.getDebtLimit();
        assert.equal(updated, dec(10250, 18));
      })

      it("will revert if attempting to lower debt limit below current amount", async () => {
        await contracts.activePool.setDebtLimit("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        await openTroveHelper(A, dec(100000, 18), dec(10000, 18));
        // debt limit set to borrow amount 10,000 + 200 gas comp + 50 fees
        await th.assertRevert(activePool.setDebtLimit(dec(10249, 18)), "");
      });
  });
})

contract('Reset chain state', async accounts => { })

