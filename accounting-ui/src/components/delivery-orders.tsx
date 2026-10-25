"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountingLookupApi, AccountingSettingsApi, ArApi } from "@/lib/api";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";
import { branchDefaults, type AccountCustomer } from "@/lib/account-customers";
import { formatAccountingDate, formatAccountingDateTime, parseAccountingDate } from "@/lib/accounting-date";
import {
  deliveryOrderStatus, newDeliveryOrder, newDeliveryOrderLine, deliveryOrderAmounts,
  type DeliveryOrder, type DeliveryOrderInput, type DeliveryOrderLine, type DeliveryOrderProduct, type DeliveryOrderWorkOrder,
} from "@/lib/delivery-order";
import type { PurchaseOrderCompanySettings } from "@/lib/accounting-purchase-orders";
import { DateInput } from "@/components/date-input";
import { DeliveryOrderDocument, DeliveryOrderPrintStyles } from "@/components/delivery-order-document";
import { SearchableSelect } from "@/components/searchable-select";

const listHref = "/ar/delivery-orders";
const control = "w-full min-w-0 rounded-md border border-[#dfe5de] bg-white px-3 py-2";
const buttonBase = "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-40";
const button = `${buttonBase} border-[#dfe5de] bg-white`;
const primary = `${buttonBase} border-blue-600 bg-blue-600 text-white`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง";

export function DeliveryOrders({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const canWrite = canUseAccounting(useAccountingAccess(), "ar", "create");
  const [list, setList] = useState<DeliveryOrder[]>([]);
  const [document, setDocument] = useState<DeliveryOrder | null>(null);
  const [form, setForm] = useState<DeliveryOrderInput>(newDeliveryOrder);
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [products, setProducts] = useState<DeliveryOrderProduct[]>([]);
  const [workOrders, setWorkOrders] = useState<DeliveryOrderWorkOrder[]>([]);
  const [company, setCompany] = useState<PurchaseOrderCompanySettings>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState({ q: "", status: "" });
  const [productSearch, setProductSearch] = useState("");
  const [workOrderSearch, setWorkOrderSearch] = useState("");
  const [workOrderError, setWorkOrderError] = useState("");
  const [workOrderLoading, setWorkOrderLoading] = useState(true);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<DeliveryOrderWorkOrder | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const isForm = mode === "new" || mode === "edit";
  const selectedCustomer = customers.find(customer => customer.id === form.customerId);
  const selectedBranch = selectedCustomer?.branches.find(branch => branch.id === form.customerBranchId);
  const totals = deliveryOrderAmounts(form.items, form.discount, form.vatConfig);
  const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    if (isForm && !canWrite) return;
    let current = true;
    setLoading(true);
    setLoadError("");
    setError("");
    setDocument(null);
    setCancelOpen(false);
    async function load() {
      if (mode === "list") {
        const rows = await ArApi.getDeliveryOrders(query);
        if (current) setList(rows);
        return;
      }
      const doc = recordId ? await ArApi.getDeliveryOrder(recordId) : null;
      if (isForm) {
        const [customerRows, productRows] = await Promise.all([AccountingLookupApi.getCustomers(), AccountingLookupApi.getProducts()]);
        if (!current) return;
        setCustomers(customerRows);
        setProducts(productRows);
        setForm(doc ? {
          docDate: parseAccountingDate(formatAccountingDate(doc.docDate)) || "",
          customerId: doc.customerId, customerBranch: doc.customerBranch || "", customerBranchId: "",
          shippingAddress: doc.shippingAddress || "", receiver: doc.receiver || "", workOrderId: doc.workOrderId,
          remark: doc.remark || "", updatedAt: doc.updatedAt,
          customerTel: doc.customerTel || "", customerFax: doc.customerFax || "",
          deliveryDate: doc.deliveryDate ? parseAccountingDate(formatAccountingDate(doc.deliveryDate)) || "" : "",
          creditTerm: doc.creditTerm, vatConfig: doc.vatConfig, discount: doc.discount,
          items: doc.items.map(item => ({ ...item, productId: item.productId || null, partNo: item.partNo || item.product?.code || "", unit: item.unit || "", remark: item.remark || "" })),
        } : newDeliveryOrder());
      } else {
        const settings = await AccountingSettingsApi.get();
        if (current) setCompany(settings);
      }
      if (current) setDocument(doc);
      if (current) setSelectedWorkOrder(doc?.workOrder ?? null);
    }
    load().catch(err => { if (current) setLoadError(errorMessage(err)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [mode, recordId, canWrite, isForm, query, reload]);

  useEffect(() => {
    if (!isForm || !canWrite) return;
    let current = true;
    setWorkOrderLoading(true);
    setWorkOrderError("");
    const timer = setTimeout(() => {
      ArApi.getDeliveryWorkOrders(workOrderSearch).then(rows => {
        if (current) { setWorkOrders(rows); setWorkOrderError(""); }
      }).catch(err => { if (current) { setWorkOrders([]); setWorkOrderError(errorMessage(err)); } })
        .finally(() => { if (current) setWorkOrderLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [workOrderSearch, isForm, canWrite]);

  function patchLine(index: number, patch: Partial<DeliveryOrderLine>) {
    setForm(previous => ({ ...previous, items: previous.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }
  function chooseCustomer(customerId: string) {
    const customer = customers.find(item => item.id === customerId);
    setForm(previous => ({
      ...previous, customerId, customerBranchId: "", customerBranch: "", shippingAddress: "", receiver: "",
      ...(customer ? branchDefaults(customer) : {}),
      customerTel: customer?.branches[0]?.tel ?? customer?.tel ?? "", customerFax: customer?.branches[0]?.fax ?? customer?.fax ?? "",
      creditTerm: customer?.creditTerm ?? 30, vatConfig: customer?.vatConfig ?? "VAT7%",
    }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, items: form.items.map(item => ({
        productId: item.productId, partNo: item.partNo, desc: item.desc, qty: Number(item.qty), unit: item.unit,
        unitPrice: item.unitPrice, discount: item.discount, remark: item.remark,
      })) };
      const result = mode === "edit" && recordId
        ? await ArApi.updateDeliveryOrder(recordId, payload) : await ArApi.createDeliveryOrder(payload);
      router.push(`${listHref}/${result.id}`);
    } catch (err) { setError(errorMessage(err)); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite || !document || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await ArApi.cancelDeliveryOrder(document.id, cancelReason.trim());
      setCancelReason("");
      setReload(value => value + 1);
    } catch (err) { setError(errorMessage(err)); }
    finally { savingRef.current = false; setSaving(false); }
  }

  if (isForm && !canWrite) return <p role="alert">ไม่มีสิทธิ์สร้างหรือแก้ไขใบส่งของ</p>;

  return (
    <div className="mx-auto min-w-0 max-w-6xl">
      <DeliveryOrderPrintStyles />
      <header className="so-no-print mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-blue-600">Accounts Receivable</p>
          <h1 className="mt-1 text-2xl font-bold">{mode === "new" ? "สร้างใบส่งของชั่วคราว" : mode === "edit" ? "แก้ไขใบส่งของชั่วคราว" : document?.soNo || "ใบส่งของชั่วคราว (SO)"}</h1>
          <p className="mt-1 text-sm text-[#657069]">ระยะ Draft — ยังไม่เปิดยืนยัน และยังไม่ตัด Stock</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode !== "list" && <Link className={button} href={listHref}>กลับรายการ SO</Link>}
          {mode === "list" && canWrite && <Link className={primary} href={`${listHref}/new`}>สร้าง SO</Link>}
          {mode === "view" && document && !loading && !loadError && <>
            {document.status === "draft" && canWrite && <>
              <Link className={button} href={`${listHref}/${document.id}/edit`}>แก้ไข</Link>
              <button className={`${button} text-red-700`} type="button" disabled={saving} onClick={() => { setCancelOpen(true); setError(""); }}>ยกเลิกเอกสาร</button>
            </>}
            <button className={button} type="button" onClick={() => window.print()}>พิมพ์ / บันทึก PDF</button>
          </>}
        </div>
      </header>
      {loadError && <div role="alert" className="so-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{loadError} <button type="button" className="underline" onClick={() => setReload(value => value + 1)}>โหลดใหม่</button></div>}
      {error && <p role="alert" className="so-no-print mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {loading && <p role="status" className="so-no-print mb-4">กำลังโหลดข้อมูล...</p>}
      {mode === "list" && <>
        <form className="mb-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQuery({ q: search.trim(), status }); }}>
          <input className={`${control} sm:max-w-xs`} aria-label="ค้นหา SO" placeholder="เลข SO / ชื่อลูกค้า" value={search} onChange={event => setSearch(event.target.value)} />
          <select className={`${control} sm:max-w-40`} aria-label="สถานะ" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">ทุกสถานะ</option><option value="draft">Draft</option><option value="cancelled">ยกเลิก</option>
          </select>
          <button className={button} disabled={loading}>ค้นหา</button>
        </form>
        {!loading && !loadError && <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-gray-50"><tr>{["เลข SO", "วันที่", "ลูกค้า / สาขา", "WO", "รายการ", "สถานะ", "จัดการ"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
            <tbody>{list.map(doc => <tr key={doc.id} className="border-t">
              <td className="p-3"><Link className="text-blue-700 underline" href={`${listHref}/${doc.id}`}>{doc.soNo}</Link></td>
              <td className="p-3">{formatAccountingDate(doc.docDate)}</td><td className="p-3">{doc.customer?.name || "-"} / {doc.customerBranch || "-"}</td>
              <td className="p-3">{doc.workOrder?.woNo || "-"}</td><td className="p-3">{doc.items.length}</td><td className="p-3">{deliveryOrderStatus(doc.status)}</td>
              <td className="p-3"><Link href={`${listHref}/${doc.id}`} className="text-blue-700 underline">ดูเอกสาร</Link></td>
            </tr>)}</tbody>
          </table>
          {!list.length && <p className="p-6 text-center">ยังไม่มีใบส่งของที่ตรงกับเงื่อนไข</p>}
        </div>}
      </>}
      {isForm && !loadError && (mode === "new" || document) && (
        document && document.status !== "draft" ? <p role="alert">แก้ไขได้เฉพาะสถานะ Draft <Link href={`${listHref}/${document.id}`} className="underline">ดูเอกสาร</Link></p> :
        <form onSubmit={save} className="so-no-print space-y-5">
          <fieldset disabled={loading || saving} className="min-w-0 space-y-5">
            <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
              <label>วันที่เอกสาร<DateInput required className={control} value={form.docDate} onChange={docDate => setForm(previous => ({ ...previous, docDate }))} /></label>
              <SearchableSelect label="ลูกค้า" required value={selectedCustomer ? form.customerId : ""}
                selectedLabel={selectedCustomer ? `${selectedCustomer.code || ""} — ${selectedCustomer.name}` : form.customerId ? `${document?.customer?.name || "ลูกค้าเดิม"} (ปิดใช้งาน กรุณาเลือกใหม่)` : ""}
                placeholder="เลือกลูกค้า" searchPlaceholder="พิมพ์รหัส / ชื่อลูกค้า"
                options={customers.map(customer => ({ value: customer.id, label: `${customer.code || ""} — ${customer.name}` }))}
                onChange={chooseCustomer} />
              <div>
                <label>สาขาลูกค้า<select className={control} value={form.customerBranchId || ""} onChange={event => {
                  if (!selectedCustomer) return;
                  if (!event.target.value) { setForm(previous => ({ ...previous, customerBranchId: "" })); return; }
                  const branch = selectedCustomer.branches.find(branch => branch.id === event.target.value);
                  setForm(previous => ({
                    ...previous, ...branchDefaults(selectedCustomer, event.target.value),
                    customerTel: branch?.tel ?? selectedCustomer.tel ?? "", customerFax: branch?.fax ?? selectedCustomer.fax ?? "",
                  }));
                }}>
                  <option value="">ข้อมูลสาขาบนเอกสาร</option>
                  {selectedCustomer?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}
                </select></label>
                <label className="mt-2 block">ชื่อสาขาบนเอกสาร<input className={control} value={form.customerBranch} readOnly={Boolean(form.customerBranchId)} onChange={event => setForm(previous => ({ ...previous, customerBranch: event.target.value }))} /></label>
              </div>
              <label>ผู้รับสินค้า<input className={control} value={form.receiver} onChange={event => setForm(previous => ({ ...previous, receiver: event.target.value }))} /></label>
              <label>โทรศัพท์ลูกค้า<input className={control} value={form.customerTel} onChange={event => setForm(previous => ({ ...previous, customerTel: event.target.value }))} /></label>
              <label>โทรสารลูกค้า<input className={control} value={form.customerFax} onChange={event => setForm(previous => ({ ...previous, customerFax: event.target.value }))} /></label>
              <label>วันที่กำหนดส่ง<DateInput className={control} value={form.deliveryDate} onChange={deliveryDate => setForm(previous => ({ ...previous, deliveryDate }))} /></label>
              <label>จำนวนวันเครดิต<input required type="number" min="0" max="2147483647" step="1" className={control} value={form.creditTerm} onChange={event => setForm(previous => ({ ...previous, creditTerm: event.target.value }))} /></label>
              <div>
                {selectedBranch && <label className="mb-2 block">เลือกที่อยู่จัดส่ง<select className={control} value={selectedBranch.addresses.some(address => address.address === form.shippingAddress) ? form.shippingAddress : ""} onChange={event => { if (event.target.value) setForm(previous => ({ ...previous, shippingAddress: event.target.value })); }}>
                  <option value="">กรอกที่อยู่เอง</option>{selectedBranch.addresses.filter(address => address.kind !== "billing").map(address => <option key={address.id} value={address.address}>{address.label}</option>)}
                </select></label>}
                <label>ที่อยู่จัดส่ง<textarea className={control} rows={3} value={form.shippingAddress} onChange={event => setForm(previous => ({ ...previous, shippingAddress: event.target.value }))} /></label>
              </div>
              <div>
                <SearchableSelect label="อ้างอิง Work Order (ไม่บังคับ)" value={form.workOrderId || ""}
                  selectedLabel={selectedWorkOrder ? `${selectedWorkOrder.woNo}${selectedWorkOrder.project ? ` — ${selectedWorkOrder.project}` : ""}` : "ไม่อ้างอิง WO"}
                  placeholder="ไม่อ้างอิง WO" searchPlaceholder="พิมพ์เลข WO / โครงการ"
                  loading={workOrderLoading} error={workOrderError}
                  onSearch={query => {
                    if (query !== workOrderSearch) { setWorkOrderLoading(true); setWorkOrderError(""); setWorkOrderSearch(query); }
                  }}
                  options={[{ value: "", label: "ไม่อ้างอิง WO" }, ...workOrders.map(wo => ({ value: wo.id, label: `${wo.woNo}${wo.project ? ` — ${wo.project}` : ""}` }))]}
                  onChange={id => {
                    setSelectedWorkOrder(workOrders.find(wo => wo.id === id) ?? null);
                    setForm(previous => ({ ...previous, workOrderId: id || null }));
                  }} />
                <p className="mt-1 text-xs text-gray-500">อ้างอิงเลขเท่านั้น ไม่ดึงรายการ WO</p>
              </div>
            </section>
            <p className="text-sm text-gray-600">ช่องใบสั่งจอง / ลงวันที่ / เงื่อนไขการวางบิลในแบบพิมพ์ยังเว้นว่างตามที่ตกลง</p>
            <section className="min-w-0 space-y-4 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="so-items-heading" className="text-lg font-bold">รายการส่งสินค้า <span className="text-sm font-normal text-gray-500">({form.items.length} รายการ)</span></h2>
                <button className={button} type="button" onClick={() => setForm(previous => ({ ...previous, items: [...previous.items, newDeliveryOrderLine()] }))}>เพิ่มรายการ</button>
              </div>
              <label className="block max-w-md text-sm">ค้นหาสินค้าในตัวเลือก<input className={control} placeholder="รหัส / ชื่อสินค้า" value={productSearch} onChange={event => setProductSearch(event.target.value)} /></label>
              <p id="so-items-help" className="text-sm text-gray-500">เลือกสินค้าหรือกรอกรายการเองได้ ราคาไม่รวม VAT · รายละเอียดและหมายเหตุอยู่ด้านล่างของแต่ละรายการ</p>
              <div role="region" aria-labelledby="so-items-heading" aria-describedby="so-items-help" className="relative max-w-full rounded-md border">
                <table aria-label="รายการส่งสินค้า แก้ไขข้อมูลแต่ละรายการในตาราง" className="so-items-table block w-full table-fixed text-sm md:table">
                  <colgroup className="hidden md:table-column-group"><col className="w-[5%]" /><col className="w-[24%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[19%]" /><col className="w-[8%]" /></colgroup>
                  <thead className="hidden bg-gray-50 text-left md:table-header-group">
                    <tr>{["ลำดับ", "สินค้า / รหัสสินค้า", "จำนวน", "หน่วย", "ราคา/หน่วย", "ส่วนลดรายการ (บาท)", "จำนวนเงิน (บาท)", "จัดการ"].map((title, index) => <th key={title} scope="col" className={`break-words border-b px-1.5 py-3 ${[2, 4, 5, 6].includes(index) ? "text-right" : ""}`}>{title}</th>)}</tr>
                  </thead>
                    {form.items.map((item, index) => <tbody key={index} data-so-item={index + 1} className="block border-b last:border-b-0 focus-within:bg-blue-50/40 md:table-row-group">
                    <tr className="grid grid-cols-2 items-start align-top md:table-row">
                      <th scope="row" className="col-span-2 block px-1.5 py-3 text-left font-medium md:table-cell md:text-center"><span className="md:sr-only">รายการ </span>{index + 1}</th>
                      <td className="col-span-2 block min-w-0 space-y-2 p-1.5 md:table-cell">
                        <label className="block"><span className="sr-only">สินค้า รายการ {index + 1}</span><select className={control} value={item.productId || ""} onChange={event => {
                          const product = products.find(product => product.id === event.target.value);
                          patchLine(index, product ? { productId: product.id, partNo: product.code, desc: product.name, unit: product.unit || "", unitPrice: product.price ?? 0 } : { productId: null });
                        }}>
                          <option value="">กรอกรายการเอง</option>
                          {item.productId && !products.some(product => product.id === item.productId) && <option value={item.productId}>{item.product?.code || "สินค้าเดิม"} (ปิดใช้งาน กรุณาเลือกใหม่)</option>}
                          {products.filter(product => product.id === item.productId || `${product.code} ${product.name}`.toLowerCase().includes(productSearch.toLowerCase())).map(product => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}
                        </select></label>
                        <label className="block"><span className="sr-only">รหัสสินค้าบนเอกสาร รายการ {index + 1}</span><input className={control} placeholder="รหัสสินค้าบนเอกสาร" value={item.partNo} onChange={event => patchLine(index, { partNo: event.target.value })} /></label>
                      </td>
                      <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">จำนวน รายการ {index + 1}</span><input required className={`${control} text-right`} type="number" min="1" max="999999999" step="1" value={item.qty} onChange={event => patchLine(index, { qty: event.target.value })} /></label></td>
                      <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">หน่วย รายการ {index + 1}</span><input required className={control} value={item.unit} onChange={event => patchLine(index, { unit: event.target.value })} /></label></td>
                      <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">ราคา/หน่วย รายการ {index + 1}</span><input required type="number" min="0" max="9999999999.99" step="0.01" className={`${control} text-right`} value={item.unitPrice} onChange={event => patchLine(index, { unitPrice: event.target.value })} /></label></td>
                      <td className="block min-w-0 p-1.5 md:table-cell"><label><span className="block text-xs md:sr-only">ส่วนลดรายการ (บาท) รายการ {index + 1}</span><input required type="number" min="0" max={Math.round(Number(item.qty) * Number(item.unitPrice) * 100) / 100} step="0.01" className={`${control} text-right`} value={item.discount} onChange={event => patchLine(index, { discount: event.target.value })} /></label></td>
                      <td className="block min-w-0 break-words px-1.5 py-3 text-right font-semibold tabular-nums md:table-cell"><span className="block text-xs font-normal md:sr-only">จำนวนเงิน (บาท)</span><output aria-label={`จำนวนเงินรายการ ${index + 1}`}>{money(totals.lineAmounts[index])}</output></td>
                      <td className="block p-1.5 text-right md:table-cell"><button className="rounded-md border border-red-200 px-2 py-2 text-red-700 hover:bg-red-50 disabled:opacity-40" type="button" aria-label={`ลบรายการ ${index + 1}`} disabled={form.items.length === 1} onClick={() => setForm(previous => ({ ...previous, items: previous.items.filter((_, i) => i !== index) }))}>ลบ</button></td>
                    </tr>
                    <tr className="block md:table-row"><td colSpan={8} className="block px-1.5 pb-4 pt-2 md:table-cell">
                      <div className="grid min-w-0 gap-3 md:grid-cols-[2fr_1fr]">
                        <label className="block text-xs text-gray-600"><span>รายละเอียด รายการ {index + 1}</span><textarea required rows={2} className={`${control} mt-1 text-sm text-[#17211b]`} placeholder="รายละเอียดสินค้า / งาน" value={item.desc} onChange={event => patchLine(index, { desc: event.target.value })} /></label>
                        <label className="block text-xs text-gray-600"><span>หมายเหตุรายการ {index + 1}</span><input className={`${control} mt-1 text-sm text-[#17211b]`} placeholder="หมายเหตุรายการ (ถ้ามี)" value={item.remark} onChange={event => patchLine(index, { remark: event.target.value })} /></label>
                      </div>
                    </td></tr>
                    </tbody>)}
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button className={button} type="button" onClick={() => setForm(previous => ({ ...previous, items: [...previous.items, newDeliveryOrderLine()] }))}>เพิ่มรายการ</button>
                <p className="text-sm font-semibold">รวมเงินรายการ (ก่อนส่วนลดท้ายเอกสาร): <output aria-label="รวมเงินรายการ" className="tabular-nums">{money(totals.subTotal)}</output> บาท</p>
              </div>
            </section>
            <section className="grid min-w-0 gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block">ส่วนลดท้ายเอกสาร (บาท)<input required className={control} type="number" min="0" max={Math.max(0, totals.subTotal)} step="0.01" value={form.discount} onChange={event => setForm(previous => ({ ...previous, discount: event.target.value }))} /></label>
                <label className="block">VAT<select className={control} value={form.vatConfig} onChange={event => setForm(previous => ({ ...previous, vatConfig: event.target.value === "NO_VAT" ? "NO_VAT" : "VAT7%" }))}><option value="VAT7%">VAT 7%</option><option value="NO_VAT">No VAT</option></select></label>
                <p className="text-xs text-gray-500">ราคาไม่รวม VAT; รวมเงินหลังหักส่วนลดรายการ แล้วหักส่วนลดท้ายเอกสารก่อนคิด VAT</p>
              </div>
              <dl className="space-y-2 text-sm">
                {[["รวมเงิน", totals.subTotal], ["ส่วนลดการค้า", form.discount], ["เงินหลังหักส่วนลด", totals.taxableAmount], [form.vatConfig === "NO_VAT" ? "ภาษีมูลค่าเพิ่ม (No VAT)" : "ภาษีมูลค่าเพิ่ม 7%", totals.vat], ["จำนวนเงินทั้งสิ้น", totals.netAmount]].map(([label, amount]) => <div key={label} className="flex justify-between gap-3 border-b pb-2"><dt>{label}</dt><dd className="font-bold">{money(amount)}</dd></div>)}
              </dl>
            </section>
            <label className="block">หมายเหตุเอกสาร<textarea className={control} rows={3} value={form.remark} onChange={event => setForm(previous => ({ ...previous, remark: event.target.value }))} /></label>
            <div className="flex flex-wrap gap-2"><button className={primary} type="submit">{saving ? "กำลังบันทึก..." : "บันทึก Draft"}</button><Link className={button} href={document ? `${listHref}/${document.id}` : listHref}>กลับโดยไม่บันทึก</Link></div>
          </fieldset>
        </form>
      )}
      {mode === "view" && document && !loading && !loadError && <>
        {cancelOpen && canWrite && <form onSubmit={cancel} className="so-no-print mb-5 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p>ยกเลิกได้เมื่อไม่มี Invoice ที่ยังไม่ยกเลิกอ้างอิง และไม่สามารถแก้ไขเอกสารหลังยกเลิก</p>
          <label className="block">เหตุผลยกเลิก<textarea required className={control} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2"><button className={`${button} text-red-700`} disabled={saving || !cancelReason.trim()}>{saving ? "กำลังยกเลิก..." : "ยืนยันยกเลิกเอกสาร"}</button><button type="button" className={button} disabled={saving} onClick={() => setCancelOpen(false)}>กลับ</button></div>
        </form>}
        <div className="so-preview max-w-full overflow-x-auto rounded-lg border"><DeliveryOrderDocument document={document} company={company} /></div>
        <section className="so-no-print mt-5 rounded-lg border bg-white p-4">
          <h2 className="font-bold">ประวัติเอกสาร</h2>
          <ul className="mt-2 space-y-2 text-sm">{document.history?.map((log, index) => <li key={log.id || index} className="break-words">
            {formatAccountingDateTime(log.createdAt)} — {({ create: "สร้าง", update: "แก้ไข", cancel: "ยกเลิก" }[log.action] || log.action)}
            {log.performedById && <span> / ผู้ทำ: {log.performedBy?.fullName || log.performedById}</span>}{log.reason && <p className="whitespace-pre-wrap">เหตุผล: {log.reason}</p>}
          </li>)}</ul>
        </section>
      </>}
    </div>
  );
}
