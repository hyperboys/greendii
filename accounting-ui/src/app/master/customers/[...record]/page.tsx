import { notFound } from "next/navigation";
import { CustomerMaster } from "@/components/customer-master";

export default function CustomerPage({ params }: { params: { record: string[] } }) {
  const [id, action] = params.record;
  if (params.record.length > 2 || (action && action !== "edit") || (id === "new" && action)) notFound();
  const mode = id === "new" ? "new" : action === "edit" ? "edit" : "view";
  return (
    <>
      <div className="mx-auto max-w-370">
        <CustomerMaster key={`${id}-${mode}`} mode={mode} recordId={id === "new" ? undefined : id} />
      </div>
    </>
  );
}
