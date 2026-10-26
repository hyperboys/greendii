import { InventoryData } from "@/components/inventory-data";
import { StockIssues } from "@/components/stock-issues";
import { type AccountingSearchParams, inventoryTabs, selectedTab } from "@/lib/accounting-navigation";

export default function InventoryPage({ searchParams }: { searchParams: AccountingSearchParams }) {
  const activeTab = selectedTab(inventoryTabs, searchParams.tab);
  return activeTab === "issues" ? <StockIssues /> : <InventoryData activeTab={activeTab} />;
}
