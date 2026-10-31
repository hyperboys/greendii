export type ReceiptSource = {
  id: string; ivNo: string; ivDate: string; netAmount: number | string;
  outstandingAmount: number | string; limit: number; billingNoteId: string | null; biNo: string | null;
};
export type ReceiptSources = { invoices: ReceiptSource[]; billingNotes: { id: string; biNo: string; invoices: ReceiptSource[] }[] };
export type ReceiptLine = {
  invoiceId: string; billingNoteId: string | null; receivedAmount: number | string; whtAmount: number | string; bankFee: number | string;
  invoiceNo?: string | null; invoiceDate?: string | null; invoiceNetAmount?: number | string | null; outstandingBefore?: number | string | null;
  invoice?: { id: string; ivNo: string; outstandingAmount: number | string };
  billingNote?: { id: string; biNo: string; completedAt: string | null } | null;
  limit?: number; biNo?: string | null;
};
export type ReceiptAttachment = { id: string; originalName: string; fileUrl: string; mimeType: string; uploadedAt: string };
export type ReceiptInput = {
  receiptDate: string; customerId: string; customerBranchId?: string; customerBranch: string; address: string; taxId: string;
  paymentMethod: "cash" | "transfer" | "cheque"; bankName: string; refNo: string;
  chequeNo: string; chequeDate: string; whtCertificateNo: string; remark: string;
  allocations: ReceiptLine[]; updatedAt?: string;
};
export type ReceiptVoucher = Omit<ReceiptInput, "chequeNo" | "chequeDate"> & {
  accountingApproval?: import("./accounting-approval").ApprovalSnapshot | null;
  chequeNo: string | null; chequeDate: string | null;
  id: string; rvNo: string; lifecycleVersion: number; status: string; updatedAt: string; confirmedAt?: string | null;
  totalReceived: number | string; whtAmount: number | string; bankFee: number | string;
  customerName: string | null; customerCode: string | null; customer?: { name: string; code: string | null };
  attachments: ReceiptAttachment[];
  history?: { id: string; action: string; reason: string | null; performedBy?: { fullName: string } | null; createdAt: string }[];
};
export function newReceipt(): ReceiptInput {
  return { receiptDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }), customerId: "", customerBranch: "",
    address: "", taxId: "", paymentMethod: "transfer", bankName: "", refNo: "", chequeNo: "", chequeDate: "", whtCertificateNo: "", remark: "", allocations: [] };
}
export function receiptForm(doc: ReceiptVoucher): ReceiptInput {
  return { ...newReceipt(), ...doc, receiptDate: doc.receiptDate.slice(0, 10), bankName: doc.bankName || "",
    chequeNo: doc.chequeNo || "", chequeDate: doc.chequeDate?.slice(0, 10) || "",
    refNo: doc.refNo || "", whtCertificateNo: doc.whtCertificateNo || "", customerBranch: doc.customerBranch || "",
    address: doc.address || "", taxId: doc.taxId || "", remark: doc.remark || "",
    allocations: doc.allocations.map(row => ({ ...row, biNo: row.billingNote?.biNo || null })) };
}
// Thai commercial banks, foreign bank branches and specialized government banks.
export const receiptBanks = [
  "ธนาคารกรุงเทพ", "ธนาคารกรุงไทย", "ธนาคารกรุงศรีอยุธยา", "ธนาคารกสิกรไทย",
  "ธนาคารเกียรตินาคินภัทร", "ธนาคารซีไอเอ็มบี ไทย", "ธนาคารทหารไทยธนชาต",
  "ธนาคารทิสโก้", "ธนาคารไทยเครดิต", "ธนาคารไทยพาณิชย์", "ธนาคารยูโอบี",
  "ธนาคารแลนด์ แอนด์ เฮ้าส์", "ธนาคารสแตนดาร์ดชาร์เตอร์ด (ไทย)",
  "ธนาคารไอซีบีซี (ไทย)", "ธนาคารแห่งประเทศจีน (ไทย)", "ธนาคารเมกะ สากลพาณิชย์",
  "ธนาคารซูมิโตโม มิตซุย ทรัสต์ (ไทย)",
  "ธนาคารออมสิน", "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร", "ธนาคารอาคารสงเคราะห์",
  "ธนาคารอิสลามแห่งประเทศไทย", "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย",
  "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย",
  "ธนาคารเจพีมอร์แกน เชส", "ธนาคารแห่งอเมริกา", "ธนาคารโอเวอร์ซี-ไชนีส แบงกิ้ง คอร์ปอเรชั่น",
  "ธนาคารซิตี้แบงก์", "ธนาคารซูมิโตโม มิตซุย แบงกิ้ง คอร์ปอเรชั่น", "ธนาคารดอยซ์แบงก์",
  "ธนาคารบีเอ็นพี พารีบาส์", "ธนาคารมิซูโฮ", "ธนาคารอาร์ เอช บี",
  "ธนาคารอินเดียน โอเวอร์ซีส์", "ธนาคารฮ่องกงและเซี่ยงไฮ้แบงกิ้งคอร์ปอเรชั่น",
];
export function receiptTotals(rows: ReceiptLine[]) {
  const sum = (field: "receivedAmount" | "whtAmount" | "bankFee") => rows.reduce((total, row) => total + Math.round(Number(row[field] || 0) * 100), 0);
  const received = sum("receivedAmount"), wht = sum("whtAmount"), fee = sum("bankFee");
  return { received: received / 100, wht: wht / 100, fee: fee / 100, settled: (received + wht + fee) / 100 };
}
export function receiptStatus(doc: Pick<ReceiptVoucher, "lifecycleVersion" | "status">) {
  const label = ({ draft: "Draft", approved: "ยืนยันรับชำระแล้ว", cancelled: "ยกเลิก" } as Record<string, string>)[doc.status] || doc.status;
  return doc.lifecycleVersion === 1 ? label : `${label} (Legacy)`;
}
