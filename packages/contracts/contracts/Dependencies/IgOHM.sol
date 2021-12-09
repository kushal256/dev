// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IgOHM {
    /**
        @notice converts gOHM amount to OHM
        @param _amount uint
        @return uint
     */
    function balanceFrom(uint256 _amount) external view returns (uint256);
}