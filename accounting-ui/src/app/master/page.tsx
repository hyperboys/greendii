import { CustomerMaster } from "@/components/customer-master";
import { SupplierMaster } from "@/components/supplier-master";
import { SimpleMaster } from "@/components/simple-master";
import { masterTabs, selectedTab, type AccountingSearchParams } from "@/lib/accounting-navigation";

export default function MasterDataPage({ searchParams = {} }: { searchParams?: AccountingSearchParams }) {
  const tab = selectedTab(masterTabs, searchParams.tab);
  if (tab === "customers") return <CustomerMaster />;
  if (tab === "suppliers") return <SupplierMaster />;
  const kind = tab === "sales" || tab === "products" || tab === "warehouses" ? tab : "coa";
  return <SimpleMaster key={kind} kind={kind} />;
}
