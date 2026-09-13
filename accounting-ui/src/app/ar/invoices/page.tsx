"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ArApi, MasterApi } from "@/lib/api";
import { FileText, Plus, Receipt } from "lucide-react";

export default function InvoicesPage() {
  const [activeSubTab, setActiveSubTab] = useState<"invoices" | "so" | "billingNotes">("invoices");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<any>({ items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }] });

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeSubTab === "invoices") {
        const res = await ArApi.getInvoices();
        setList(Array.isArray(res) ? res : res.items || []);
      } else if (activeSubTab === "so") {
        const res = await ArApi.getDeliveryOrders();
        setList(Array.isArray(res) ? res : res.items || []);
      } else if (activeSubTab === "billingNotes") {
        const res = await ArApi.getBillingNotes();
        setList(Array.isArray(res) ? res : res.items || []);
      }

      const custRes = await MasterApi.getCustomers();
      setCustomers(Array.isArray(custRes) ? custRes : custRes.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubTab]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const subTotal = formData.items.reduce((sum: number, it: any) => sum + (parseFloat(it.qty || 0) * parseFloat(it.unitPrice || 0)), 0);
      const vat = subTotal * 0.07;
      const netAmount = subTotal + vat;

      const payload = {
        ...formData,
        subTotal,
        vat,
        netAmount,
      };

      if (activeSubTab === "invoices") await ArApi.createInvoice(payload);
      else if (activeSubTab === "so") await ArApi.createDeliveryOrder(payload);

      setShowModal(false);
      setFormData({ items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }] });
      loadData();
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการบันทึกเอกสาร");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#2f7d4b]">Accounts Receivable</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ลูกหนี้การค้า & ใบแจ้งหนี้</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดการใบส่งของชั่วคราว, ใบแจ้งหนี้/ใบกำกับภาษี และใบวางบิล</p>
          </div>
          <button
            onClick={() => { setFormData({ items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }] }); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#194d34] px-4 text-sm font-bold text-white hover:bg-[#123b28]"
          >
            <Plus size={17} />สร้างเอกสารใหม่
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="mb-5 flex gap-2 border-b border-[#dfe5de] pb-3">
          {[
            { id: "invoices", label: "ใบแจ้งหนี้ / ใบกำกับภาษี (Invoice)" },
            { id: "so", label: "ใบส่งของชั่วคราว (Delivery Order)" },
            { id: "billingNotes", label: "ใบวางบิล (Billing Note)" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                activeSubTab === tab.id
                  ? "bg-[#194d34] text-white"
                  : "bg-white text-[#566159] hover:bg-[#e8ece7]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Document List Table */}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดรายการเอกสาร...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีรายการเอกสารในหมวดนี้</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่เอกสาร</th>
                    <th className="p-3.5">ลูกค้า</th>
                    <th className="p-3.5">วันที่เอกสาร</th>
                    <th className="p-3.5">มูลค่าสุทธิ</th>
                    <th className="p-3.5">ยอดคงค้าง</th>
                    <th className="p-3.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {list.map((doc) => (
                    <tr key={doc.id} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{doc.ivNo || doc.soNo || doc.biNo}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-[#17211b]">{doc.customer?.name || "ไม่ระบุ"}</div>
                        <div className="text-[11px] text-[#7a847d]">{doc.customerBranch || "สำนักงานใหญ่"}</div>
                      </td>
                      <td className="p-3.5 text-[#566159]">
                        {doc.ivDate || doc.docDate || doc.billingDate ? new Date(doc.ivDate || doc.docDate || doc.billingDate).toLocaleDateString("th-TH") : "-"}
                      </td>
                      <td className="p-3.5 font-bold text-[#17211b]">
                        ฿{Number(doc.netAmount || doc.totalAmount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 font-bold text-[#9a6514]">
                        ฿{Number(doc.outstandingAmount || doc.totalAmount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block rounded-md bg-[#e3efe7] px-2 py-0.5 text-[11px] font-bold text-[#23653e]">
                          {doc.status || "draft"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Create Document */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">
                สร้างเอกสาร {activeSubTab === "invoices" ? "ใบแจ้งหนี้ (IV)" : activeSubTab === "so" ? "ใบส่งของชั่วคราว (SO)" : "ใบวางบิล (BI)"}
              </h2>
              <form onSubmit={handleCreateInvoice} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#566159]">เลือกลูกค้า *</label>
                  <select
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.customerId || ""}
                    onChange={e => setFormData({ ...formData, customerId: e.target.value })}
                  >
                    <option value="">-- กรุณาเลือกลูกค้า --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">รายละเอียดรายการ *</label>
                  <input
                    required
                    type="text"
                    placeholder="รายละเอียดสินค้า/บริการ"
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.items[0]?.desc || ""}
                    onChange={e => {
                      const items = [...formData.items];
                      items[0].desc = e.target.value;
                      setFormData({ ...formData, items });
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#566159]">จำนวน</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                      value={formData.items[0]?.qty || 1}
                      onChange={e => {
                        const items = [...formData.items];
                        items[0].qty = e.target.value;
                        setFormData({ ...formData, items });
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#566159]">ราคาต่อหน่วย (บาท)</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                      value={formData.items[0]?.unitPrice || 0}
                      onChange={e => {
                        const items = [...formData.items];
                        items[0].unitPrice = e.target.value;
                        setFormData({ ...formData, items });
                      }}
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" className="rounded bg-[#194d34] px-4 py-2 text-xs font-bold text-white hover:bg-[#123b28]">สร้างเอกสาร</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
