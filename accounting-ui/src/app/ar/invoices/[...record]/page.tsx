import { notFound } from "next/navigation";
import { Invoices } from "@/components/invoices";

export default function InvoicePage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (id === "new" && action) || (action && action !== "edit")) notFound();
  return <Invoices mode={id === "new" ? "new" : action === "edit" ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
