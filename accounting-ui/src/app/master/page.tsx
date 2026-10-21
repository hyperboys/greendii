"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MasterApi } from "@/lib/api";
import { Building2, Layers, Package, Plus, Store, Users } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { CustomerMaster, SaleMaster } from "@/components/customer-master";
import { SupplierMaster } from "@/components/supplier-master";

type MasterRecord = {
  id: string; name?: string; code?: string; taxId?: string; category?: string;
  contactPerson?: string; address?: string; location?: string; description?: string;
  tel?: string; email?: string; accountMapping?: string; vatConfig?: string;
  productType?: string; supplierType?: string; createdAt?: string;
};

export default function MasterDataPage() {
  const canCreate = canUseAccounting(useAccountingAccess(), "master", "create");
  const [activeTab, setActiveTab] = useState<"customers" | "sales" | "suppliers" | "products" | "warehouses" | "coa">("customers");
  const [loading, setLoading] = useState(false);
  const [dataList, setDataList] = useState<MasterRecord[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "customers" || tab === "suppliers") setActiveTab(tab);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      if (activeTab === "products") {
        const res = await MasterApi.getProducts();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "warehouses") {
        const res = await MasterApi.getWarehouses();
        setDataList(Array.isArray(res) ? res : res.items || []);
      } else if (activeTab === "coa") {
        const res = await MasterApi.getChartOfAccounts();
        setDataList(Array.isArray(res) ? res : res.items || []);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "suppliers") loadData();
  }, [activeTab, loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === "products") await MasterApi.createProduct(formData);
      else if (activeTab === "warehouses") await MasterApi.createWarehouse(formData);
      else if (activeTab === "coa") await MasterApi.createChartOfAccount(formData);

      setShowModal(false);
      setFormData({});
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#0866ff]">Master Configuration</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ข้อมูลหลัก & ผังบัญชี</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดการลูกค้า, ผู้จำหน่าย, สินค้า, คลังสินค้า และโครงสร้างผังบัญชี</p>
          </div>
          {activeTab !== "customers" && activeTab !== "sales" && activeTab !== "suppliers" && <button
            disabled={!canCreate}
            title={!canCreate ? "ไม่มีสิทธิ์สร้างข้อมูลหลัก" : undefined}
            onClick={() => { setFormData({}); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#0866ff] px-4 text-sm font-bold text-white hover:bg-[#054cbd] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={17} />เพิ่มข้อมูลใหม่
          </button>}
        </div>

        {/* Tab Selection */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-[#dfe5de] pb-3">
          {([
            { id: "customers", label: "ลูกค้า (Customer)", icon: Users },
            { id: "sales", label: "Sale บัญชี", icon: Users },
            { id: "suppliers", label: "ผู้จำหน่าย / ผู้รับเหมา (Supplier)", icon: Building2 },
            { id: "products", label: "สินค้า & บริการ (Product)", icon: Package },
            { id: "warehouses", label: "คลังสินค้า (Warehouse)", icon: Store },
            { id: "coa", label: "ผังบัญชี (Chart of Accounts)", icon: Layers },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-[#0866ff] text-white"
                  : "bg-white text-[#566159] hover:bg-[#e8ece7]"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "customers" ? <CustomerMaster /> : activeTab === "sales" ? <SaleMaster /> : activeTab === "suppliers" ? <SupplierMaster /> : <>
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

        </>}
        {/* Modal for Adding New Record */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">
                เพิ่มข้อมูล {activeTab === "suppliers" ? "ผู้จำหน่าย" : activeTab === "products" ? "สินค้า" : activeTab === "warehouses" ? "คลังสินค้า" : "ผังบัญชี"}
              </h2>
              <form onSubmit={handleCreate} className="mt-4 space-y-3">
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

                <div className="!mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setShowModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" className="rounded bg-[#0866ff] px-4 py-2 text-xs font-bold text-white hover:bg-[#054cbd]">บันทึก</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
