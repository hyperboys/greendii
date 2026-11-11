import Image from "next/image";
import { formatAccountingDate, formatAccountingDocumentDate } from "@/lib/accounting-date";
import { latestApprovalCycle, signatureText, type ApprovalDocumentFields } from "@/lib/accounting-approval";

export function AccountingApprovalSignatures({ document, compact = false }: { document: ApprovalDocumentFields; compact?: boolean }) {
  const cycle = latestApprovalCycle(document);
  if (!cycle || cycle.state === "legacy") return null;
  if (compact) {
    if (!cycle.approvals.length) return null;
    const columns = Math.min(cycle.approvals.length, 4);
    return <div className="accounting-approval-signatures accounting-approval-signatures-compact" style={{
      display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${Math.ceil(cycle.approvals.length / columns)}, minmax(0, 1fr))`,
      gap: "0.5mm", width: "100%", height: "100%", minHeight: 0, overflow: "hidden",
    }}>
      {cycle.approvals.map(actor => <div key={actor.step} style={{
        display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, minHeight: 0,
        overflow: "hidden", textAlign: "center", lineHeight: 1.05,
      }}>
        {actor.signatureUrl ? <Image unoptimized src={actor.signatureUrl} alt={`ลายเซ็น ${actor.fullName}`}
          width={80} height={16} style={{ width: "100%", height: "4mm", objectFit: "contain" }} /> :
          <span style={{ fontFamily: "var(--font-signature, 'Brush Script MT', 'Dancing Script', cursive)",
            fontStyle: "italic", fontSize: "7pt", maxHeight: "4mm", overflow: "hidden", overflowWrap: "anywhere" }}>{signatureText(actor)}</span>}
        <span style={{ fontSize: "5pt", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actor.fullName}</span>
        <span style={{ fontSize: "4pt" }}>{formatAccountingDocumentDate(actor.approvedAt)}</span>
      </div>)}
    </div>;
  }
  return <div className="accounting-approval-signatures" style={{ display: "grid",
    gridTemplateColumns: `repeat(${Math.min(cycle.steps.length, 4)}, minmax(0, 1fr))`, gap: "2mm" }}>
    {cycle.steps.map((step, index) => {
      const actor = cycle.approvals.find(approval => approval.step === index + 1);
      return <div key={index} style={{ border: "1px solid black", padding: "1mm", textAlign: "center", breakInside: "avoid", minWidth: 0 }}>
        <p style={{ fontSize: "8pt", overflowWrap: "anywhere" }}>อนุมัติ {index + 1} · {step.label}</p>
        {actor ? <>
          {actor.signatureUrl ? <Image unoptimized src={actor.signatureUrl} alt={`ลายเซ็น ${actor.fullName}`} width={120} height={28}
            style={{ height: "7mm", maxWidth: "100%", objectFit: "contain", margin: "0 auto" }} /> :
            <p style={{ fontFamily: "var(--font-signature, 'Brush Script MT', 'Dancing Script', cursive)",
              fontStyle: "italic", fontSize: "14pt", minHeight: "7mm", overflowWrap: "anywhere" }}>{signatureText(actor)}</p>}
          <p style={{ fontSize: "8pt", overflowWrap: "anywhere" }}>{actor.fullName}</p>
          <p style={{ fontSize: "7pt" }}>{formatAccountingDate(actor.approvedAt)}</p>
        </> : <p style={{ minHeight: "12mm", fontSize: "8pt" }}>ยังไม่อนุมัติ</p>}
      </div>;
    })}
  </div>;
}
