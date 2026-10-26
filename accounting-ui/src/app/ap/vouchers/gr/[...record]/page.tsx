import { notFound } from "next/navigation";
import { GoodsReceipts } from "@/components/goods-receipts";
export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <GoodsReceipts mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <GoodsReceipts mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <GoodsReceipts mode="edit" recordId={id} />;
  notFound();
}
