import { notFound } from "next/navigation";
import { CreditNotes } from "@/components/credit-notes";

export default function CreditNotePage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (id === "new" && action) || (action && action !== "edit")) notFound();
  return <CreditNotes mode={id === "new" ? "new" : action === "edit" ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
