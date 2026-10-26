"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApApi, AccountingLookupApi, AccountingSettingsApi } from "@/lib/api";
import { Plus, Printer, Search } from "lucide-react";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { AccountingSearchParams, payableTabs, selectedTab } from "@/lib/accounting-navigation";
import type {
  PurchaseOrderCompanySettings, PurchaseOrderDocument, PurchaseOrderInput, PurchaseOrderSupplier,
  PurchaseRequestReference,
} from "@/lib/accounting-purchase-orders";
import { emptyPurchaseOrderLine, purchaseOrderTotals, type PurchaseOrderLineDraft } from "@/lib/purchase-order";
import { PurchaseOrderDocumentView, PurchaseOrderPrintStyles } from "@/components/purchase-order-document";
import { DateInput } from "@/components/date-input";
import { formatAccountingDate, formatAccountingDateTime } from "@/lib/accounting-date";
import { getStoredUser } from "@/lib/auth";
import { poStatusLabels, poActionLabels, poHistoryLabels, purchaseOrderActions, type PurchaseOrderAction } from "@/lib/accounting-purchase-orders";

const todayBangkok = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

function emptyForm(): PurchaseOrderInput {
  return {
    poDate: todayBangkok(),
    purchaseType: "domestic",
    supplierId: "",
    supplierBranch: "",
    address: "",
    contactPerson: "",
    remarks: "",
    purchaseRequestIds: [],
    vatConfig: "VAT7%",
    paymentTerm: 30,
    deliveryDate: "",
    deliveryLocation: "",
    items: [emptyPurchaseOrderLine()],
  };
}

function formFromDocument(document: PurchaseOrderDocument): PurchaseOrderInput {
  return {
    poDate: document.poDate ? new Date(document.poDate).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) : todayBangkok(),
    purchaseType: document.purchaseType || "domestic",
    supplierId: document.supplierId || "",
    supplierBranch: document.supplierBranch || "",
    address: document.address || "",
    contactPerson: document.contactPerson || "",
    remarks: document.remarks || "",
    purchaseRequestIds: document.purchaseRequestReferences?.map(reference => reference.purchaseRequest.id)
      ?? (document.prId ? [document.prId] : []),
    vatConfig: document.vatConfig === "NO_VAT" ? "NO_VAT" : "VAT7%",
    paymentTerm: document.paymentTerm ?? 30,
    deliveryDate: document.deliveryDate ? new Date(document.deliveryDate).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) : "",
    deliveryLocation: document.deliveryLocation || "",
    items: document.items.length
      ? document.items.map(item => ({
        productId: item.productId,
        partNo: item.partNo || "",
        desc: item.desc || "",
        qty: Number(item.qty),
        unit: item.unit || "",
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        remark: item.remark || "",
      }))
      : [emptyPurchaseOrderLine()],
  };
}

const inputClass = "mt-1 w-full rounded border border-[#ccd5cd] bg-white px-3 py-2 text-sm";
const fieldClass = "block text-xs font-semibold text-[#566159]";

export function PurchaseOrders({
  searchParams = {}, mode = "list", recordId, notice,
}: {
  searchParams?: AccountingSearchParams;
  mode?: "list" | "new" | "edit" | "view";
  recordId?: string;
  notice?: string;
}) {
  const router = useRouter();
  const access = useAccountingAccess();
  const canCreate = canUseAccounting(access, "ap", "create");
  const canUpdate = canUseAccounting(access, "ap", "update");
  const canManage = canCreate || canUpdate;
  const canApprove = canUseAccounting(access, "ap", "approve"), canCancel = canUseAccounting(access, "ap", "cancel");
  const activeTab = selectedTab(payableTabs, searchParams.tab);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<PurchaseOrderDocument[]>([]);
  const [suppliers, setSuppliers] = useState<PurchaseOrderSupplier[]>([]);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequestReference[]>([]);
  const [filterText, setFilterText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [userId, setUserId] = useState<string>();
  const [action, setAction] = useState<PurchaseOrderAction | null>(null);
  const [reason, setReason] = useState("");
  const [prFilter, setPrFilter] = useState("");
  const [formData, setFormData] = useState<PurchaseOrderInput>(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<PurchaseOrderDocument | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<PurchaseOrderDocument | null>(null);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const savingRef = useRef(false);

  const totals = useMemo(
    () => purchaseOrderTotals(formData.items, formData.vatConfig),
    [formData.items, formData.vatConfig],
  );
  const filteredSuppliers = useMemo(() => {
    const query = supplierFilter.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter(supplier =>
      `${supplier.code} ${supplier.name} ${supplier.taxId || ""} ${supplier.contactPerson || ""} ${supplier.supplierType || ""}`
        .toLowerCase().includes(query));
  }, [supplierFilter, suppliers]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      if (mode === "list" && activeTab === "po") {
        const orders = await ApApi.getPurchaseOrders();
        setList(orders);
      }
      if ((mode === "new" && canCreate) || (mode === "edit" && canUpdate)) {
        setSuppliers(await AccountingLookupApi.getSuppliers());
      }
      if (recordId && (mode === "edit" || mode === "view")) {
        const detail = await ApApi.getPurchaseOrder(recordId);
        if (mode === "edit") {
          if (!["draft", "returned"].includes(detail.status)) throw new Error("แก้ไขได้เฉพาะใบสั่งซื้อสถานะ Draft / ส่งกลับ");
          setEditing(detail);
          setFormData(formFromDocument(detail));
          setSupplierFilter(detail.supplier ? `${detail.supplier.code} - ${detail.supplier.name}` : "");
        } else {
          setCompany(await AccountingSettingsApi.get());
          setSelectedDocument(detail);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, [activeTab, mode, recordId, canCreate, canUpdate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => { setUserId(getStoredUser()?.id); }, []);

  useEffect(() => {
    if ((mode !== "new" && mode !== "edit") || !canManage) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ApApi.getPurchaseRequests(prFilter.trim())
        .then(requests => {
          if (!cancelled) setPurchaseRequests(requests);
        })
        .catch(err => {
          if (!cancelled) setErrorMsg(err instanceof Error ? err.message : "ไม่สามารถค้นหา PR ได้");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, canManage, prFilter]);

  const filteredRequests = purchaseRequests;

  const filteredOrders = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return list.filter(order => (!statusFilter || order.status === statusFilter) &&
      `${order.poNo} ${order.supplierSnapshot?.name || order.supplier?.name || ""} ${order.purchaseRequestReferences?.map(ref => ref.purchaseRequest.prNo).join(" ") || order.pr?.prNo || ""}`
        .toLowerCase().includes(query));
  }, [filterText, list, statusFilter]);

  const chooseSupplier = (supplierId: string) => {
    const supplier = suppliers.find(item => item.id === supplierId);
    if (!supplier) return;
    setSupplierFilter(`${supplier.code} - ${supplier.name}`);
    setSupplierSearchOpen(false);
    const branch = supplier.branches?.find(branch => branch.isDefault) ?? supplier.branches?.[0];
    setFormData(current => ({
      ...current,
      supplierId,
      supplierBranch: branch?.name || supplier.branch || "",
      address: branch?.billingAddress || branch?.address || supplier.billingAddress || supplier.address || "",
      contactPerson: branch?.contactPerson || supplier.contactPerson || "",
      paymentTerm: supplier?.paymentTerm ?? 30,
      vatConfig: supplier?.vatConfig === "NO_VAT" ? "NO_VAT" : "VAT7%",
      purchaseType: supplier?.supplierType === "overseas" ? "overseas" : "domestic",
    }));
  };

  const setLine = (index: number, patch: Partial<PurchaseOrderLineDraft>) => {
    setFormData(current => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  };

  const togglePurchaseRequest = (id: string) => {
    setFormData(current => ({
      ...current,
      purchaseRequestIds: current.purchaseRequestIds.includes(id)
        ? current.purchaseRequestIds.filter(requestId => requestId !== id)
        : [...current.purchaseRequestIds, id],
    }));
  };

  const savePurchaseOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!formData.supplierId) {
      setErrorMsg("กรุณาเลือกผู้ขายหรือผู้รับเหมาจากผลการค้นหา");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setErrorMsg("");
    try {
      const payload: PurchaseOrderInput = {
        ...formData,
        items: formData.items.map(item => ({
          ...item,
          qty: Number(item.qty),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
        })),
      };
      const saved = editing
        ? await ApApi.updatePurchaseOrder(editing.id, { ...payload, updatedAt: editing.updatedAt })
        : await ApApi.createPurchaseOrder(payload);
      const followUpErrors: string[] = [];
      if (pendingFiles.length > 0) {
        try {
          await ApApi.uploadPurchaseOrderFiles(saved.id, pendingFiles, saved.updatedAt);
        } catch (err) {
          followUpErrors.push(err instanceof Error ? err.message : "อัปโหลดเอกสารแนบไม่สำเร็จ");
        }
      }
      const warning = followUpErrors.length > 0
        ? `?notice=${encodeURIComponent(`บันทึก PO ${saved.poNo} แล้ว แต่แนบไฟล์ไม่สำเร็จ: ${followUpErrors.join("; ")}`)}`
        : "";
      router.push(`/ap/vouchers/${encodeURIComponent(saved.id)}${warning}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "บันทึกใบสั่งซื้อไม่สำเร็จ");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const runDetail = async (operation: (doc: PurchaseOrderDocument) => Promise<unknown>) => {
    if (!selectedDocument || savingRef.current) return;
    savingRef.current = true; setSaving(true); setErrorMsg("");
    try {
      await operation(selectedDocument);
      const detail = await ApApi.getPurchaseOrder(selectedDocument.id);
      setSelectedDocument(detail); setAction(null); setReason(""); setPendingFiles([]);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "ดำเนินการ PO ไม่สำเร็จ");
    } finally { savingRef.current = false; setSaving(false); }
  };
  const availableActions = selectedDocument ? purchaseOrderActions(selectedDocument,
    { create: canCreate, approve: canApprove, cancel: canCancel }, userId) : [];
  const editableDetail = selectedDocument && ["draft", "returned"].includes(selectedDocument.status);

  if ((mode === "new" && !canCreate) || (mode === "edit" && !canUpdate)) {
    return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขใบสั่งซื้อ <Link href="/ap/vouchers?tab=po">กลับรายการ PO</Link></p>;
  }
  return (
    <>
      <PurchaseOrderPrintStyles />
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#9a6514]">Accounts Payable</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">เจ้าหนี้การค้า & ค่าใช้จ่าย</h1>
            <p className="mt-1 text-sm text-[#657069]">จัดทำ อนุมัติ และพิมพ์ใบสั่งซื้อ (PO)</p>
          </div>
          {mode === "list" && activeTab === "po" && canCreate && (
            <Link href="/ap/vouchers/new" className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#0866ff] px-4 text-sm font-bold text-white hover:bg-[#054cbd]">
              <Plus size={17} />สร้างใบสั่งซื้อ
            </Link>
          )}
          {mode !== "list" && <Link className="po-no-print text-sm font-bold text-blue-700" href="/ap/vouchers?tab=po">กลับรายการ PO</Link>}
        </div>

        <h2 className="mb-5 text-lg font-bold">{payableTabs.find(tab => tab.id === activeTab)?.label}</h2>
        {errorMsg && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
        {notice && <p role="alert" className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
        {mode !== "list" && loading && <p role="status">กำลังโหลดใบสั่งซื้อ...</p>}

        {mode === "list" && (activeTab !== "po" ? (
          <div className="rounded-lg border border-[#dfe5de] bg-white p-8 text-center text-sm text-[#657069]">
            หน้าจัดการรายการนี้ยังไม่อยู่ในขอบเขต PO ที่กำลังทำ
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#dfe5de] bg-[#f8faf7] p-4 sm:flex-row">
              <label className="relative block flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7a847d]" />
                <input aria-label="ค้นหา PO" className="w-full rounded border border-[#ccd5cd] bg-white py-2 pl-9 pr-3 text-sm" placeholder="ค้นหาเลข PO, ผู้ขาย หรือ PR" value={filterText} onChange={event => setFilterText(event.target.value)} />
              </label>
              <select aria-label="กรองสถานะ PO" className="rounded border p-2 text-sm" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="">ทุกสถานะ</option>{Object.entries(poStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button onClick={() => void loadData()} className="rounded border border-[#ccd5cd] bg-white px-4 py-2 text-sm font-semibold">โหลดใหม่</button>
            </div>
            {loading ? <div className="p-8 text-center text-sm text-[#657069]">กำลังโหลดรายการใบสั่งซื้อ...</div>
              : filteredOrders.length === 0 ? <div className="p-8 text-center text-sm text-[#657069]">ยังไม่มีใบสั่งซื้อในหมวดนี้</div>
                : <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                      <tr><th className="p-3.5">เลขที่ PO / วันที่</th><th className="p-3.5">ผู้ขาย</th><th className="p-3.5">PR อ้างอิง</th><th className="p-3.5 text-right">ยอดสุทธิ</th><th className="p-3.5">สถานะ</th><th className="p-3.5 text-right">จัดการ</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#dfe5de]">
                      {filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-[#f9faf8]">
                          <td className="p-3.5"><strong className="text-[#173f2d]">{order.poNo}</strong><div className="mt-1 text-[#657069]">{formatAccountingDate(order.poDate)}</div></td>
                          <td className="p-3.5">{order.supplierSnapshot?.name || order.supplier?.name || "-"}</td>
                          <td className="p-3.5">{order.purchaseRequestReferences?.map(ref => ref.purchaseRequest.prNo).join(", ") || order.pr?.prNo || "-"}</td>
                          <td className="p-3.5 text-right font-bold">฿{Number(order.netAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                          <td className="p-3.5"><span className="rounded bg-[#fff0cf] px-2 py-1 font-bold text-[#9a6514]">{poStatusLabels[order.status] || order.status}</span><div className="mt-1">{order.purchaseType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}</div></td>
                          <td className="p-3.5">
                            <div className="flex justify-end gap-2">
                              <Link href={`/ap/vouchers/${encodeURIComponent(order.id)}`} className="rounded border border-[#ccd5cd] px-3 py-1.5 font-semibold">ดู / พิมพ์</Link>
                              {canUpdate && ["draft", "returned"].includes(order.status) && <Link href={`/ap/vouchers/${encodeURIComponent(order.id)}/edit`} className="rounded border border-[#ccd5cd] px-3 py-1.5 font-semibold">แก้ไข</Link>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </div>
        ))}
      </div>

      {(mode === "new" || (mode === "edit" && editing)) && !loading && (
        <div className="mx-auto w-full min-w-0 max-w-5xl">
          <section aria-labelledby="po-form-title" className="w-full min-w-0 rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="po-form-title" className="text-lg font-bold">{editing ? `แก้ไขใบสั่งซื้อ ${editing.poNo}` : "สร้างใบสั่งซื้อ (Purchase Order)"}</h2>
            </div>
            <form onSubmit={savePurchaseOrder} className="space-y-5">
              <fieldset disabled={saving} className="space-y-5">
                <section className="grid gap-3 rounded border border-[#dfe5de] p-4 sm:grid-cols-3">
                  <label className={fieldClass}>วันที่เอกสาร *
                    <DateInput required className={inputClass} value={formData.poDate} onChange={value => setFormData(current => ({ ...current, poDate: value }))} />
                  </label>
                  <label className={fieldClass}>ประเภทจัดซื้อ *
                    <select className={inputClass} value={formData.purchaseType} onChange={event => setFormData(current => ({ ...current, purchaseType: event.target.value }))}>
                      <option value="domestic">ในประเทศ (Domestic)</option><option value="overseas">ต่างประเทศ (Overseas)</option>
                    </select>
                  </label>
                  <label className={fieldClass}>อ้างอิง PR (ไม่บังคับ)
                    <span className="mt-1 block rounded border border-[#ccd5cd] bg-[#f8faf7] px-3 py-2 text-sm">{formData.purchaseRequestIds.length ? `เลือก ${formData.purchaseRequestIds.length} ใบ` : "ไม่อ้างอิง PR"}</span>
                  </label>
                  <div className={`${fieldClass} relative sm:col-span-2`}>
                    <label htmlFor="po-supplier-search">ผู้ขาย / ผู้รับเหมา *</label>
                    <input
                      id="po-supplier-search"
                      required
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={supplierSearchOpen}
                      aria-controls="po-supplier-options"
                      autoComplete="off"
                      className={inputClass}
                      placeholder="ค้นหารหัส ชื่อผู้ขาย หรือผู้รับเหมา"
                      value={supplierFilter}
                      onFocus={() => setSupplierSearchOpen(true)}
                      onBlur={() => window.setTimeout(() => setSupplierSearchOpen(false), 150)}
                      onKeyDown={event => {
                        if (event.key === "Escape") setSupplierSearchOpen(false);
                      }}
                      onChange={event => {
                        setSupplierFilter(event.target.value);
                        setSupplierSearchOpen(true);
                        setFormData(current => ({ ...current, supplierId: "" }));
                      }}
                    />
                    {supplierSearchOpen && (
                      <div id="po-supplier-options" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded border border-[#ccd5cd] bg-white shadow-lg">
                        {filteredSuppliers.length > 0 ? filteredSuppliers.map(supplier => (
                          <button
                            key={supplier.id}
                            type="button"
                            role="option"
                            aria-selected={supplier.id === formData.supplierId}
                            className="flex w-full items-start justify-between gap-3 border-b border-[#edf0ed] px-3 py-2 text-left text-sm last:border-0 hover:bg-[#f3f7f3]"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => chooseSupplier(supplier.id)}
                          >
                            <span><strong>{supplier.code}</strong> - {supplier.name}</span>
                            <span className="shrink-0 text-xs text-[#657069]">
                              {supplier.supplierType === "contractor" ? "ผู้รับเหมา" : supplier.supplierType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}
                            </span>
                          </button>
                        )) : <p className="px-3 py-3 text-sm text-[#657069]">ไม่พบผู้ขายหรือผู้รับเหมา</p>}
                      </div>
                    )}
                  </div>
                  <label className={fieldClass}>สาขาผู้ขาย
                    <input className={inputClass} list="po-supplier-branches" value={formData.supplierBranch} onChange={event => {
                      const supplier = suppliers.find(item => item.id === formData.supplierId);
                      const branch = supplier?.branches?.find(branch => branch.name === event.target.value);
                      setFormData(current => ({ ...current, supplierBranch: event.target.value,
                        ...(branch ? { address: branch.billingAddress || branch.address || "", contactPerson: branch.contactPerson || supplier?.contactPerson || "" } : {}) }));
                    }} />
                    <datalist id="po-supplier-branches">{suppliers.find(item => item.id === formData.supplierId)?.branches?.map(branch =>
                      <option key={branch.code} value={branch.name}>{branch.code}</option>)}</datalist>
                  </label>
                  <label className={`${fieldClass} sm:col-span-2`}>ที่อยู่ผู้ขาย
                    <textarea rows={2} className={inputClass} value={formData.address} onChange={event => setFormData(current => ({ ...current, address: event.target.value }))} />
                  </label>
                  <label className={fieldClass}>ผู้ติดต่อ
                    <input className={inputClass} value={formData.contactPerson} onChange={event => setFormData(current => ({ ...current, contactPerson: event.target.value }))} />
                  </label>
                  <label className={fieldClass}>เครดิต/เงื่อนไขชำระ (วัน)
                    <input type="number" min="0" step="1" className={inputClass} value={formData.paymentTerm} onChange={event => setFormData(current => ({ ...current, paymentTerm: Number(event.target.value) }))} />
                  </label>
                  <label className={fieldClass}>กำหนดส่งสินค้า
                    <DateInput className={inputClass} value={formData.deliveryDate} onChange={value => setFormData(current => ({ ...current, deliveryDate: value }))} />
                  </label>
                  <label className={`${fieldClass} sm:col-span-2`}>สถานที่จัดส่ง
                    <input className={inputClass} value={formData.deliveryLocation} onChange={event => setFormData(current => ({ ...current, deliveryLocation: event.target.value }))} />
                  </label>
                </section>

                <section className="rounded border border-[#dfe5de] p-4">
                  <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div><h3 className="font-bold">PR อ้างอิง (เลือกได้หลายใบ)</h3><p className="text-xs text-[#657069]">PR ใช้เป็นเลขอ้างอิงเท่านั้น รายการ PO กรอกแยกด้านล่าง</p></div>
                    <input className="rounded border border-[#ccd5cd] px-3 py-2 text-sm" placeholder="ค้นหาเลข PR" value={prFilter} onChange={event => setPrFilter(event.target.value)} />
                  </div>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {filteredRequests.length === 0 ? <p className="text-sm text-[#657069]">ไม่พบ PR ที่ใช้งานอยู่</p> : filteredRequests.map(request => (
                      <label key={request.id} className="flex items-start gap-2 rounded border border-[#e5e9e5] p-2 text-sm">
                        <input type="checkbox" checked={formData.purchaseRequestIds.includes(request.id)} onChange={() => togglePurchaseRequest(request.id)} />
                        <span><strong>{request.prNo}</strong> · {request.status}{request.customer ? ` · ${request.customer}` : ""}{request.projectRef ? ` · ${request.projectRef}` : ""}{request.workOrder?.woNo ? ` · WO ${request.workOrder.woNo}` : ""}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded border border-[#dfe5de] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-bold">รายละเอียดรายการสั่งซื้อ</h3><p className="text-xs text-[#657069]">เพิ่มได้หลายรายการ; กรอกส่วนลดเป็นจำนวนเงินต่อรายการ</p></div>
                    <button type="button" onClick={() => setFormData(current => ({ ...current, items: [...current.items, emptyPurchaseOrderLine()] }))} className="rounded border border-[#ccd5cd] px-3 py-2 text-sm font-semibold">+ เพิ่มรายการ</button>
                  </div>
                  <div className="space-y-3">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid min-w-0 grid-cols-2 gap-2 rounded bg-[#f8faf7] p-3 md:grid-cols-6 xl:grid-cols-12">
                        <label className={`${fieldClass} min-w-0`}>รหัสสินค้า
                          <input className={inputClass} value={item.partNo} onChange={event => setLine(index, { partNo: event.target.value })} />
                        </label>
                        <label className={`${fieldClass} col-span-2 min-w-0 md:col-span-4 xl:col-span-4`}>รายการ *
                          <input required className={inputClass} value={item.desc} onChange={event => setLine(index, { desc: event.target.value })} />
                        </label>
                        <label className={`${fieldClass} min-w-0`}>จำนวน *
                          <input required type="number" min="1" step="1" className={inputClass} value={item.qty} onChange={event => setLine(index, { qty: event.target.value })} />
                        </label>
                        <label className={`${fieldClass} min-w-0`}>หน่วย
                          <input className={inputClass} value={item.unit} onChange={event => setLine(index, { unit: event.target.value })} />
                        </label>
                        <label className={`${fieldClass} min-w-0`}>ราคา/หน่วย
                          <input required type="number" min="0" step="0.01" className={inputClass} value={item.unitPrice} onChange={event => setLine(index, { unitPrice: event.target.value })} />
                        </label>
                        <label className={`${fieldClass} min-w-0`}>ส่วนลด
                          <input type="number" min="0" step="0.01" className={inputClass} value={item.discount} onChange={event => setLine(index, { discount: event.target.value })} />
                        </label>
                        <div className="col-span-2 min-w-0 md:col-span-3 xl:col-span-2">
                          <label className={fieldClass}>จำนวนเงิน</label>
                          <p className="mt-1 rounded bg-white px-3 py-2 text-right text-sm font-bold">{purchaseOrderTotals([item], "NO_VAT").taxableAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                        </div>
                        <label className={`${fieldClass} col-span-2 min-w-0 md:col-span-4 xl:col-span-10`}>หมายเหตุรายการ
                          <input className={inputClass} value={item.remark} onChange={event => setLine(index, { remark: event.target.value })} />
                        </label>
                        <div className="col-span-2 flex items-end md:col-span-2 xl:col-span-2">
                          <button type="button" disabled={formData.items.length <= 1} onClick={() => setFormData(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="w-full rounded border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40">ลบรายการ</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 rounded border border-[#dfe5de] p-4 sm:grid-cols-[1fr_340px]">
                  <div className="space-y-3">
                    <label className={fieldClass}>หมายเหตุ
                      <textarea rows={3} className={inputClass} value={formData.remarks} onChange={event => setFormData(current => ({ ...current, remarks: event.target.value }))} />
                    </label>
                    <label className={fieldClass}>เอกสารแนบ (PDF, รูปภาพ, Office หรือ ZIP; ไม่เกิน 10 MB/ไฟล์)
                      <input type="file" multiple className={inputClass} onChange={event => setPendingFiles(Array.from(event.target.files || []))} />
                    </label>
                    {pendingFiles.length > 0 && <p className="text-xs text-[#657069]">เลือก {pendingFiles.length} ไฟล์</p>}
                  </div>
                  <div className="space-y-2 rounded bg-[#f8faf7] p-3">
                    <label className={`${fieldClass} block`}>ภาษีมูลค่าเพิ่ม
                      <select className={inputClass} value={formData.vatConfig} onChange={event => setFormData(current => ({ ...current, vatConfig: event.target.value === "NO_VAT" ? "NO_VAT" : "VAT7%" }))}>
                        <option value="VAT7%">VAT 7%</option><option value="NO_VAT">ไม่มี VAT</option>
                      </select>
                    </label>
                    <p className="flex justify-between text-sm"><span>รวมเงิน</span><strong>฿{totals.subTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
                    <p className="flex justify-between text-sm"><span>ส่วนลด</span><strong>฿{totals.discount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
                    <p className="flex justify-between text-sm"><span>เงินหลังหักส่วนลด</span><strong>฿{totals.taxableAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
                    <p className="flex justify-between text-sm"><span>VAT</span><strong>฿{totals.vat.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
                    <p className="flex justify-between border-t border-[#dfe5de] pt-2 text-base"><span>ยอดสุทธิ</span><strong>฿{totals.netAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong></p>
                  </div>
                </section>
              </fieldset>
              <div className="flex flex-wrap justify-end gap-2">
                <Link href="/ap/vouchers?tab=po" className="rounded border border-[#dfe5de] px-4 py-2 text-sm font-bold text-[#566159]">ยกเลิก</Link>
                <button type="submit" disabled={saving || (editing ? !canUpdate : !canCreate)} className="rounded bg-[#0866ff] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึกใบสั่งซื้อ"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {mode === "view" && selectedDocument && (
        <div className="mx-auto w-full min-w-0">
          <div className="po-no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap justify-end gap-2">
            {canUpdate && editableDetail && <Link href={`/ap/vouchers/${encodeURIComponent(selectedDocument.id)}/edit`} className="rounded bg-white px-4 py-2 text-sm font-bold">แก้ไข PO</Link>}
            {availableActions.map(value => <button key={value} disabled={saving || loading} onClick={() => { setAction(value); setReason(""); }} className="rounded border bg-white px-4 py-2 text-sm font-bold disabled:opacity-50">{poActionLabels[value]}</button>)}
            <button disabled={saving || loading} onClick={() => window.print()} className="flex items-center gap-2 rounded bg-[#0866ff] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Printer size={16} />พิมพ์ / บันทึก PDF</button>
          </div>
          <section className="po-no-print mx-auto mb-4 max-w-[210mm] space-y-3 rounded border bg-white p-4">
            <p><strong>สถานะ: {poStatusLabels[selectedDocument.status] || selectedDocument.status}</strong> · {selectedDocument.purchaseType === "overseas" ? "ต่างประเทศ" : "ในประเทศ"}</p>
            <p className="text-sm text-gray-600">อนุมัติหนึ่งขั้นทั้งสองประเภท ผู้สร้างห้ามอนุมัติตัวเอง · ยังไม่ส่งอีเมลผู้ขาย/ไม่เพิ่ม Stock · เปิดหรือพิมพ์ไม่เปลี่ยนสถานะ</p>
            {!selectedDocument.createdById && <p role="alert" className="text-amber-800">PO เดิมไม่มีผู้สร้าง ต้องตรวจสอบข้อมูลก่อนส่งอนุมัติ</p>}
            {action && <form className="space-y-3 rounded border p-3" onSubmit={event => { event.preventDefault(); void runDetail(doc => ApApi.purchaseOrderAction(doc.id, action, doc.updatedAt, reason)); }}>
              <h3 className="font-bold">ยืนยัน{poActionLabels[action]}</h3>
              {["return", "reject", "cancel"].includes(action) && <label className={fieldClass}>เหตุผล *
                <textarea required maxLength={1000} disabled={saving} className={inputClass} value={reason} onChange={event => setReason(event.target.value)} />
              </label>}
              {action === "cancel" && <p className="text-sm text-amber-800">ต้องปิด PS/GR ที่เกี่ยวข้องก่อน การยกเลิก PO ไม่กลับยอดคลังหรือการจ่ายเงินให้เอง</p>}
              <div className="flex gap-2">
                <button disabled={saving || !availableActions.includes(action)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">ยืนยัน</button>
                <button type="button" disabled={saving} onClick={() => setAction(null)} className="rounded border px-4 py-2 text-sm">ปิด</button>
              </div>
            </form>}
            <div className="space-y-2 text-sm">
              <h3 className="font-bold">เอกสารแนบ PO</h3>
              {(selectedDocument.attachments || []).map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all">{file.originalName}</span>
                {editableDetail && canManage && <button disabled={saving} className="rounded border px-3 py-1" onClick={() => void runDetail(doc => ApApi.deletePurchaseOrderFile(file.id, doc.updatedAt))}>ลบไฟล์</button>}
              </div>)}
              {editableDetail && canManage && <div className="space-y-2">
                <label className={fieldClass}>แนบ PDF/JPG/PNG
                  <input key={selectedDocument.updatedAt} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" disabled={saving} className="block max-w-full" onChange={event => setPendingFiles(Array.from(event.target.files || []))} />
                </label>
                <button disabled={saving || !pendingFiles.length} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => void runDetail(doc => ApApi.uploadPurchaseOrderFiles(doc.id, pendingFiles, doc.updatedAt))}>อัปโหลดไฟล์</button>
              </div>}
            </div>
            <h3 className="font-bold">ประวัติรายการ</h3>
            <ul className="space-y-2 text-sm">{selectedDocument.history?.map(row => <li key={row.id} className="break-words border-t pt-2">
              {formatAccountingDateTime(row.createdAt)} · {poHistoryLabels[row.action] || row.action} · {row.performedBy?.fullName || "-"}{row.reason ? ` · ${row.reason}` : ""}
            </li>)}</ul>
          </section>
          <div className="po-document-preview w-full overflow-x-auto">
            <PurchaseOrderDocumentView document={selectedDocument} company={company} />
          </div>
        </div>
      )}
    </>
  );
}
