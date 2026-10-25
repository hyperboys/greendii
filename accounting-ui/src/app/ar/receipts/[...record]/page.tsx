import { notFound } from "next/navigation";
import { ReceiptVouchers } from "@/components/receipt-vouchers";

export default function ReceiptVoucherPage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (id === "new" && action) || (action && action !== "edit")) notFound();
  return <ReceiptVouchers mode={id === "new" ? "new" : action === "edit" ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
