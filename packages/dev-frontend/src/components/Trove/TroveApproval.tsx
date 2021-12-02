import { Button } from "theme-ui";

import { Decimal } from "@liquity/lib-base";

import { useLiquity } from "../../hooks/LiquityContext";
import { useTransactionFunction } from "../Transaction";

type TroveApprovalProps = {
  transactionId: string;
  amount: Decimal;
};

export const TroveApproval: React.FC<TroveApprovalProps> = ({
  children,
  transactionId,
  amount,
}) => {
  const { liquity } = useLiquity();

  const [sendTransaction] = useTransactionFunction(
    transactionId,
    liquity.send.approveCollateral.bind(liquity.send, amount)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};

