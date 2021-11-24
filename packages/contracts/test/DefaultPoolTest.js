const testHelpers = require("../utils/testHelpers.js")
const DefaultPool = artifacts.require("./DefaultPool.sol")
const NonPayable = artifacts.require('NonPayable.sol')
const ERC20Mock = artifacts.require("./ERC20Mock.sol")

const th = testHelpers.TestHelper
const dec = th.dec

contract('DefaultPool', async accounts => {
  let defaultPool
  let nonPayable
  let mockActivePool
  let mockTroveManager
  let collateralToken

  let [owner] = accounts

  beforeEach('Deploy contracts', async () => {
    defaultPool = await DefaultPool.new()
    nonPayable = await NonPayable.new()
    mockTroveManager = await NonPayable.new()
    mockActivePool = await NonPayable.new()
    collateralToken = await ERC20Mock.new("Test Collateral Token", "TEST", owner, 0);
    await defaultPool.setAddresses(mockTroveManager.address, mockActivePool.address, collateralToken.address)
  })

  it.skip('sendCollateralToActivePool(): fails if receiver cannot receive ETH', async () => {
    const amount = dec(1, 'ether')

    // start pool with `amount`
    //await web3.eth.sendTransaction({ to: defaultPool.address, from: owner, value: amount })
    const tx = await mockActivePool.forward(defaultPool.address, '0x', { from: owner, value: amount })
    assert.isTrue(tx.receipt.status)

    // try to send ether from pool to non-payable
    //await th.assertRevert(defaultPool.sendCollateralToActivePool(amount, { from: owner }), 'DefaultPool: sending ETH failed')
    const sendCollateralData = th.getTransactionData('sendCollateralToActivePool(uint256)', [web3.utils.toHex(amount)])
    await th.assertRevert(mockTroveManager.forward(defaultPool.address, sendCollateralData, { from: owner }), 'DefaultPool: sending ETH failed')
  })
})

contract('Reset chain state', async accounts => { })
