"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { InventoryApi, MasterApi } from "@/lib/api";
import { ArrowDownLeft, ArrowUpRight, Package, Plus, Store } from "lucide-react";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<"balances" | "movements">("balances");
  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [formData, setFormData] = useState<any>({ requestedQty: 1 });

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "balances") {
        const res = await InventoryApi.getBalances();
        setBalances(Array.isArray(res) ? res : res.items || []);
      } else {
        const res = await InventoryApi.getMovements();
        setMovements(Array.isArray(res) ? res : res.items || []);
      }

      const prodRes = await MasterApi.getProducts();
      setProducts(Array.isArray(prodRes) ? prodRes : prodRes.items || []);

      const whRes = await MasterApi.getWarehouses();
      setWarehouses(Array.isArray(whRes) ? whRes : whRes.items || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleIssueStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        warehouseId: formData.warehouseId,
        items: [
          {
            productId: formData.productId,
            requestedQty: parseFloat(formData.requestedQty) || 1,
            issuedQty: parseFloat(formData.requestedQty) || 1,
          },
        ],
        remark: formData.remark,
      };

      await InventoryApi.createIssue(payload);
      setShowIssueModal(false);
      setFormData({ requestedQty: 1 });
      loadData();
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการเบิกสินค้า");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#2f7d4b]">Inventory & Store</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">คลังสินค้า & การ์ดสินค้า (Stock Card)</h1>
            <p className="mt-1 text-sm text-[#657069]">ตรวจสอบยอดคงเหลือ Stock On Hand, Reserved, Available และประวัติการเบิก-รับคืน</p>
          </div>
          <button
            onClick={() => { setFormData({ requestedQty: 1 }); setShowIssueModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#194d34] px-4 text-sm font-bold text-white hover:bg-[#123b28]"
          >
            <Plus size={17} />ทำรายการเบิกสินค้า
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="mb-5 flex gap-2 border-b border-[#dfe5de] pb-3">
          {[
            { id: "balances", label: "ยอดสินค้าคงเหลือ (Stock Balance)" },
            { id: "movements", label: "ประวัติการเคลื่อนย้ายสินค้า (Stock Card / Movements)" },
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

        {/* Content Table */}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดข้อมูลสต็อก...</div>
          ) : activeTab === "balances" ? (
            balances.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีข้อมูลสินค้าคงเหลือในคลัง</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                    <tr>
                      <th className="p-3.5">คลังสินค้า</th>
                      <th className="p-3.5">รหัส / ชื่อสินค้า</th>
                      <th className="p-3.5">ประเภท</th>
                      <th className="p-3.5 text-right">On Hand (คงเหลือจริง)</th>
                      <th className="p-3.5 text-right">Reserved (จองแล้ว)</th>
                      <th className="p-3.5 text-right font-bold text-[#23653e]">Available (พร้อมเบิก)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe5de]">
                    {balances.map((b) => (
                      <tr key={b.id} className="hover:bg-[#f9faf8]">
                        <td className="p-3.5 font-bold text-[#173f2d]">{b.warehouse?.name || b.warehouseId}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-[#17211b]">{b.product?.name || "ไม่ระบุ"}</div>
                          <div className="text-[11px] text-[#7a847d]">{b.product?.code}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="inline-block rounded-md bg-[#e3efe7] px-2 py-0.5 text-[11px] font-bold text-[#23653e]">
                            {b.product?.productType || "stored"}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-bold">{Number(b.onHand).toLocaleString()} {b.product?.unit || ""}</td>
                        <td className="p-3.5 text-right text-[#9a6514]">{Number(b.reserved).toLocaleString()}</td>
                        <td className="p-3.5 text-right font-bold text-[#23653e]">{Number(b.available).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            movements.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีประวัติการเคลื่อนย้ายสินค้า</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                    <tr>
                      <th className="p-3.5">วันที่ / เวลา</th>
                      <th className="p-3.5">ประเภทการเข้า/ออก</th>
                      <th className="p-3.5">เอกสารอ้างอิง</th>
                      <th className="p-3.5">คลังสินค้า</th>
                      <th className="p-3.5">สินค้า</th>
                      <th className="p-3.5 text-right">จำนวนเข้า (+)</th>
                      <th className="p-3.5 text-right">จำนวนออก (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe5de]">
                    {movements.map((m) => (
                      <tr key={m.id} className="hover:bg-[#f9faf8]">
                        <td className="p-3.5 text-[#657069]">{new Date(m.transactionDate).toLocaleString("th-TH")}</td>
                        <td className="p-3.5">
                          {m.movementType === "in" ? (
                            <span className="flex items-center gap-1 font-bold text-[#23653e]"><ArrowDownLeft size={15} />รับเข้า</span>
                          ) : (
                            <span className="flex items-center gap-1 font-bold text-[#9a493e]"><ArrowUpRight size={15} />เบิกออก</span>
                          )}
                        </td>
                        <td className="p-3.5 font-bold text-[#173f2d]">{m.sourceDocNo || m.sourceDocType}</td>
                        <td className="p-3.5">{m.warehouse?.name}</td>
                        <td className="p-3.5 font-medium">{m.product?.name}</td>
                        <td className="p-3.5 text-right font-bold text-[#23653e]">{Number(m.qtyIn) > 0 ? `+${Number(m.qtyIn)}` : "-"}</td>
                        <td className="p-3.5 text-right font-bold text-[#9a493e]">{Number(m.qtyOut) > 0 ? `-${Number(m.qtyOut)}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Modal Issue Stock */}
        {showIssueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">ทำรายการเบิกสินค้า (Stock Issue)</h2>
              <form onSubmit={handleIssueStock} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#566159]">เลือกคลังสินค้า *</label>
                  <select
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.warehouseId || ""}
                    onChange={e => setFormData({ ...formData, warehouseId: e.target.value })}
                  >
                    <option value="">-- เลือกคลังสินค้า --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">เลือกสินค้าที่ต้องการเบิก *</label>
                  <select
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.productId || ""}
                    onChange={e => setFormData({ ...formData, productId: e.target.value })}
                  >
                    <option value="">-- เลือกสินค้า --</option>
                    {products.filter(p => p.productType !== "service").map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">จำนวนที่เบิก *</label>
                  <input
                    required
                    type="number"
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.requestedQty || 1}
                    onChange={e => setFormData({ ...formData, requestedQty: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#566159]">หมายเหตุ</label>
                  <input
                    type="text"
                    placeholder="เช่น เบิกใช้สำหรับงานติดตั้ง..."
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.remark || ""}
                    onChange={e => setFormData({ ...formData, remark: e.target.value })}
                  />
                </div>

                <div className="mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowIssueModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" className="rounded bg-[#194d34] px-4 py-2 text-xs font-bold text-white hover:bg-[#123b28]">ยืนยันตัดเบิก</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
