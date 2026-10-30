import { notFound } from "next/navigation";
import { SimpleMaster } from "@/components/simple-master";

export default function MasterRecordPage({ params }: { params: { kind: string; record: string[] } }) {
  const kind = params.kind;
  if (kind !== "sales" && kind !== "products" && kind !== "warehouses" && kind !== "coa" && kind !== "units") notFound();
  const [id, action] = params.record;
  if (!id || params.record.length > 2 || (action && action !== "edit") || (id === "new" && action)) notFound();
  return <SimpleMaster key={`${kind}-${id}-${action}`} kind={kind} mode={id === "new" ? "new" : action ? "edit" : "view"} recordId={id === "new" ? undefined : id} />;
}
