"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArApi, AccountingLookupApi } from "@/lib/api";
import { Plus } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { AccountCustomer, branchDefaults, invoiceAmounts, invoiceDefaults, invoiceDueDate } from "@/lib/account-customers";
import { AccountingSearchParams, invoiceTabs, selectedTab } from "@/lib/accounting-navigation";
import { DateInput } from "@/components/date-input";
import { formatAccountingDate } from "@/lib/accounting-date";
import { DeliveryOrders } from "@/components/delivery-orders";

type InvoiceRow = {
  id: string; ivNo?: string; soNo?: string; biNo?: string; customer?: { name: string };
  customerBranch?: string; ivDate?: string; docDate?: string; billingDate?: string;
  netAmount?: number | string; totalAmount?: number | string; outstandingAmount?: number | string; status?: string;
};

type InvoiceForm = ReturnType<typeof invoiceDefaults> & {
  ivDate: string;
  items: { desc: string; qty: number | string; unitPrice: number | string; amount: number }[];
};
const emptyForm = (): InvoiceForm => ({
  customerId: "", customerBranchId: "", customerBranch: "", billingAddressId: "", shippingAddressId: "",
  address: "", shippingAddress: "", taxId: "", creditTerm: 30, vatConfig: "VAT7%",
  ivDate: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }),
  items: [{ desc: "", qty: 1, unitPrice: 0, amount: 0 }],
});

export default function InvoicesPage({ searchParams = {} }: { searchParams?: AccountingSearchParams }) {
  const query = useSearchParams();
  const tab = query.get("tab") ?? searchParams.tab;
  if (selectedTab(invoiceTabs, tab) === "so") return <DeliveryOrders />;
  return <InvoiceDocumentsPage searchParams={{ tab }} />;
}

function InvoiceDocumentsPage({ searchParams = {} }: { searchParams?: AccountingSearchParams }) {
  const canCreate = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [errorMsg, setErrorMsg] = useState("");
  const activeSubTab = selectedTab(invoiceTabs, searchParams.tab);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<InvoiceRow[]>([]);
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<InvoiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const selectedCustomer = customers.find(c => c.id === formData.customerId);
  const selectedBranch = selectedCustomer?.branches.find(b => b.id === formData.customerBranchId);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      if (activeSubTab === "invoices") {
        const res = await ArApi.getInvoices();
        setList(Array.isArray(res) ? res : res.items || []);
      } else if (activeSubTab === "billingNotes") {
        const res = await ArApi.getBillingNotes();
        setList(Array.isArray(res) ? res : res.items || []);
      }

      if (canCreate) setCustomers(await AccountingLookupApi.getCustomers());
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, [activeSubTab, canCreate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const totals = invoiceAmounts(formData.items, formData.vatConfig);

      const payload = {
        ...formData,
        ...totals,
        items: formData.items.map(item => ({ ...item, amount: Math.round(Number(item.qty) * Number(item.unitPrice) * 100) / 100 })),
      };

      if (activeSubTab === "invoices") await ArApi.createInvoice(payload);

      setShowModal(false);
      setFormData(emptyForm());
      loadData();
    } catch (err) { setFormError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกเอกสาร"); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#0866ff]">Accounts Receivable</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ลูกหนี้การค้า & ใบแจ้งหนี้</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดการใบส่งของชั่วคราว, ใบแจ้งหนี้/ใบกำกับภาษี และใบวางบิล</p>
          </div>
          <button
            disabled={!canCreate}
            title={!canCreate ? "ไม่มีสิทธิ์สร้างเอกสารลูกหนี้" : undefined}
            onClick={() => { setFormData(emptyForm()); setFormError(""); setShowModal(true); }}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#0866ff] px-4 text-sm font-bold text-white hover:bg-[#054cbd] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={17} />สร้างเอกสารใหม่
          </button>
        </div>

        <h2 className="mb-5 text-lg font-bold">{invoiceTabs.find(tab => tab.id === activeSubTab)?.label}</h2>

        {errorMsg && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
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
                  {list.map((doc) => {
                    const documentDate = doc.ivDate || doc.docDate || doc.billingDate;
                    return (
                    <tr key={doc.id} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{doc.ivNo || doc.soNo || doc.biNo}</td>
                      <td className="p-3.5">
                        <div className="font-bold text-[#17211b]">{doc.customer?.name || "ไม่ระบุ"}</div>
                        <div className="text-[11px] text-[#7a847d]">{doc.customerBranch || "สำนักงานใหญ่"}</div>
                      </td>
                      <td className="p-3.5 text-[#566159]">
                        {formatAccountingDate(documentDate)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Create Document */}
        {showModal && (
          <div className="accounting-modal fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div role="dialog" aria-modal="true" aria-label="สร้างเอกสารลูกหนี้" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-lg font-bold text-[#17211b]">
                สร้างเอกสาร {activeSubTab === "invoices" ? "ใบแจ้งหนี้ (IV)" : activeSubTab === "so" ? "ใบส่งของชั่วคราว (SO)" : "ใบวางบิล (BI)"}
              </h2>
              <form onSubmit={handleCreateInvoice} className="mt-4 space-y-3">
                {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
                <fieldset disabled={saving || !canCreate} className="space-y-3">
                <div>
                  <label htmlFor="invoice-customer" className="block text-xs font-bold text-[#566159]">เลือกลูกค้า *</label>
                  <select
                    id="invoice-customer"
                    required
                    className="mt-1 w-full rounded border border-[#dfe5de] p-2 text-xs"
                    value={formData.customerId || ""}
                    onChange={e => {
                      const customer = customers.find(c => c.id === e.target.value);
                      setFormData({ ...formData, ...(customer ? invoiceDefaults(customer) : { ...emptyForm(), items: formData.items, ivDate: formData.ivDate }) });
                    }}
                  >
                    <option value="">-- กรุณาเลือกลูกค้า --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {selectedCustomer && <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[#566159]">สาขาลูกค้า
                    <select className="mt-1 w-full rounded border p-2 text-sm" value={formData.customerBranchId}
                      onChange={e => setFormData({ ...formData, ...branchDefaults(selectedCustomer, e.target.value) })}>
                      {!selectedCustomer.branches.length && <option value="">{selectedCustomer.branch || "สำนักงานใหญ่"}</option>}
                      {selectedCustomer.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} - {branch.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-[#566159]">Tax ID
                    <input readOnly className="mt-1 w-full rounded border bg-[#f4f6f2] p-2 text-sm" value={formData.taxId} />
                  </label>
                  {(["billing", "shipping"] as const).map(kind => {
                    const addresses = selectedBranch?.addresses.filter(a => a.kind === kind || a.kind === "both") ?? [];
                    const idKey = kind === "billing" ? "billingAddressId" : "shippingAddressId";
                    const textKey = kind === "billing" ? "address" : "shippingAddress";
                    return <label key={kind} className="text-xs font-bold text-[#566159]">{kind === "billing" ? "ที่อยู่วางบิล" : "ที่อยู่จัดส่ง"}
                      <select className="mt-1 w-full rounded border p-2 text-sm" value={formData[idKey]} onChange={e => {
                        const address = addresses.find(a => a.id === e.target.value);
                        setFormData({ ...formData, [idKey]: e.target.value, [textKey]: address?.address ?? "" });
                      }}>
                        {!addresses.length && <option value="">{formData[textKey] || "ยังไม่มีที่อยู่ประเภทนี้"}</option>}
                        {addresses.map(address => <option key={address.id} value={address.id}>{address.label} - {address.address}</option>)}
                      </select>
                    </label>;
                  })}
                  {activeSubTab === "invoices" && <>
                    <label className="text-xs font-bold text-[#566159]">Sale ผู้ดูแล (บัญชี)
                      <input readOnly className="mt-1 w-full rounded border bg-[#f4f6f2] p-2 text-sm" value={selectedCustomer.responsibleSale?.name || "ยังไม่ระบุ Sale ผู้ดูแลลูกค้า"} />
                    </label>
                    <label className="text-xs font-bold text-[#566159]">การตั้งค่า VAT
                      <select className="mt-1 w-full rounded border p-2 text-sm" value={formData.vatConfig} onChange={e => setFormData({ ...formData, vatConfig: e.target.value === "NO_VAT" ? "NO_VAT" : "VAT7%" })}>
                        <option value="VAT7%">VAT 7%</option><option value="NO_VAT">ไม่มี VAT</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-[#566159]">วันที่ Invoice
                      <DateInput required className="mt-1 w-full rounded border p-2 text-sm" value={formData.ivDate} onChange={value => setFormData({ ...formData, ivDate: value })} />
                    </label>
                    <label className="text-xs font-bold text-[#566159]">Credit Term (วัน)
                      <input required type="number" min={0} max={2147483647} step={1} className="mt-1 w-full rounded border p-2 text-sm" value={Number.isNaN(formData.creditTerm) ? "" : formData.creditTerm} onChange={e => setFormData({ ...formData, creditTerm: e.target.valueAsNumber })} />
                    </label>
                    <label className="text-xs font-bold text-[#566159]">วันครบกำหนด
                      <DateInput readOnly className="mt-1 w-full rounded border bg-[#f4f6f2] p-2 text-sm" value={invoiceDueDate(formData.ivDate, formData.creditTerm)} />
                    </label>
                  </>}
                </div>}

                <div>
                  <label htmlFor="invoice-description" className="block text-xs font-bold text-[#566159]">รายละเอียดรายการ *</label>
                  <input
                    id="invoice-description"
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
                    <label htmlFor="invoice-quantity" className="block text-xs font-bold text-[#566159]">จำนวน</label>
                    <input
                      id="invoice-quantity"
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
                    <label htmlFor="invoice-price" className="block text-xs font-bold text-[#566159]">ราคาต่อหน่วย (บาท)</label>
                    <input
                      id="invoice-price"
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
                </fieldset>
                {activeSubTab === "invoices" && <p className="text-sm">VAT: {invoiceAmounts(formData.items, formData.vatConfig).vat.toFixed(2)} บาท | ยอดสุทธิ: {invoiceAmounts(formData.items, formData.vatConfig).netAmount.toFixed(2)} บาท</p>}
                <div className="!mt-5 flex justify-end gap-2 pt-3">
                  <button type="button" disabled={saving} onClick={() => setShowModal(false)} className="rounded border border-[#dfe5de] px-4 py-2 text-xs font-bold text-[#566159]">ยกเลิก</button>
                  <button type="submit" disabled={saving || !canCreate} className="rounded bg-[#0866ff] px-4 py-2 text-xs font-bold text-white hover:bg-[#054cbd] disabled:opacity-40">{saving ? "กำลังบันทึก..." : "สร้างเอกสาร"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
