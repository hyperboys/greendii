"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ApApi, MasterApi } from "@/lib/api";
import { Plus, ReceiptText } from "lucide-react";

export default function AccountsPayablePage() {
  const [activeTab, setActiveTab] = useState<"po" | "gr" | "pv" | "cq">("po");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<any>({ items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }] });

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "po") {
        const res = await ApApi.getPurchaseOrders();
        setList(Array.isArray(res) ? res : res.items || []);
      }

      const suppRes = await MasterApi.getSuppliers();
      setSuppliers(Array.isArray(suppRes) ? suppRes : suppRes.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleCreatePo = async (e: React.FormEvent) => {
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

      await ApApi.createPurchaseOrder(payload);
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
            <p className="text-xs font-bold uppercase text-[#9a6514]">Accounts Payable</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">เจ้าหนี้การค้า & ค่าใช้จ่าย</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดการใบสั่งซื้อ (PO), ใบตรวจรับ (GR), ใบสำคัญจ่าย (PV) และเช็คจ่าย (CQ)</p>
          </div>
          <button
            onClick={() => { setFormData({ items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }] }); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#194d34] px-4 text-sm font-bold text-white hover:bg-[#123b28]"
          >
            <Plus size={17} />สร้างใบสั่งซื้อ (PO)
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="mb-5 flex gap-2 border-b border-[#dfe5de] pb-3">
          {[
            { id: "po", label: "ใบสั่งซื้อ (Purchase Order - PO)" },
            { id: "gr", label: "ใบตรวจรับสินค้า / บริการ (GR)" },
            { id: "pv", label: "ใบสำคัญจ่าย (Payment Voucher - PV)" },
            { id: "cq", label: "การจ่ายเงิน / เช็คจ่าย (CQ)" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-[#194d34] text-white"
                  : "bg-white text-[#566159] hover:bg-[#e8ece7]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List Table */}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดรายการ...</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีรายการเอกสารในหมวดนี้</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่ PO</th>
                    <th className="p-3.5">ผู้จำหน่าย</th>
                    <th className="p-3.5">วันที่ PO</th>
                    <th className="p-3.5">มูลค่ารวมสุทธิ</th>
                    <th className="p-3.5">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {list.map((po) => (
                    <tr key={po.id} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{po.poNo}</td>
                      <td className="p-3.5 font-medium">{po.supplier?.name || "ไม่ระบุ"}</td>
                      <td className="p-3.5 text-[#657069]">{po.poDate ? new Date(po.poDate).toLocaleDateString("th-TH") : "-"}</td>
                      <td className="p-3.5 font-bold">฿{Number(po.netAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3.5">
                        <span className="inline-block rounded-md bg-[#e3efe7] px-2 py-0.5 text-[11px] font-bold text-[#23653e]">
                          {po.status || "draft"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Create PO */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">สร้างใบสั่งซื้อ (Purchase Order - PO)</h2>
              <form onSubmit={handleCreatePo} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#566159]">เลือกผู้จำหน่าย / ผู้รับเหมา *</label>
                  <select
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.supplierId || ""}
                    onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
                  >
                    <option value="">-- เลือกผู้จำหน่าย --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">รายละเอียดรายการสั่งซื้อ *</label>
                  <input
                    required
                    type="text"
                    placeholder="รายละเอียดสินค้า/บริการสั่งซื้อ"
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
                    <label className="block text-xs font-bold text-[#566159]">จำนวนสั่งซื้อ</label>
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
                  <button type="submit" className="rounded bg-[#194d34] px-4 py-2 text-xs font-bold text-white hover:bg-[#123b28]">สร้างใบสั่งซื้อ</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
