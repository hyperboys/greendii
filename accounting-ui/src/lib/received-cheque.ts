import type { ReceiptVoucher } from "./receipt-voucher";
export type ReceivedChequeAction = "deposit" | "clear" | "dishonour";
export type ReceivedChequeInput = { updatedAt: string; actionDate: string; depositBank?: string; depositRef?: string; reason?: string };
export const receivedChequeLabels = { received: "รับเช็คแล้ว", deposited: "นำฝากแล้ว", cleared: "เช็คผ่าน", dishonoured: "เช็คคืน / กลับหนี้แล้ว", cancelled: "ยกเลิก" };
export function receivedChequeActions(doc: ReceiptVoucher): ReceivedChequeAction[] {
  if (doc.lifecycleVersion !== 1 || doc.paymentMethod !== "cheque" || doc.status !== "approved" || !doc.confirmedAt || doc.chequeDishonouredAt) return [];
  if (doc.accountingApproval) {
    const cycles = doc.accountingApproval.cycles;
    const cycle = cycles[cycles.length - 1];
    if (!cycle || (cycle.state !== "legacy" && (cycle.state !== "approved" || cycle.approvals.length !== cycle.steps.length))) return [];
  }
  if (doc.receivedChequeState === "received") return ["deposit", "dishonour"];
  if (doc.receivedChequeState === "deposited") return ["clear", "dishonour"];
  return [];
}
