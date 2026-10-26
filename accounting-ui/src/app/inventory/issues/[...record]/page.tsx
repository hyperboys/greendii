import { notFound } from "next/navigation";
import { StockIssues } from "@/components/stock-issues";
export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <StockIssues mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <StockIssues mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <StockIssues mode="edit" recordId={id} />;
  notFound();
}
