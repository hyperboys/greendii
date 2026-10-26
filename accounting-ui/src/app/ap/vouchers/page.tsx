import { PurchaseOrders } from "@/components/purchase-orders";
import { ContractorPayments } from "@/components/contractor-payments";
import type { AccountingSearchParams } from "@/lib/accounting-navigation";

export default function AccountsPayablePage({ searchParams }: { searchParams: AccountingSearchParams }) {
  if (searchParams.tab === "ps") return <ContractorPayments />;
  return <PurchaseOrders searchParams={searchParams} />;
}
