import { notFound } from "next/navigation";
import { ChequePayments } from "@/components/cheque-payments";

export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <ChequePayments mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <ChequePayments mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <ChequePayments mode="edit" recordId={id} />;
  notFound();
}
