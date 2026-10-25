import { notFound } from "next/navigation";
import { SupplierMaster } from "@/components/supplier-master";

export default function SupplierPage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length > 2 || (action && action !== "edit") || (id === "new" && action)) notFound();
  const mode = id === "new" ? "new" : action === "edit" ? "edit" : "view";
  return (
    <>
      <div className="mx-auto max-w-370">
        <SupplierMaster key={`${id}-${mode}`} mode={mode} recordId={id === "new" ? undefined : id} />
      </div>
    </>
  );
}
