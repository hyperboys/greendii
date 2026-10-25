import { notFound } from "next/navigation";
import { DeliveryOrders } from "@/components/delivery-orders";

export default function DeliveryOrderPage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (id === "new" && action) || (action && action !== "edit")) notFound();
  return <DeliveryOrders mode={id === "new" ? "new" : action === "edit" ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
