// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './Interfaces/IDefaultPool.sol';
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";
import "./LPRewards/Dependencies/SafeERC20.sol";
import "./Dependencies/IERC20.sol";

/*
 * The Default Pool holds the ETH and LUSD debt (but not LUSD tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending ETH and LUSD debt, its pending ETH and LUSD debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IDefaultPool {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string constant public NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    IERC20 internal collateralToken;
    // uint256 internal Collateral;  // deposited ETH tracker
    uint256 internal Debt;  // debt
    uint256 internal Collateral;

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event CollateralTokenAddressChanged(address _newCollateralTokenAddress);
    event DefaultPoolDebtUpdated(uint _Debt);
    event DefaultPoolCollateralUpdated(uint _ETH);

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress,
        address _collateralTokenAddress
    )
        external
        onlyOwner
    {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);
        checkContract(_collateralTokenAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;
        collateralToken = IERC20(_collateralTokenAddress);

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);
        emit CollateralTokenAddressChanged(_collateralTokenAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
    * Returns the ETH state variable.
    *
    * Not necessarily equal to the the contract's raw ETH balance - ether can be forcibly sent to contracts.
    */
    function getCollateral() external view override returns (uint) {
         return collateralToken.balanceOf(address(this));
    }

    function getDebt() external view override returns (uint) {
        return Debt;
    }

    // --- Pool functionality ---

    function sendCollateralToActivePool(uint _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
//        require(1 < 0, "oh no in sendCollateralToActivePool!");
        // Collateral = Collateral.sub(_amount);
        // emit DefaultPoolCollateralUpdated(Collateral);
        emit CollateralSent(activePool, _amount);

        collateralToken.safeTransfer(activePool, _amount);
        
        // emit DefaultPoolCollateralUpdated(Collateral);
        emit CollateralSent(activePool, _amount);

        // (bool success, ) = activePool.call{ value: _amount }("");
        // require(success, "DefaultPool: sending ETH failed");
    }

    function increaseDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        Debt = Debt.add(_amount);
        emit DefaultPoolDebtUpdated(Debt);
    }

    function decreaseDebt(uint _amount) external override {
        _requireCallerIsTroveManager();

        Debt = Debt.sub(_amount);
        emit DefaultPoolDebtUpdated(Debt);
    }

    function addCollateral(uint _amount) external override {
        _requireCallerIsActivePool();
        Collateral = Collateral.add(_amount);
        emit DefaultPoolCollateralUpdated(Collateral);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "DefaultPool: Caller is not the ActivePool");
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "DefaultPool: Caller is not the TroveManager");
    }

    // --- Fallback function ---

//TODO remove this
    receive() external payable {
        _requireCallerIsActivePool();
        require(1 < 0, "oh no in defaultPool payable!");
        // Collateral = Collateral.add(msg.value);
        // emit DefaultPoolCollateralUpdated(Collateral);
    }
}
