import { notFound } from "next/navigation";
import { BillingNotes } from "@/components/billing-notes";

export default function BillingNotePage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (id === "new" && action) || (action && action !== "edit")) notFound();
  return <BillingNotes mode={id === "new" ? "new" : action === "edit" ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
