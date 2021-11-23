// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/ILQTYToken.sol";
import "../Interfaces/ILQTYStaking.sol";
import "../Dependencies/LiquityMath.sol";
import "../Interfaces/IDebtToken.sol";
import "../LPRewards/Dependencies/SafeERC20.sol";

contract LQTYStaking is ILQTYStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    // --- Data ---
    string constant public NAME = "LQTYStaking";

    mapping( address => uint) public stakes;
    uint public totalLQTYStaked;

    uint public F_Collateral;  // Running sum of Collateral fees per-LQTY-staked
    uint public F_Debt; // Running sum of LQTY fees per-LQTY-staked

    // User snapshots of F_Collateral and F_Debt, taken at the point at which their latest deposit was made
    mapping (address => Snapshot) public snapshots; 

    struct Snapshot {
        uint F_Collateral_Snapshot;
        uint F_Debt_Snapshot;
    }
    
    ILQTYToken public lqtyToken;
    IDebtToken public debtToken;
    IERC20 internal collateralToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event DebtTokenAddressSet(address _debtTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);
    event CollateralTokenAddressChanged(address _collateralTokenAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint DebtGain, uint CollateralGain);
    event F_CollateralUpdated(uint _F_Collateral);
    event F_DebtUpdated(uint _F_Debt);
    event TotalLQTYStakedUpdated(uint _totalLQTYStaked);
    event CollateralSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_Collateral, uint _F_Debt);

    // --- Functions ---

    function setAddresses
    (
        address _lqtyTokenAddress,
        address _debtTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress,
        address _collateralTokenAddress
    ) 
        external 
        onlyOwner 
        override 
    {
        checkContract(_lqtyTokenAddress);
        checkContract(_debtTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);
        checkContract(_collateralTokenAddress);

        lqtyToken = ILQTYToken(_lqtyTokenAddress);
        debtToken = IDebtToken(_debtTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;
        collateralToken = IERC20(_collateralTokenAddress);

        emit LQTYTokenAddressSet(_lqtyTokenAddress);
        emit LQTYTokenAddressSet(_debtTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);
        emit CollateralTokenAddressChanged(_collateralTokenAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated Collateral and Debt gains to them. 
    function stake(uint _LQTYamount) external override {
        _requireNonZeroAmount(_LQTYamount);

        uint currentStake = stakes[msg.sender];

        uint CollateralGain;
        uint DebtGain;
        // Grab any accumulated Collateral and Debt gains from the current stake
        if (currentStake != 0) {
            CollateralGain = _getPendingCollateralGain(msg.sender);
            DebtGain = _getPendingDebtGain(msg.sender);
        }
    
       _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_LQTYamount);

        // Increase user’s stake and total LQTY staked
        stakes[msg.sender] = newStake;
        totalLQTYStaked = totalLQTYStaked.add(_LQTYamount);
        emit TotalLQTYStakedUpdated(totalLQTYStaked);

        // Transfer LQTY from caller to this contract
        lqtyToken.sendToLQTYStaking(msg.sender, _LQTYamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, DebtGain, CollateralGain);

         // Send accumulated Debt and Collateral gains to the caller
        if (currentStake != 0) {
            debtToken.transfer(msg.sender, DebtGain);
            _sendCollateralGainToUser(CollateralGain);
        }
    }

    // Unstake the LQTY and send the it back to the caller, along with their accumulated Debt & Collateral gains. 
    // If requested amount > stake, send their entire stake.
    function unstake(uint _LQTYamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated Collateral and Debt gains from the current stake
        uint CollateralGain = _getPendingCollateralGain(msg.sender);
        uint DebtGain = _getPendingDebtGain(msg.sender);
        
        _updateUserSnapshots(msg.sender);

        if (_LQTYamount > 0) {
            uint LQTYToWithdraw = LiquityMath._min(_LQTYamount, currentStake);

            uint newStake = currentStake.sub(LQTYToWithdraw);

            // Decrease user's stake and total LQTY staked
            stakes[msg.sender] = newStake;
            totalLQTYStaked = totalLQTYStaked.sub(LQTYToWithdraw);
            emit TotalLQTYStakedUpdated(totalLQTYStaked);

            // Transfer unstaked LQTY to user
            lqtyToken.transfer(msg.sender, LQTYToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, DebtGain, CollateralGain);

        // Send accumulated Debt and Collateral gains to the caller
        debtToken.transfer(msg.sender, DebtGain);
        _sendCollateralGainToUser(CollateralGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Liquity core contracts ---

    function increaseF_Collateral(uint _CollateralFee) external override {
        _requireCallerIsTroveManager();
        uint CollateralFeePerLQTYStaked;
     
        if (totalLQTYStaked > 0) {CollateralFeePerLQTYStaked = _CollateralFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);}

        F_Collateral = F_Collateral.add(CollateralFeePerLQTYStaked); 
        emit F_CollateralUpdated(F_Collateral);
    }

    function increaseF_Debt(uint _DebtFee) external override {
        _requireCallerIsBorrowerOperations();
        uint DebtFeePerLQTYStaked;    
        if (totalLQTYStaked > 0) {DebtFeePerLQTYStaked = _DebtFee.mul(DECIMAL_PRECISION).div(totalLQTYStaked);}
        F_Debt = F_Debt.add(DebtFeePerLQTYStaked);
        emit F_DebtUpdated(F_Debt);
    }

    // --- Pending reward functions ---

    function getPendingCollateralGain(address _user) external view override returns (uint) {
        return _getPendingCollateralGain(_user);
    }

    function _getPendingCollateralGain(address _user) internal view returns (uint) {
        uint F_Collateral_Snapshot = snapshots[_user].F_Collateral_Snapshot;
        uint CollateralGain = stakes[_user].mul(F_Collateral.sub(F_Collateral_Snapshot)).div(DECIMAL_PRECISION);
        return CollateralGain;
    }

    function getPendingDebtGain(address _user) external view override returns (uint) {
        return _getPendingDebtGain(_user);
    }

    function _getPendingDebtGain(address _user) internal view returns (uint) {
        uint F_Debt_Snapshot = snapshots[_user].F_Debt_Snapshot;
        uint DebtGain = stakes[_user].mul(F_Debt.sub(F_Debt_Snapshot)).div(DECIMAL_PRECISION);
        return DebtGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_Collateral_Snapshot = F_Collateral;
        snapshots[_user].F_Debt_Snapshot = F_Debt;
        emit StakerSnapshotsUpdated(_user, F_Collateral, F_Debt);
    }

    function _sendCollateralGainToUser(uint CollateralGain) internal {
        emit CollateralSent(msg.sender, CollateralGain);
        
        collateralToken.safeIncreaseAllowance(address(this), CollateralGain);
        collateralToken.safeTransferFrom(address(this), msg.sender, CollateralGain);        
        // require(success, "LQTYStaking: Failed to send accumulated CollateralGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "LQTYStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "LQTYStaking: caller is not BorrowerOps");
    }

     function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "LQTYStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {  
        require(currentStake > 0, 'LQTYStaking: User must have a non-zero stake');  
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, 'LQTYStaking: Amount must be non-zero');
    }

    receive() external payable {
        require(1<0, "in LQTYStaking payable!");
        _requireCallerIsActivePool();
    }
}
