import { InventoryData } from "@/components/inventory-data";
import { StockIssues } from "@/components/stock-issues";
import { StockReturns } from "@/components/stock-returns";
import { type AccountingSearchParams, inventoryTabs, selectedTab } from "@/lib/accounting-navigation";

export default function InventoryPage({ searchParams }: { searchParams: AccountingSearchParams }) {
  const activeTab = selectedTab(inventoryTabs, searchParams.tab);
  if (activeTab === "returns") return <StockReturns />;
  return activeTab === "issues" ? <StockIssues /> : <InventoryData activeTab={activeTab} />;
}
