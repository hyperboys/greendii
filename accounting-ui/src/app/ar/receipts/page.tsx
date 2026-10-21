"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArApi } from "@/lib/api";
import { Plus, WalletCards } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";

export default function ReceiptsPage() {
  const canCreate = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<any>({ paymentMethod: "transfer" });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const invRes = await ArApi.getInvoices({ unpaidOnly: "true" });
      setInvoices(Array.isArray(invRes) ? invRes : invRes.items || []);

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formData.invoiceId) {
        return alert("กรุณาเลือกใบแจ้งหนี้ที่จะรับชำระ");
      }
      const inv = invoices.find(i => i.id === formData.invoiceId);
      if (!inv) return;

      const payload = {
        customerId: inv.customerId,
        paymentMethod: formData.paymentMethod,
        bankName: formData.bankName,
        totalReceived: parseFloat(formData.receivedAmount) || 0,
        allocations: [
          {
            invoiceId: inv.id,
            receivedAmount: parseFloat(formData.receivedAmount) || 0,
            whtAmount: parseFloat(formData.whtAmount) || 0,
          },
        ],
      };

      await ArApi.createReceiptVoucher(payload);
      setShowModal(false);
      setFormData({ paymentMethod: "transfer" });
      loadData();
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการบันทึกใบเสร็จ");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#0866ff]">Accounts Receivable</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">รับชำระเงิน & ใบเสร็จรับเงิน</h1>
            <p className="mt-1 text-sm text-[#657069]">บันทึกการรับชำระเงิน ตัดยอดลูกหนี้คงค้าง และออกใบเสร็จรับเงิน (RV)</p>
          </div>
          <button
            disabled={!canCreate}
            title={!canCreate ? "ไม่มีสิทธิ์บันทึกรับชำระเงิน" : undefined}
            onClick={() => { setFormData({ paymentMethod: "transfer" }); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#0866ff] px-4 text-sm font-bold text-white hover:bg-[#054cbd] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={17} />บันทึกรับชำระเงิน
          </button>
        </div>

        {errorMsg && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          <div className="p-4 border-b border-[#dfe5de] bg-[#f8faf7]">
            <h2 className="font-bold text-xs text-[#566159]">รายการใบแจ้งหนี้รอดำเนินการรับชำระ (Unpaid Invoices)</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดรายการใบแจ้งหนี้...</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#657069]">ไม่มีรายการใบแจ้งหนี้คงค้าง</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่ IV</th>
                    <th className="p-3.5">ลูกค้า</th>
                    <th className="p-3.5">ครบกำหนด</th>
                    <th className="p-3.5">ยอดสุทธิ</th>
                    <th className="p-3.5">ยอดคงค้าง</th>
                    <th className="p-3.5 text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{inv.ivNo}</td>
                      <td className="p-3.5 font-medium">{inv.customer?.name || "ไม่ระบุ"}</td>
                      <td className="p-3.5 text-[#657069]">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("th-TH") : "-"}</td>
                      <td className="p-3.5 font-bold">฿{Number(inv.netAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3.5 font-bold text-[#9a6514]">฿{Number(inv.outstandingAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3.5 text-right">
                        <button
                          disabled={!canCreate}
                          onClick={() => { setFormData({ invoiceId: inv.id, receivedAmount: inv.outstandingAmount, paymentMethod: "transfer" }); setShowModal(true); }}
                          className="rounded bg-[#23653e] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#0866ff] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          รับชำระ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Receipt */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">บันทึกรับชำระเงิน (Receipt Voucher)</h2>
              <form onSubmit={handleCreateReceipt} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#566159]">เลือกใบแจ้งหนี้ *</label>
                  <select
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.invoiceId || ""}
                    onChange={e => setFormData({ ...formData, invoiceId: e.target.value })}
                  >
                    <option value="">-- เลือกใบแจ้งหนี้ --</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.ivNo} - {inv.customer?.name} (คงค้าง ฿{Number(inv.outstandingAmount).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">จำนวนเงินที่รับ (บาท) *</label>
                  <input
                    required
                    type="number"
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.receivedAmount || 0}
                    onChange={e => setFormData({ ...formData, receivedAmount: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">วิธีการชำระเงิน</label>
                  <select
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.paymentMethod || "transfer"}
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    <option value="transfer">โอนเงินเข้าบัญชี (Transfer)</option>
                    <option value="cash">เงินสด (Cash)</option>
                    <option value="cheque">เช็ค (Cheque)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">ธนาคาร / หมายเลขอ้างอิง</label>
                  <input
                    type="text"
                    placeholder="เช่น KBANK 123-4-56789-0"
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.bankName || ""}
                    onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                  />
                </div>

                <div className="!mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" className="rounded bg-[#0866ff] px-4 py-2 text-xs font-bold text-white hover:bg-[#054cbd]">บันทึกตัดชำระ</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
