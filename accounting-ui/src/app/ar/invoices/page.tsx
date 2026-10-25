"use client";

import { useSearchParams } from "next/navigation";
import { AccountingSearchParams, invoiceTabs, selectedTab } from "@/lib/accounting-navigation";
import { DeliveryOrders } from "@/components/delivery-orders";
import { Invoices } from "@/components/invoices";
import { BillingNotes } from "@/components/billing-notes";

export default function InvoicesPage({ searchParams = {} }: { searchParams?: AccountingSearchParams }) {
  const query = useSearchParams();
  const tab = selectedTab(invoiceTabs, query.get("tab") ?? searchParams.tab);
  if (tab === "so") return <DeliveryOrders />;
  if (tab === "billingNotes") return <BillingNotes />;
  return <Invoices />;
}
