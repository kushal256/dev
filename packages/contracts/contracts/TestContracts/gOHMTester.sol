// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/IgOHM.sol";
import "../Dependencies/SafeMath.sol";

contract gOHMTester is IgOHM {
    using SafeMath for uint256;

    uint256 immutable decimals = 18;
    uint256 public index = 0;

    function setIndex(uint256 _index) external {
        index = _index;
    }

    /**
        @notice converts gOHM amount to OHM
        @param _amount uint
        @return uint
     */
    function balanceFrom(uint256 _amount) public view override returns (uint256) {
        return _amount.mul(index).div(10**decimals);
    }
}