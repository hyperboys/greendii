import { notFound } from "next/navigation";
import { PaymentVouchers } from "@/components/payment-vouchers";

export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <PaymentVouchers mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <PaymentVouchers mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <PaymentVouchers mode="edit" recordId={id} />;
  notFound();
}
