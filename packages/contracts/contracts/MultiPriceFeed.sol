// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IPriceFeed.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/IgOHM.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";

contract MultiPriceFeed is Ownable, CheckContract, IPriceFeed {
    using SafeMath for uint256;

    IPriceFeed public ethUSDFeed;
    IPriceFeed public ohmETHFeed;
    IgOHM public gOHM;
    uint256 public lastPrice;

    function setAddresses(
        address _ethUSDFeedAddress,
        address _ohmETHFeedAddress,
        address _gOHMAddress
    )
        external
        onlyOwner
    {
        checkContract(_ethUSDFeedAddress);
        checkContract(_ohmETHFeedAddress);
        checkContract(_gOHMAddress);

        ethUSDFeed = IPriceFeed(_ethUSDFeedAddress);
        ohmETHFeed = IPriceFeed(_ohmETHFeedAddress);
        gOHM = IgOHM(_gOHMAddress);

        _renounceOwnership();
    }

    function fetchPrice() external override returns (uint) {
        uint256 ohmETHPrice = ohmETHFeed.fetchPrice();
        uint256 ethUSDPrice = ethUSDFeed.fetchPrice();

        require(ohmETHPrice > 0, "PriceFeed: OHM-ETH price is zero");
        require(ethUSDPrice > 0, "PriceFeed: ETH-USD price is zero");

        lastPrice = gOHM.balanceFrom(1e18).mul(ohmETHPrice).div(1e18).mul(ethUSDPrice).div(1e9);

        return lastPrice;
    }
}