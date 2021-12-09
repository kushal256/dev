// script to test deployment against rinkeby
// run in packages/lib-ethers
// may need to run yarn prepare from the project root first
// run with:
// WALLET_PRIVATE_KEY=<private-key> yarn run ts-node utils/smoketest.ts

import { ethers } from 'ethers';
import { EthersLiquity } from "../src/EthersLiquity";
import erc20MockAbi from "../abi/ERC20Mock.json";
import { ERC20Mock } from "../types";
import { Decimal } from "@liquity/lib-base";

async function main() {
  const provider = new ethers.providers.InfuraProvider("rinkeby", "ad9cef41c9c844a7b54d10be24d416e5");//732f815750f643e2bf582276a71b2048
  let wallet = new ethers.Wallet(process.env['WALLET_PRIVATE_KEY'] as string, provider);
  const argo = await EthersLiquity.connect(wallet);

  console.log(argo.connection.addresses.collToken);
  let collateralToken = new ethers.Contract(argo.connection.addresses.collToken, erc20MockAbi, wallet) as unknown as ERC20Mock;

  let reciept = await collateralToken.mint(wallet.address, Decimal.from(100).hex);
  await reciept.wait();

  let balance = await collateralToken.balanceOf(wallet.address);

  console.log("balance", balance.toString());

  // await argo.approveCollateral(100);
  // let trove = await argo.openTrove({depositCollateral: 100, borrowLUSD: 10000})
  // console.log(trove);
}

if (require.main === module) {
  main().catch(err => {
    console.log(err);
  });
}