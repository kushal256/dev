const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js")
const { BNConverter } = require("../utils/BNConverter.js")
const testHelpers = require("../utils/testHelpers.js")

const LQTYStakingTester = artifacts.require('LQTYStakingTester')
const TroveManagerTester = artifacts.require("TroveManagerTester")
const NonPayable = artifacts.require("./NonPayable.sol")
const ERC20Mock = artifacts.require("./ERC20Mock.sol")

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const dec = th.dec
const assertRevert = th.assertRevert

const toBN = th.toBN
const ZERO = th.toBN('0')

/* NOTE: These tests do not test for specific Collateral and LUSD gain values. They only test that the 
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake. 
 *
 * Specific Collateral/LUSD gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 * 
 */ 

contract('LQTYStaking revenue share tests', async accounts => {

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)
  
  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed
  let lusdToken
  let sortedTroves
  let troveManager
  let activePool
  let stabilityPool
  let defaultPool
  let borrowerOperations
  let lqtyStaking
  let lqtyToken

  let contracts

  const openTrove = async (params) => th.openTrove(contracts, params)

  beforeEach(async () => {
    collateralToken = await ERC20Mock.new("Test Collateral Token", "TEST", owner, 0);
    ERC20Mock.setAsDeployed(collateralToken)


    contracts = await deploymentHelper.deployLiquityCore(collateralToken)
    contracts.troveManager = await TroveManagerTester.new()
    contracts = await deploymentHelper.deployDebtTokenTester(contracts)
    const LQTYContracts = await deploymentHelper.deployLQTYTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)
    
    await deploymentHelper.connectLQTYContracts(LQTYContracts)
    await deploymentHelper.connectCoreContracts(contracts, LQTYContracts)
    await deploymentHelper.connectLQTYContractsToCore(LQTYContracts, contracts)

    nonPayable = await NonPayable.new() 
    priceFeed = contracts.priceFeedTestnet
    lusdToken = contracts.lusdToken
    sortedTroves = contracts.sortedTroves
    troveManager = contracts.troveManager
    activePool = contracts.activePool
    stabilityPool = contracts.stabilityPool
    defaultPool = contracts.defaultPool
    borrowerOperations = contracts.borrowerOperations
    hintHelpers = contracts.hintHelpers

    lqtyToken = LQTYContracts.lqtyToken
    lqtyStaking = LQTYContracts.lqtyStaking
  })

  it('stake(): reverts if amount is zero', async () => {
    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // console.log(`A lqty bal: ${await lqtyToken.balanceOf(A)}`)

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await assertRevert(lqtyStaking.stake(0, {from: A}), "LQTYStaking: Amount must be non-zero")
  })

  it("Collateral fee per LQTY staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // console.log(`A lqty bal: ${await lqtyToken.balanceOf(A)}`)

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(100, 18), {from: A})

    // Check Collateral fee per unit staked is zero
    const F_Collateral_Before = await lqtyStaking.F_Collateral()
    assert.equal(F_Collateral_Before, '0')

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee emitted in event is non-zero
    const emittedCollateralFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3])
    assert.isTrue(emittedCollateralFee.gt(toBN('0')))

    // Check Collateral fee per unit staked has increased by correct amount
    const F_Collateral_After = await lqtyStaking.F_Collateral()

    // Expect fee per unit staked = fee/100, since there is 100 LUSD totalStaked
    const expected_F_Collateral_After = emittedCollateralFee.div(toBN('100')) 

    assert.isTrue(expected_F_Collateral_After.eq(F_Collateral_After))
  })

  it("Collateral fee per LQTY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // Check Collateral fee per unit staked is zero
    const F_Collateral_Before = await lqtyStaking.F_Collateral()
    assert.equal(F_Collateral_Before, '0')

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee emitted in event is non-zero
    const emittedCollateralFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3])
    assert.isTrue(emittedCollateralFee.gt(toBN('0')))

    // Check Collateral fee per unit staked has not increased 
    const F_Collateral_After = await lqtyStaking.F_Collateral()
    assert.equal(F_Collateral_After, '0')
  })

  it("LUSD fee per LQTY staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(100, 18), {from: A})

    // Check LUSD fee per unit staked is zero
    const F_Debt_Before = await lqtyStaking.F_Collateral()
    assert.equal(F_Debt_Before, '0')

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate()
    assert.isTrue(baseRate.gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawLUSD(th._100pct, dec(27, 18), D, D, {from: D})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(tx))
    assert.isTrue(emittedLUSDFee.gt(toBN('0')))
    
    // Check LUSD fee per unit staked has increased by correct amount
    const F_Debt_After = await lqtyStaking.F_Debt()

    // Expect fee per unit staked = fee/100, since there is 100 LUSD totalStaked
    const expected_F_Debt_After = emittedLUSDFee.div(toBN('100')) 

    assert.isTrue(expected_F_Debt_After.eq(F_Debt_After))
  })

  it("LUSD fee per LQTY staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // Check LUSD fee per unit staked is zero
    const F_Debt_Before = await lqtyStaking.F_Collateral()
    assert.equal(F_Debt_Before, '0')

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate()
    assert.isTrue(baseRate.gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawLUSD(th._100pct, dec(27, 18), D, D, {from: D})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(tx))
    assert.isTrue(emittedLUSDFee.gt(toBN('0')))
    
    // Check LUSD fee per unit staked did not increase, is still zero
    const F_Debt_After = await lqtyStaking.F_Debt()
    assert.equal(F_Debt_After, '0')
  })

  it("LQTY Staking: A single staker earns all Collateral and LQTY fees that occur", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(100, 18), {from: A})

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee 1 emitted in event is non-zero
    const emittedCollateralFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedCollateralFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    
    const C_BalAfterRedemption = await lusdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check Collateral fee 2 emitted in event is non-zero
     const emittedCollateralFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedCollateralFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedLUSDFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedLUSDFee_2.gt(toBN('0')))

    const expectedTotalCollateralGain = emittedCollateralFee_1.add(emittedCollateralFee_2)
    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2)

    const A_CollateralBalance_Before = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A))

    // A un-stakes
    await lqtyStaking.unstake(dec(100, 18), {from: A})

    const A_CollateralBalance_After = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A))


    const A_CollateralGain = A_CollateralBalance_After.sub(A_CollateralBalance_Before)
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before)

    assert.isAtMost(th.getDifference(expectedTotalCollateralGain, A_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000)
  })

  it("stake(): Top-up sends out all accumulated Collateral and LUSD gains to the staker", async () => { 
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee 1 emitted in event is non-zero
    const emittedCollateralFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedCollateralFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    
    const C_BalAfterRedemption = await lusdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check Collateral fee 2 emitted in event is non-zero
     const emittedCollateralFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedCollateralFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedLUSDFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedLUSDFee_2.gt(toBN('0')))

    const expectedTotalCollateralGain = emittedCollateralFee_1.add(emittedCollateralFee_2)
    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2)

    const A_CollateralBalance_Before = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A))

    // A tops up
    await lqtyStaking.stake(dec(50, 18), {from: A})

    const A_CollateralBalance_After = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A))

    const A_CollateralGain = A_CollateralBalance_After.sub(A_CollateralBalance_Before)
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before)

    assert.isAtMost(th.getDifference(expectedTotalCollateralGain, A_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000)
  })

  it("getPendingCollateralGain(): Returns the staker's correct pending Collateral gain", async () => { 
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee 1 emitted in event is non-zero
    const emittedCollateralFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedCollateralFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    
    const C_BalAfterRedemption = await lusdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check Collateral fee 2 emitted in event is non-zero
     const emittedCollateralFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedCollateralFee_2.gt(toBN('0')))

    const expectedTotalCollateralGain = emittedCollateralFee_1.add(emittedCollateralFee_2)

    const A_CollateralGain = await lqtyStaking.getPendingCollateralGain(A)

    assert.isAtMost(th.getDifference(expectedTotalCollateralGain, A_CollateralGain), 1000)
  })

  it("getPendingLUSDGain(): Returns the staker's correct pending LUSD gain", async () => { 
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await lusdToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18))
    
    const B_BalAfterRedemption = await lusdToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check Collateral fee 1 emitted in event is non-zero
    const emittedCollateralFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedCollateralFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await lusdToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18))
    
    const C_BalAfterRedemption = await lusdToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check Collateral fee 2 emitted in event is non-zero
     const emittedCollateralFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedCollateralFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedLUSDFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check LUSD fee value in event is non-zero
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedLUSDFee_2.gt(toBN('0')))

    const expectedTotalLUSDGain = emittedLUSDFee_1.add(emittedLUSDFee_2)
    const A_LUSDGain = await lqtyStaking.getPendingDebtGain(A)

    assert.isAtMost(th.getDifference(expectedTotalLUSDGain, A_LUSDGain), 1000)
  })

  // - multi depositors, several rewards
  it("LQTY Staking: Multiple stakers earn the correct share of all Collateral and LQTY fees, based on their stake size", async () => {
    await openTrove({ extraLUSDAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
    await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: F } })
    await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: G } })

    // FF time one year so owner can transfer LQTY
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers LQTY to staker A, B, C
    await lqtyToken.transfer(A, dec(100, 18), {from: multisig})
    await lqtyToken.transfer(B, dec(200, 18), {from: multisig})
    await lqtyToken.transfer(C, dec(300, 18), {from: multisig})

    // A, B, C make stake
    await lqtyToken.approve(lqtyStaking.address, dec(100, 18), {from: A})
    await lqtyToken.approve(lqtyStaking.address, dec(200, 18), {from: B})
    await lqtyToken.approve(lqtyStaking.address, dec(300, 18), {from: C})
    await lqtyStaking.stake(dec(100, 18), {from: A})
    await lqtyStaking.stake(dec(200, 18), {from: B})
    await lqtyStaking.stake(dec(300, 18), {from: C})

    // Confirm staking contract holds 600 LQTY
    // console.log(`lqty staking LQTY bal: ${await lqtyToken.balanceOf(lqtyStaking.address)}`)
    assert.equal(await lqtyToken.balanceOf(lqtyStaking.address), dec(600, 18))
    assert.equal(await lqtyStaking.totalLQTYStaked(), dec(600, 18))

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(F, contracts, dec(45, 18))
    const emittedCollateralFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedCollateralFee_1.gt(toBN('0')))

     // G redeems
     const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(G, contracts, dec(197, 18))
     const emittedCollateralFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedCollateralFee_2.gt(toBN('0')))

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawLUSD(th._100pct, dec(104, 18), F, F, {from: F})
    const emittedLUSDFee_1 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedLUSDFee_1.gt(toBN('0')))

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), G, G, {from: G})
    const emittedLUSDFee_2 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedLUSDFee_2.gt(toBN('0')))

    // D obtains LQTY from owner and makes a stake
    await lqtyToken.transfer(D, dec(50, 18), {from: multisig})
    await lqtyToken.approve(lqtyStaking.address, dec(50, 18), {from: D})
    await lqtyStaking.stake(dec(50, 18), {from: D})

    // Confirm staking contract holds 650 LQTY
    assert.equal(await lqtyToken.balanceOf(lqtyStaking.address), dec(650, 18))
    assert.equal(await lqtyStaking.totalLQTYStaked(), dec(650, 18))

     // G redeems
     const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(197, 18))
     const emittedCollateralFee_3 = toBN((await th.getEmittedRedemptionValues(redemptionTx_3))[3])
     assert.isTrue(emittedCollateralFee_3.gt(toBN('0')))

     // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawLUSD(th._100pct, dec(17, 18), G, G, {from: G})
    const emittedLUSDFee_3 = toBN(th.getLUSDFeeFromLUSDBorrowingEvent(borrowingTx_3))
    assert.isTrue(emittedLUSDFee_3.gt(toBN('0')))
     
    /*  
    Expected rewards:

    A_Collateral: (100* CollateralFee_1)/600 + (100* CollateralFee_2)/600 + (100*Collateral_Fee_3)/650
    B_Collateral: (200* CollateralFee_1)/600 + (200* CollateralFee_2)/600 + (200*Collateral_Fee_3)/650
    C_Collateral: (300* CollateralFee_1)/600 + (300* CollateralFee_2)/600 + (300*Collateral_Fee_3)/650
    D_Collateral:                                             (100*Collateral_Fee_3)/650

    A_LUSD: (100*LUSDFee_1 )/600 + (100* LUSDFee_2)/600 + (100*LUSDFee_3)/650
    B_LUSD: (200* LUSDFee_1)/600 + (200* LUSDFee_2)/600 + (200*LUSDFee_3)/650
    C_LUSD: (300* LUSDFee_1)/600 + (300* LUSDFee_2)/600 + (300*LUSDFee_3)/650
    D_LUSD:                                               (100*LUSDFee_3)/650
    */

    // Expected Collateral gains
    const expectedCollateralGain_A = toBN('100').mul(emittedCollateralFee_1).div( toBN('600'))
                            .add(toBN('100').mul(emittedCollateralFee_2).div( toBN('600')))
                            .add(toBN('100').mul(emittedCollateralFee_3).div( toBN('650')))

    const expectedCollateralGain_B = toBN('200').mul(emittedCollateralFee_1).div( toBN('600'))
                            .add(toBN('200').mul(emittedCollateralFee_2).div( toBN('600')))
                            .add(toBN('200').mul(emittedCollateralFee_3).div( toBN('650')))

    const expectedCollateralGain_C = toBN('300').mul(emittedCollateralFee_1).div( toBN('600'))
                            .add(toBN('300').mul(emittedCollateralFee_2).div( toBN('600')))
                            .add(toBN('300').mul(emittedCollateralFee_3).div( toBN('650')))

    const expectedCollateralGain_D = toBN('50').mul(emittedCollateralFee_3).div( toBN('650'))

    // Expected LUSD gains:
    const expectedLUSDGain_A = toBN('100').mul(emittedLUSDFee_1).div( toBN('600'))
                            .add(toBN('100').mul(emittedLUSDFee_2).div( toBN('600')))
                            .add(toBN('100').mul(emittedLUSDFee_3).div( toBN('650')))

    const expectedLUSDGain_B = toBN('200').mul(emittedLUSDFee_1).div( toBN('600'))
                            .add(toBN('200').mul(emittedLUSDFee_2).div( toBN('600')))
                            .add(toBN('200').mul(emittedLUSDFee_3).div( toBN('650')))

    const expectedLUSDGain_C = toBN('300').mul(emittedLUSDFee_1).div( toBN('600'))
                            .add(toBN('300').mul(emittedLUSDFee_2).div( toBN('600')))
                            .add(toBN('300').mul(emittedLUSDFee_3).div( toBN('650')))
    
    const expectedLUSDGain_D = toBN('50').mul(emittedLUSDFee_3).div( toBN('650'))


    const A_CollateralBalance_Before = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_Before = toBN(await lusdToken.balanceOf(A))
    const B_CollateralBalance_Before = toBN(await collateralToken.balanceOf(B))
    const B_LUSDBalance_Before = toBN(await lusdToken.balanceOf(B))
    const C_CollateralBalance_Before = toBN(await collateralToken.balanceOf(C))
    const C_LUSDBalance_Before = toBN(await lusdToken.balanceOf(C))
    const D_CollateralBalance_Before = toBN(await collateralToken.balanceOf(D))
    const D_LUSDBalance_Before = toBN(await lusdToken.balanceOf(D))

    // A-D un-stake
    const unstake_A = await lqtyStaking.unstake(dec(100, 18), {from: A})
    const unstake_B = await lqtyStaking.unstake(dec(200, 18), {from: B})
    const unstake_C = await lqtyStaking.unstake(dec(400, 18), {from: C})
    const unstake_D = await lqtyStaking.unstake(dec(50, 18), {from: D})

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal((await lqtyToken.balanceOf(lqtyStaking.address)), '0')
    assert.equal((await lqtyStaking.totalLQTYStaked()), '0')

    // Get A-D Collateral and LUSD balances
    const A_CollateralBalance_After = toBN(await collateralToken.balanceOf(A))
    const A_LUSDBalance_After = toBN(await lusdToken.balanceOf(A))
    const B_CollateralBalance_After = toBN(await collateralToken.balanceOf(B))
    const B_LUSDBalance_After = toBN(await lusdToken.balanceOf(B))
    const C_CollateralBalance_After = toBN(await collateralToken.balanceOf(C))
    const C_LUSDBalance_After = toBN(await lusdToken.balanceOf(C))
    const D_CollateralBalance_After = toBN(await collateralToken.balanceOf(D))
    const D_LUSDBalance_After = toBN(await lusdToken.balanceOf(D))

    // Get Collateral and LUSD gains
    const A_CollateralGain = A_CollateralBalance_After.sub(A_CollateralBalance_Before)
    const A_LUSDGain = A_LUSDBalance_After.sub(A_LUSDBalance_Before)
    const B_CollateralGain = B_CollateralBalance_After.sub(B_CollateralBalance_Before)
    const B_LUSDGain = B_LUSDBalance_After.sub(B_LUSDBalance_Before)
    const C_CollateralGain = C_CollateralBalance_After.sub(C_CollateralBalance_Before)
    const C_LUSDGain = C_LUSDBalance_After.sub(C_LUSDBalance_Before)
    const D_CollateralGain = D_CollateralBalance_After.sub(D_CollateralBalance_Before)
    const D_LUSDGain = D_LUSDBalance_After.sub(D_LUSDBalance_Before)

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedCollateralGain_A, A_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedLUSDGain_A, A_LUSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedCollateralGain_B, B_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedLUSDGain_B, B_LUSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedCollateralGain_C, C_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedLUSDGain_C, C_LUSDGain), 1000)
    assert.isAtMost(th.getDifference(expectedCollateralGain_D, D_CollateralGain), 1000)
    assert.isAtMost(th.getDifference(expectedLUSDGain_D, D_LUSDGain), 1000)
  })
 
  // TODO not relevant for ERC20 (right?)
  // it("unstake(): reverts if caller has Collateral gains and can't receive Collateral",  async () => {
  //   await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })  
  //   await openTrove({ extraLUSDAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
  //   await openTrove({ extraLUSDAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
  //   await openTrove({ extraLUSDAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
  //   await openTrove({ extraLUSDAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

  //   // multisig transfers LQTY to staker A and the non-payable proxy
  //   await lqtyToken.transfer(A, dec(100, 18), {from: multisig})
  //   await lqtyToken.transfer(nonPayable.address, dec(100, 18), {from: multisig})

  //   //  A makes stake
  //   const A_stakeTx = await lqtyStaking.stake(dec(100, 18), {from: A})
  //   assert.isTrue(A_stakeTx.receipt.status)

  //   //  A tells proxy to make a stake
  //   const proxystakeTxData = await th.getTransactionData('stake(uint256)', ['0x56bc75e2d63100000'])  // proxy stakes 100 LQTY
  //   await nonPayable.forward(lqtyStaking.address, proxystakeTxData, {from: A})


  //   // B makes a redemption, creating Collateral gain for proxy
  //   const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(45, 18))
    
  //   const proxy_CollateralGain = await lqtyStaking.getPendingCollateralGain(nonPayable.address)
  //   assert.isTrue(proxy_CollateralGain.gt(toBN('0')))

  //   // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated Collateral gain (albeit 0),
  //   //  A tells proxy to unstake
  //   const proxyUnStakeTxData = await th.getTransactionData('unstake(uint256)', ['0x56bc75e2d63100000'])  // proxy stakes 100 LQTY
  //   const proxyUnstakeTxPromise = nonPayable.forward(lqtyStaking.address, proxyUnStakeTxData, {from: A})
   
  //   // but nonPayable proxy can not accept Collateral - therefore stake() reverts.
  //   await assertRevert(proxyUnstakeTxPromise)
  // })

  // //TODO ensure it's safe to remove this - we cannot capture this for erc20
  // it("receive(): reverts when it receives Collateral from an address that is not the Active Pool",  async () => { 
  //   const CollateralSendTxPromise1 = web3.Collateral.sendTransaction({to: lqtyStaking.address, from: A, value: dec(1, 'Collateraler')})
  //   const CollateralSendTxPromise2 = web3.Collateral.sendTransaction({to: lqtyStaking.address, from: owner, value: dec(1, 'Collateraler')})

  //   await assertRevert(CollateralSendTxPromise1)
  //   await assertRevert(CollateralSendTxPromise2)
  // })

  it("unstake(): reverts if user has no stake",  async () => {  
    const unstakeTxPromise1 = lqtyStaking.unstake(1, {from: A})
    const unstakeTxPromise2 = lqtyStaking.unstake(1, {from: owner})

    await assertRevert(unstakeTxPromise1)
    await assertRevert(unstakeTxPromise2)
  })

  it('Test requireCallerIsTroveManager', async () => {
    const lqtyStakingTester = await LQTYStakingTester.new()
    await assertRevert(lqtyStakingTester.requireCallerIsTroveManager(), 'LQTYStaking: caller is not TroveM')
  })
})
