import { notFound } from "next/navigation";
import { StockOpeningBalances } from "@/components/stock-opening-balances";

export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <StockOpeningBalances mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <StockOpeningBalances mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") {
    return <StockOpeningBalances mode="edit" recordId={id} />;
  }
  notFound();
}
