"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MasterApi } from "@/lib/api";
import { Building2, Layers, Package, Plus, Store, Users } from "lucide-react";

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<"customers" | "suppliers" | "products" | "warehouses" | "coa">("customers");
  const [loading, setLoading] = useState(false);
  const [dataList, setDataList] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [errorMsg, setErrorMsg] = useState("");

  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      if (activeTab === "customers") {
        const res = await MasterApi.getCustomers();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "suppliers") {
        const res = await MasterApi.getSuppliers();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "products") {
        const res = await MasterApi.getProducts();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "warehouses") {
        const res = await MasterApi.getWarehouses();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "coa") {
        const res = await MasterApi.getChartOfAccounts();
        setDataList(Array.isArray(res) ? res : res.items || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === "customers") await MasterApi.createCustomer(formData);
      else if (activeTab === "suppliers") await MasterApi.createSupplier(formData);
      else if (activeTab === "products") await MasterApi.createProduct(formData);
      else if (activeTab === "warehouses") await MasterApi.createWarehouse(formData);
      else if (activeTab === "coa") await MasterApi.createChartOfAccount(formData);

      setShowModal(false);
      setFormData({});
      loadData();
    } catch (err: any) {
      alert(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#2f7d4b]">Master Configuration</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ข้อมูลหลัก & ผังบัญชี</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดการลูกค้า, ผู้จำหน่าย, สินค้า, คลังสินค้า และโครงสร้างผังบัญชี</p>
          </div>
          <button
            onClick={() => { setFormData({}); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#194d34] px-4 text-sm font-bold text-white hover:bg-[#123b28]"
          >
            <Plus size={17} />เพิ่มข้อมูลใหม่
          </button>
        </div>

        {/* Tab Selection */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-[#dfe5de] pb-3">
          {[
            { id: "customers", label: "ลูกค้า (Customer)", icon: Users },
            { id: "suppliers", label: "ผู้จำหน่าย / ผู้รับเหมา (Supplier)", icon: Building2 },
            { id: "products", label: "สินค้า & บริการ (Product)", icon: Package },
            { id: "warehouses", label: "คลังสินค้า (Warehouse)", icon: Store },
            { id: "coa", label: "ผังบัญชี (Chart of Accounts)", icon: Layers },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-[#194d34] text-white"
                  : "bg-white text-[#566159] hover:bg-[#e8ece7]"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Main Content Table */}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดข้อมูล...</div>
          ) : dataList.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีข้อมูลในหมวดนี้</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">#</th>
                    <th className="p-3.5">รหัส / ชื่อรายการ</th>
                    <th className="p-3.5">รายละเอียดเพิ่มเติม</th>
                    <th className="p-3.5">เงื่อนไข / สถานะ</th>
                    <th className="p-3.5 text-right">วันที่สร้าง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {dataList.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-medium text-[#7a847d]">{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-[#17211b]">{item.name || item.code}</div>
                        <div className="text-[11px] text-[#657069]">{item.code || item.taxId || item.category}</div>
                      </td>
                      <td className="p-3.5 text-[#566159]">
                        <div>{item.contactPerson || item.address || item.location || item.description || "-"}</div>
                        <div className="text-[11px] text-[#7a847d]">{item.tel || item.email || item.accountMapping || ""}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block rounded-md bg-[#e3efe7] px-2 py-0.5 text-[11px] font-bold text-[#23653e]">
                          {item.vatConfig || item.productType || item.supplierType || item.category || "Active"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right text-[#7a847d]">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString("th-TH") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal for Adding New Record */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">
                เพิ่มข้อมูล {activeTab === "customers" ? "ลูกค้า" : activeTab === "suppliers" ? "ผู้จำหน่าย" : activeTab === "products" ? "สินค้า" : activeTab === "warehouses" ? "คลังสินค้า" : "ผังบัญชี"}
              </h2>
              <form onSubmit={handleCreate} className="mt-4 space-y-3">
                {activeTab === "customers" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ชื่อลูกค้า *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                      <input type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.taxId || ""} onChange={e => setFormData({...formData, taxId: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ที่อยู่</label>
                      <textarea className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.address || ""} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                  </>
                )}

                {activeTab === "suppliers" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">รหัสผู้จำหน่าย *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.code || ""} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ชื่อผู้จำหน่าย / ผู้รับเหมา *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ประเภทผู้ขาย</label>
                      <select className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.supplierType || "domestic"} onChange={e => setFormData({...formData, supplierType: e.target.value})}>
                        <option value="domestic">ในประเทศ (Domestic)</option>
                        <option value="overseas">ต่างประเทศ (Overseas)</option>
                        <option value="contractor">ผู้รับเหมา (Contractor)</option>
                      </select>
                    </div>
                  </>
                )}

                {activeTab === "products" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">รหัสสินค้า (Code) *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.code || ""} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ชื่อสินค้า / บริการ *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ประเภทสินค้า</label>
                      <select className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.productType || "stored"} onChange={e => setFormData({...formData, productType: e.target.value})}>
                        <option value="stored">สินค้าสำเร็จรูป / สต็อก (Stored Product)</option>
                        <option value="manufactured">สินค้าสั่งผลิต (Manufactured Product)</option>
                        <option value="service">บริการ (Service - ไม่ตัดคลัง)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ราคาขาย (Price)</label>
                      <input type="number" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.price || 0} onChange={e => setFormData({...formData, price: e.target.value})} />
                    </div>
                  </>
                )}

                {activeTab === "warehouses" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">รหัสคลังสินค้า *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.code || ""} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ชื่อคลังสินค้า *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                  </>
                )}

                {activeTab === "coa" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">รหัสบัญชี (Account Code) *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.code || ""} onChange={e => setFormData({...formData, code: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">ชื่อบัญชี (Account Name) *</label>
                      <input required type="text" className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#566159]">หมวดหมู่บัญชี (Category) *</label>
                      <select required className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs" value={formData.category || "asset"} onChange={e => setFormData({...formData, category: e.target.value})}>
                        <option value="asset">สินทรัพย์ (Asset)</option>
                        <option value="liability">หนี้สิน (Liability)</option>
                        <option value="equity">ทุน (Equity)</option>
                        <option value="revenue">รายได้ (Revenue)</option>
                        <option value="expense">ค่าใช้จ่าย (Expense)</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" className="rounded bg-[#194d34] px-4 py-2 text-xs font-bold text-white hover:bg-[#123b28]">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
