import { formatAccountingDateTime } from "@/lib/accounting-date";
import type { ApprovalDocumentFields } from "@/lib/accounting-approval";

export function AccountingApprovalHistory({ document }: { document: ApprovalDocumentFields }) {
  const snapshot = document.accountingApproval;
  if (!snapshot) return null;
  return <section className="accounting-approval-history rounded border bg-white p-4">
    <h2 className="font-bold">ลำดับและประวัติอนุมัติ Accounting</h2>
    {[...snapshot.cycles].reverse().map(cycle => <div key={cycle.cycle} className="mt-3 border-t pt-3 text-sm">
      <p>รอบ {cycle.cycle} · {cycle.state} · ส่ง {formatAccountingDateTime(cycle.submittedAt)}</p>
      {cycle.state === "legacy" ? <p>รอบนี้ใช้ขั้นตอนเดิม (ไม่ได้เปิดลำดับใหม่)</p> :
        <ol className="mt-2 space-y-2">{cycle.steps.map((step, index) => {
          const approval = cycle.approvals.find(actor => actor.step === index + 1);
          return <li key={index}>{index + 1}. {step.label} ({step.kind === "role" ? "บทบาท" : "ผู้ใช้"})
            {approval ? <p className="text-green-800">อนุมัติโดย {approval.fullName} · {formatAccountingDateTime(approval.approvedAt)}</p>
              : <p className="text-gray-500">ยังไม่อนุมัติ</p>}
          </li>;
        })}</ol>}
      {cycle.reason && <p className="mt-2">เหตุผล: {cycle.reason}</p>}
    </div>)}
    <style>{`@media print { .accounting-approval-history { display:none!important; } }`}</style>
  </section>;
}
