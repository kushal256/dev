// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./Interfaces/IPriceFeed.sol";
import "./Dependencies/SafeMath.sol";
import "./Dependencies/IgOHM.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";
contract MultiPriceFeed is Ownable, CheckContract, IPriceFeed {
    using SafeMath for uint256;

    IPriceFeed public ethUSDFeed;
    IPriceFeed public ohmETHFeed;
    IgOHM public gOHM;

    // The current status of the PricFeed,
    IPriceFeed.Status public override status;

    // The last good price computed from last good prices of the multiple price feeds
    uint public lastGoodPrice;

    event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus);

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
        if (ohmETHFeed.status() == IPriceFeed.Status.bothOraclesUntrusted || 
            ethUSDFeed.status() == IPriceFeed.Status.bothOraclesUntrusted) {        
            _changeStatus(IPriceFeed.Status.bothOraclesUntrusted);
            return lastGoodPrice;
        }
        if (ohmETHFeed.status() == IPriceFeed.Status.chainlinkWorking && 
            ethUSDFeed.status() == IPriceFeed.Status.chainlinkWorking) {
            //Happy path                      
            _changeStatus(IPriceFeed.Status.chainlinkWorking);        
        } else if (ohmETHFeed.status() == IPriceFeed.Status.usingTellorChainlinkFrozen ||
            ethUSDFeed.status() == IPriceFeed.Status.usingTellorChainlinkFrozen) {            
            _changeStatus(IPriceFeed.Status.usingTellorChainlinkFrozen);            
        } else if (ohmETHFeed.status() == IPriceFeed.Status.usingTellorChainlinkUntrusted ||
            ethUSDFeed.status() == IPriceFeed.Status.usingTellorChainlinkUntrusted) {
            _changeStatus(IPriceFeed.Status.usingTellorChainlinkUntrusted);                    
        } else if (ohmETHFeed.status() == IPriceFeed.Status.usingChainlinkTellorUntrusted ||
            ethUSDFeed.status() == IPriceFeed.Status.usingChainlinkTellorUntrusted) {
            _changeStatus(IPriceFeed.Status.usingChainlinkTellorUntrusted);            
        }

        uint256 ohmETHPrice = ohmETHFeed.fetchPrice();
        uint256 ethUSDPrice = ethUSDFeed.fetchPrice();

        require(ohmETHPrice > 0, "PriceFeed: OHM-ETH price is zero");
        require(ethUSDPrice > 0, "PriceFeed: ETH-USD price is zero");

        lastGoodPrice = gOHM.balanceFrom(1e18).mul(ohmETHPrice).div(1e18).mul(ethUSDPrice).div(1e9);

        return lastGoodPrice;
    }


    function _changeStatus(Status _status) internal {        
        if (status != _status){
            status = _status;            
            emit PriceFeedStatusChanged(_status);
        }
    }

}