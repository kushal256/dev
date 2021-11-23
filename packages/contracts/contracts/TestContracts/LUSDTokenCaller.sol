// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IDebtToken.sol";

contract DebtTokenCaller {
    IDebtToken debt;

    function setdebt(IDebtToken _debt) external {
        debt = _debt;
    }

    function debtMint(address _account, uint _amount) external {
        debt.mint(_account, _amount);
    }

    function debtBurn(address _account, uint _amount) external {
        debt.burn(_account, _amount);
    }

    function debtSendToPool(address _sender,  address _poolAddress, uint256 _amount) external {
        debt.sendToPool(_sender, _poolAddress, _amount);
    }

    function debtReturnFromPool(address _poolAddress, address _receiver, uint256 _amount ) external {
        debt.returnFromPool(_poolAddress, _receiver, _amount);
    }
}
