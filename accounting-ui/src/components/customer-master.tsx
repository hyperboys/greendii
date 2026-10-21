"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MasterApi } from "@/lib/api";
import { AccountCustomer, AccountSale, CustomerBranch, CustomerInput, customerForm, newBranch } from "@/lib/account-customers";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canUseAccounting } from "@/lib/accounting-access";

const inputClass = "mt-1 w-full rounded border border-[#dfe5de] bg-white p-2 text-sm disabled:bg-[#f4f6f2]";
const buttonClass = "rounded border border-[#dfe5de] px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-[#566159]">{label}{children}</label>;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง";
}

export function CustomerMaster({ mode = "list", recordId }: { mode?: "list" | "new" | "view" | "edit"; recordId?: string }) {
  const router = useRouter();
  const access = useAccountingAccess();
  const canCreate = canUseAccounting(access, "master", "create");
  const canUpdate = canUseAccounting(access, "master", "update");
  const [customers, setCustomers] = useState<AccountCustomer[]>([]);
  const [sales, setSales] = useState<AccountSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState<{ customer?: AccountCustomer; readOnly: boolean } | null>(null);
  const [form, setForm] = useState<CustomerInput>(customerForm());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const writable = modal && !modal.readOnly && (modal.customer ? canUpdate : canCreate);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [customerList, saleList] = await Promise.all([MasterApi.getCustomers(), MasterApi.getSales()]);
      setCustomers(customerList);
      setSales(saleList);
      if (mode !== "list") {
        if (mode !== "new" && !recordId) throw new Error("ไม่พบรหัสลูกค้า");
        const customer = recordId ? await MasterApi.getCustomer(recordId) : undefined;
        setForm(customerForm(customer));
        setModal({ customer, readOnly: mode === "view" });
      }
    } catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, [mode, recordId]);
  useEffect(() => { void load(); }, [load]);
  const open = (customer?: AccountCustomer, readOnly = false) => {
    router.push(customer ? `/master/customers/${encodeURIComponent(customer.id)}${readOnly ? "" : "/edit"}` : "/master/customers/new");
  };
  const updateBranch = (index: number, patch: Partial<CustomerBranch>) => {
    setForm(current => ({ ...current, branches: current.branches.map((b, i) => i === index ? { ...b, ...patch } : b) }));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal || !writable || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const saved = modal.customer ? await MasterApi.updateCustomer(modal.customer.id, form) : await MasterApi.createCustomer(form);
      setCustomers(current => [...current.filter(c => c.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      router.push("/master?tab=customers");
    } catch (err) { setFormError(message(err)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const duplicateTax = form.taxId.trim() ? customers.filter(c => c.id !== modal?.customer?.id && c.taxId?.trim() === form.taxId.trim()) : [];
  const filtered = customers.filter(customer => (status === "all" || customer.active === (status === "active")) &&
    [customer.code, customer.name, customer.taxId, customer.responsibleSale?.name, ...customer.branches.map(b => b.code),
      ...(customer.secondarySales ?? []).map(s => s.sale?.name)].some(value => value?.toLowerCase().includes(query.toLowerCase())));
  return <section aria-label="จัดการลูกค้าบัญชี">
    {mode !== "list" && <Link href="/master?tab=customers" className={`${buttonClass} mb-4 inline-block`}>กลับรายการลูกค้า</Link>}
    {mode === "list" && <>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="ค้นหารหัส / รหัสเดิม / ชื่อ / Tax ID / Sale"><input className={inputClass} value={query} onChange={e => setQuery(e.target.value)} /></Field>
      <Field label="สถานะ"><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}>
        <option value="all">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option>
      </select></Field>
      <button className={buttonClass} onClick={() => void load()} disabled={loading}>โหลดใหม่</button>
      <button className={`${buttonClass} ml-auto bg-[#0866ff] text-white`} disabled={!canCreate || loading || Boolean(error)} onClick={() => open()}>เพิ่มลูกค้า</button>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded-lg border border-[#dfe5de] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f8faf7] text-[#566159]"><tr>{["รหัส / ชื่อลูกค้า", "Tax ID / ผู้ติดต่อ", "สาขา", "Sale ผู้ดูแล", "VAT / Credit Term", "สถานะ", "จัดการ"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td className="p-6 text-center" colSpan={7}>กำลังโหลดข้อมูล...</td></tr> : filtered.length === 0
          ? <tr><td className="p-6 text-center" colSpan={7}>ไม่พบข้อมูลลูกค้า</td></tr>
          : filtered.map(customer => <tr key={customer.id} className="border-t border-[#dfe5de]">
            <td className="p-3"><div className="font-bold">{customer.name}</div><div>{customer.code || "ยังไม่ระบุรหัส"}</div></td>
            <td className="p-3"><div>{customer.taxId || "-"}</div><div>{customer.contactPerson || customer.tel || "-"}</div></td>
            <td className="p-3">{customer.branches.length || 1} สาขา
              {customer.branches.some(b => !b.addresses.length) && <div className="text-xs font-bold text-amber-700">ยังไม่มีที่อยู่</div>}</td>
            <td className="p-3"><div>{customer.responsibleSale?.name || "ยังไม่ระบุ"}</div>
              {Boolean(customer.secondarySales?.length) && <div className="text-xs text-[#657069]">รอง: {customer.secondarySales?.map(s => s.sale?.name).filter(Boolean).join(", ")}</div>}</td>
            <td className="p-3">{customer.vatConfig === "NO_VAT" ? "ไม่มี VAT" : customer.vatConfig}<br />{customer.creditTerm} วัน</td>
            <td className="p-3">{customer.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
            <td className="p-3"><div className="flex gap-2">
              <button className={buttonClass} onClick={() => open(customer, true)}>ดูข้อมูล</button>
              <button className={buttonClass} disabled={!canUpdate} title={!canUpdate ? "ไม่มีสิทธิ์แก้ไขข้อมูลหลัก" : undefined} onClick={() => open(customer)}>แก้ไข</button>
            </div></td>
          </tr>)}</tbody>
      </table>
    </div>
    </>}
    {mode !== "list" && loading && <p className="p-6 text-sm">กำลังโหลดข้อมูลลูกค้า...</p>}
    {mode !== "list" && error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {mode !== "list" && !loading && !error && modal && <div>
      <div aria-labelledby="customer-title" className="w-full rounded-lg border border-[#dfe5de] bg-white p-6 shadow-sm">
        <h2 id="customer-title" className="text-lg font-bold">{modal.readOnly ? "ข้อมูลลูกค้า" : modal.customer ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</h2>
        <p className="mt-1 text-xs text-[#657069]">ลูกค้าบัญชีและทะเบียน Sale บัญชีแยกจากระบบ Sales</p>
        <form onSubmit={save} className="mt-4 space-y-4">
          {formError && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          {duplicateTax.length > 0 && <p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-800">Tax ID ตรงกับลูกค้า: {duplicateTax.map(c => `${c.code || "-"} ${c.name}`).join(", ")} กรุณาตรวจสอบข้อมูลซ้ำก่อนบันทึก</p>}
          <fieldset disabled={!writable || saving} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="รหัสลูกค้า *"><input required className={inputClass} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
              <Field label="ชื่อลูกค้า *"><input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Tax ID"><input className={inputClass} value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} /></Field>
              <Field label="ประเภทลูกค้า"><select className={inputClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option>นิติบุคคล</option><option>บุคคลธรรมดา</option></select></Field>
              <Field label="ผู้ติดต่อ"><input className={inputClass} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></Field>
              <Field label="โทรศัพท์"><input type="tel" className={inputClass} value={form.tel} onChange={e => setForm({ ...form, tel: e.target.value })} /></Field>
              <Field label="แฟกซ์"><input type="tel" className={inputClass} value={form.fax} onChange={e => setForm({ ...form, fax: e.target.value })} /></Field>
              <Field label="อีเมล (หลายอีเมลคั่นด้วย ,)"><input type="email" multiple className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Sale หลัก (ทะเบียนบัญชี)"><select className={inputClass} value={form.responsibleSaleId} onChange={e => setForm({ ...form, responsibleSaleId: e.target.value, secondarySaleIds: form.secondarySaleIds.filter(id => id !== e.target.value) })}>
                <option value="">ยังไม่ระบุ</option>{sales.filter(s => s.active || s.id === form.responsibleSaleId).map(s => <option key={s.id} value={s.id}>{s.code} - {s.name}{s.active ? "" : " (ปิดใช้งาน)"}</option>)}
              </select></Field>
              <fieldset className="sm:col-span-2"><legend className="text-xs font-bold text-[#566159]">Sale รอง</legend>
                <div className="mt-1 flex flex-wrap gap-3">{sales.filter(s => s.id !== form.responsibleSaleId && (s.active || form.secondarySaleIds.includes(s.id))).map(s => <label key={s.id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={form.secondarySaleIds.includes(s.id)} onChange={e => setForm({ ...form, secondarySaleIds: e.target.checked ? [...form.secondarySaleIds, s.id] : form.secondarySaleIds.filter(id => id !== s.id) })} />
                  {s.code} - {s.name}{s.active ? "" : " (ปิดใช้งาน)"}</label>)}</div>
              </fieldset>
              <Field label="การตั้งค่า VAT"><select className={inputClass} value={form.vatConfig} onChange={e => setForm({ ...form, vatConfig: e.target.value === "NO_VAT" ? "NO_VAT" : "VAT7%" })}><option value="VAT7%">VAT 7%</option><option value="NO_VAT">ไม่มี VAT</option></select></Field>
              <Field label="Credit Term (วัน)"><input required type="number" min={0} max={2147483647} step={1} className={inputClass} value={Number.isNaN(form.creditTerm) ? "" : form.creditTerm} onChange={e => setForm({ ...form, creditTerm: e.target.valueAsNumber })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />เปิดใช้งานลูกค้า</label>
            </div>
            <div className="flex items-center justify-between"><h3 className="font-bold">สาขาและที่อยู่</h3><button type="button" className={buttonClass} onClick={() => setForm({ ...form, branches: [...form.branches, newBranch()] })}>เพิ่มสาขา</button></div>
            {form.branches.map((branch, branchIndex) => <section key={branch.id || branchIndex} className="space-y-3 rounded border border-[#dfe5de] p-4">
              <div className="flex items-center justify-between"><h4 className="text-sm font-bold">สาขาที่ {branchIndex + 1}{branchIndex === 0 ? " (ค่าเริ่มต้น)" : ""}</h4>
                <button type="button" className={buttonClass} disabled={form.branches.length === 1} onClick={() => setForm({ ...form, branches: form.branches.filter((_, i) => i !== branchIndex) })}>ลบสาขา</button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="รหัสสาขา *"><input required className={inputClass} value={branch.code} onChange={e => updateBranch(branchIndex, { code: e.target.value })} /></Field>
                <Field label="ชื่อสาขา *"><input required className={inputClass} value={branch.name} onChange={e => updateBranch(branchIndex, { name: e.target.value })} /></Field>
                <Field label="ผู้ติดต่อสาขา"><input className={inputClass} value={branch.contactPerson ?? ""} onChange={e => updateBranch(branchIndex, { contactPerson: e.target.value })} /></Field>
                <Field label="อีเมลสาขา"><input type="email" multiple className={inputClass} value={branch.email ?? ""} onChange={e => updateBranch(branchIndex, { email: e.target.value })} /></Field>
                <Field label="โทรศัพท์สาขา"><input type="tel" className={inputClass} value={branch.tel ?? ""} onChange={e => updateBranch(branchIndex, { tel: e.target.value })} /></Field>
                <Field label="แฟกซ์สาขา"><input type="tel" className={inputClass} value={branch.fax ?? ""} onChange={e => updateBranch(branchIndex, { fax: e.target.value })} /></Field>
              </div>
              {branch.addresses.map((address, addressIndex) => <div key={address.id || addressIndex} className="grid gap-3 border-t border-[#dfe5de] pt-3 sm:grid-cols-2">
                <Field label="ชื่อที่อยู่ *"><input required className={inputClass} value={address.label} onChange={e => updateBranch(branchIndex, { addresses: branch.addresses.map((a, i) => i === addressIndex ? { ...a, label: e.target.value } : a) })} /></Field>
                <Field label="ประเภทที่อยู่"><select className={inputClass} value={address.kind} onChange={e => updateBranch(branchIndex, { addresses: branch.addresses.map((a, i) => i === addressIndex ? { ...a, kind: e.target.value === "billing" ? "billing" : e.target.value === "shipping" ? "shipping" : "both" } : a) })}>
                  <option value="both">วางบิลและจัดส่ง</option><option value="billing">ที่อยู่วางบิล</option><option value="shipping">ที่อยู่จัดส่ง</option>
                </select></Field>
                <div className="sm:col-span-2"><Field label="ที่อยู่ *"><textarea required rows={2} className={inputClass} value={address.address} onChange={e => updateBranch(branchIndex, { addresses: branch.addresses.map((a, i) => i === addressIndex ? { ...a, address: e.target.value } : a) })} /></Field></div>
                <button type="button" className={`${buttonClass} justify-self-start`} onClick={() => updateBranch(branchIndex, { addresses: branch.addresses.filter((_, i) => i !== addressIndex) })}>ลบที่อยู่</button>
              </div>)}
              {!branch.addresses.length && <p className="text-sm text-amber-700">สาขานี้ยังไม่มีที่อยู่ กด &quot;เพิ่มที่อยู่&quot; เพื่อบันทึกก่อนออกเอกสาร</p>}
              <button type="button" className={buttonClass} onClick={() => updateBranch(branchIndex, { addresses: [...branch.addresses, { label: "", kind: "both", address: "" }] })}>เพิ่มที่อยู่</button>
            </section>)}
          </fieldset>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Link href="/master?tab=customers" className={buttonClass}>กลับรายการ</Link>
            {!modal.readOnly && <button disabled={saving || !writable} className={`${buttonClass} bg-[#0866ff] text-white`} type="submit">{saving ? "กำลังบันทึก..." : "บันทึกข้อมูลลูกค้า"}</button>}
          </div>
        </form>
      </div>
    </div>}
  </section>;
}

const emptySale = { code: "", name: "", tel: "", email: "", active: true };
export function SaleMaster() {
  const access = useAccountingAccess();
  const canCreate = canUseAccounting(access, "master", "create");
  const canUpdate = canUseAccounting(access, "master", "update");
  const [sales, setSales] = useState<AccountSale[]>([]);
  const [editing, setEditing] = useState<AccountSale | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptySale);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const writable = editing ? canUpdate : canCreate;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setSales(await MasterApi.getSales()); }
    catch (err) { setError(message(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!writable || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = editing ? await MasterApi.updateSale(editing.id, { ...form, updatedAt: editing.updatedAt }) : await MasterApi.createSale(form);
      setSales(current => [...current.filter(s => s.id !== saved.id), saved].sort((a, b) => a.code.localeCompare(b.code)));
      setShowForm(false);
    } catch (err) { setError(message(err)); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <section aria-label="ทะเบียน Sale บัญชี">
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-[#657069]">ทะเบียน Sale สำหรับบัญชีเท่านั้น ไม่ใช่บัญชีผู้ใช้หรือข้อมูล Sale ในระบบ Sales</p>
      <button disabled={!canCreate || loading} className={`${buttonClass} bg-[#0866ff] text-white`} onClick={() => { setEditing(null); setForm(emptySale); setError(""); setShowForm(true); }}>เพิ่ม Sale บัญชี</button></div>
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {loading ? <p>กำลังโหลด...</p> : <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead><tr>{["รหัส", "ชื่อ", "โทรศัพท์", "อีเมล", "สถานะ", "จัดการ"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
      <tbody>{sales.length === 0 ? <tr><td colSpan={6} className="p-6 text-center">ยังไม่มี Sale บัญชี</td></tr> : sales.map(sale => <tr key={sale.id} className="border-t">
        <td className="p-3">{sale.code}</td><td className="p-3">{sale.name}</td><td className="p-3">{sale.tel || "-"}</td><td className="p-3">{sale.email || "-"}</td><td className="p-3">{sale.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
        <td className="p-3"><button disabled={!canUpdate} className={buttonClass} onClick={() => { setEditing(sale); setForm({ ...sale, tel: sale.tel ?? "", email: sale.email ?? "" }); setError(""); setShowForm(true); }}>แก้ไข</button></td>
      </tr>)}</tbody>
    </table></div>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" aria-labelledby="sale-title" className="w-full max-w-lg rounded-lg bg-white p-6">
      <h2 id="sale-title" className="text-lg font-bold">{editing ? "แก้ไข" : "เพิ่ม"} Sale บัญชี</h2>
      <form onSubmit={save} className="mt-4 space-y-3">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <fieldset disabled={saving || !writable} className="space-y-3">
          <Field label="รหัส Sale *"><input required className={inputClass} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="ชื่อ Sale *"><input required className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="โทรศัพท์"><input type="tel" className={inputClass} value={form.tel} onChange={e => setForm({ ...form, tel: e.target.value })} /></Field>
          <Field label="อีเมล"><input type="email" className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />เปิดใช้งาน</label>
        </fieldset>
        <div className="flex justify-end gap-2"><button type="button" disabled={saving} className={buttonClass} onClick={() => setShowForm(false)}>ปิด</button><button type="submit" disabled={saving || !writable} className={`${buttonClass} bg-[#0866ff] text-white`}>{saving ? "กำลังบันทึก..." : "บันทึก Sale"}</button></div>
      </form>
    </div></div>}
  </section>;
}
