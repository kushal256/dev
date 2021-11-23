// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ILQTYStaking {

    // --- Events --
    
    event LQTYTokenAddressSet(address _lqtyTokenAddress);
    event DebtTokenAddressSet(address _debtTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

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
    )  external;

    function stake(uint _LQTYamount) external;

    function unstake(uint _LQTYamount) external;

    function increaseF_Collateral(uint _CollateralFee) external; 

    function increaseF_Debt(uint _LQTYFee) external;  

    function getPendingCollateralGain(address _user) external view returns (uint);

    function getPendingDebtGain(address _user) external view returns (uint);
}
