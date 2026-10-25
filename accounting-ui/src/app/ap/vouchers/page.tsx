import { PurchaseOrders } from "@/components/purchase-orders";
import type { AccountingSearchParams } from "@/lib/accounting-navigation";

export default function AccountsPayablePage({ searchParams }: { searchParams: AccountingSearchParams }) {
  return <PurchaseOrders searchParams={searchParams} />;
}
