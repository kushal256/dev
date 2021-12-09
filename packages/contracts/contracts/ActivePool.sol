// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './Interfaces/IActivePool.sol';
import './Interfaces/IDefaultPool.sol';
import './Interfaces/IStabilityPool.sol';
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";
// import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./LPRewards/Dependencies/SafeERC20.sol";

/*
 * The Active Pool holds the Collateral token and debt amount (but not debt tokens) for all active troves.
 *
 * When a trove is liquidated, it's Collateral and debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IActivePool {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string constant public NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    
    IERC20 internal collateralToken;
    uint256 internal Debt;
    uint256 internal debtLimit;

    
    // --- Events ---

    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolDebtUpdated(uint _Debt);
    event ActivePoolCollateralUpdated(uint _Collateral);
    event DebtLimitChanged(uint256 _debtLimit);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress,
        address _collateralTokenAddress
    )
        external
        onlyOwner
    {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);
        checkContract(_collateralTokenAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;
        collateralToken = IERC20(_collateralTokenAddress);

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);
    }

    function renounceOwnership() external onlyOwner {
        _renounceOwnership();
    }

    function setDebtLimit(uint256 _debtLimit) external onlyOwner {
        require(_debtLimit >= Debt, "ActivePool: Cannot lower debt limit below current debt");
        debtLimit = _debtLimit;
        emit DebtLimitChanged(debtLimit);
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
    * Returns the Collateral state variable.
    *
    */
    function getCollateral() external view override returns (uint) {
        return collateralToken.balanceOf(address(this));
    }

    function getDebt() external view override returns (uint) {
        return Debt;
    }

    function getDebtLimit() external view override returns (uint) {
        return debtLimit;
    }

    // --- Pool functionality ---
    function sendCollateral(address _account, uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        require(_account != address(0), "Account cannot be zero address");

        // Collateral = Collateral.sub(_amount);
        // emit ActivePoolCollateralUpdated(Collateral); //TODO before was current value, now would be delta value
        emit CollateralSent(_account, _amount);

        if (_account == defaultPoolAddress) {
            IDefaultPool(defaultPoolAddress).addCollateral(_amount);
        } else if (_account == stabilityPoolAddress) {
            IStabilityPool(stabilityPoolAddress).addCollateral(_amount);
        }

        // console.log("Sending collateral to account:", _account, _amount);
        collateralToken.safeTransfer(_account, _amount);
       
       // require(success, "ActivePool: sending Collateral failed");
    }

    function increaseDebt(uint _amount) external override {
        _requireCallerIsBOorTroveM();
        _requireBelowDebtLimit(_amount);
        Debt  = Debt.add(_amount);
        ActivePoolDebtUpdated(Debt);
    }

    function decreaseDebt(uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        Debt = Debt.sub(_amount);
        ActivePoolDebtUpdated(Debt);
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BO nor Default Pool");
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress ||
            msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool");
    }

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager");
    }

    function _requireBelowDebtLimit(uint256 _amount) internal view {
        require((Debt + _amount) <= debtLimit, "ActivePool: Cannot exceed debt limit");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        require(1<0, "oh no in payable!");
        // Collateral = Collateral.add(msg.value);
        // emit ActivePoolCollateralUpdated(Collateral);
    }
}
