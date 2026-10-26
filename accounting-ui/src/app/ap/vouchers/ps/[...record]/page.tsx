import { notFound } from "next/navigation";
import { ContractorPayments } from "@/components/contractor-payments";

export default function Page({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length === 1 && id === "new") return <ContractorPayments mode="new" />;
  if (id && id !== "new" && params.record.length === 1) return <ContractorPayments mode="view" recordId={id} />;
  if (id && id !== "new" && params.record.length === 2 && action === "edit") return <ContractorPayments mode="edit" recordId={id} />;
  notFound();
}
