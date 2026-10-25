import { notFound } from "next/navigation";
import { PurchaseOrders } from "@/components/purchase-orders";

export default function PurchaseOrderPage({
  params, searchParams,
}: {
  params: { record: string[] };
  searchParams: { notice?: string };
}) {
  const [id, action] = params.record;
  if (params.record.length > 2 || (action && action !== "edit") || (id === "new" && action)) notFound();
  const mode = id === "new" ? "new" : action === "edit" ? "edit" : "view";
  return <PurchaseOrders key={`${id}-${mode}`} mode={mode} recordId={id === "new" ? undefined : id} notice={searchParams.notice} />;
}
