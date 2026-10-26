import { notFound } from "next/navigation";
import { StockReturns } from "@/components/stock-returns";
export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <StockReturns mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <StockReturns mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <StockReturns mode="edit" recordId={id} />;
  notFound();
}
