import { PurchaseOrders } from "@/components/purchase-orders";
import { ContractorPayments } from "@/components/contractor-payments";
import { PaymentVouchers } from "@/components/payment-vouchers";
import { ChequePayments } from "@/components/cheque-payments";
import { GoodsReceipts } from "@/components/goods-receipts";
import type { AccountingSearchParams } from "@/lib/accounting-navigation";

export default function AccountsPayablePage({ searchParams }: { searchParams: AccountingSearchParams }) {
  if (searchParams.tab === "ps") return <ContractorPayments />;
  if (searchParams.tab === "pv") return <PaymentVouchers />;
  if (searchParams.tab === "cq") return <ChequePayments />;
  if (searchParams.tab === "gr") return <GoodsReceipts />;
  return <PurchaseOrders searchParams={searchParams} />;
}
