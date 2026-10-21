"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MasterApi } from "@/lib/api";
import { AccountSupplier, SupplierInput, supplierForm } from "@/lib/account-suppliers";
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

export function SupplierMaster() {
  const access = useAccountingAccess();
  const canCreate = canUseAccounting(access, "master", "create");
  const canUpdate = canUseAccounting(access, "master", "update");
  const canDelete = canUseAccounting(access, "master", "delete");
  const [suppliers, setSuppliers] = useState<AccountSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [modal, setModal] = useState<{ supplier?: AccountSupplier; readOnly: boolean } | null>(null);
  const [form, setForm] = useState<SupplierInput>(supplierForm());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const writable = modal && !modal.readOnly && (modal.supplier ? canUpdate : canCreate);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const supplierList = await MasterApi.getSuppliers();
      setSuppliers(supplierList);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = (supplier?: AccountSupplier, readOnly = false) => {
    setForm(supplierForm(supplier));
    setFormError("");
    setModal({ supplier, readOnly });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal || !writable || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const saved = modal.supplier
        ? await MasterApi.updateSupplier(modal.supplier.id, form)
        : await MasterApi.createSupplier(form);
      setSuppliers(current => [...current.filter(supplier => supplier.id !== saved.id), saved]
        .sort((a, b) => a.code.localeCompare(b.code)));
      setModal(null);
    } catch (err) {
      setFormError(message(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const changeActive = async (supplier: AccountSupplier) => {
    setActionError("");
    setBusyId(supplier.id);
    try {
      if (supplier.active) {
        await MasterApi.deactivateSupplier(supplier.id);
        setSuppliers(current => current.map(item => item.id === supplier.id ? { ...item, active: false } : item));
        return;
      }
      const updated = await MasterApi.updateSupplier(supplier.id, { active: true });
      setSuppliers(current => current.map(item => item.id === updated.id ? updated : item));
    } catch (err) {
      setActionError(message(err));
    } finally {
      setBusyId("");
    }
  };

  const filtered = suppliers.filter(supplier =>
    (status === "all" || supplier.active === (status === "active")) &&
    [supplier.code, supplier.name, supplier.taxId, supplier.contactPerson, supplier.groupName, supplier.tel, supplier.email]
      .some(value => value?.toLowerCase().includes(query.toLowerCase())),
  );

  return <section aria-label="จัดการผู้จำหน่าย">
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="ค้นหารหัส / ชื่อ / Tax ID / ผู้ติดต่อ">
        <input className={inputClass} value={query} onChange={event => setQuery(event.target.value)} />
      </Field>
      <Field label="สถานะ">
        <select className={inputClass} value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">ทั้งหมด</option>
          <option value="active">ใช้งาน</option>
          <option value="inactive">ปิดใช้งาน</option>
        </select>
      </Field>
      <button className={buttonClass} onClick={() => void load()} disabled={loading}>โหลดใหม่</button>
      <button className={`${buttonClass} ml-auto bg-[#0866ff] text-white`} disabled={!canCreate || loading || Boolean(error)} onClick={() => open()}>
        เพิ่มผู้จำหน่าย
      </button>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {actionError && <p role="alert" className="mb-3 text-sm text-red-700">{actionError}</p>}
    <div className="overflow-x-auto rounded-lg border border-[#dfe5de] bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f8faf7] text-[#566159]">
          <tr>{["รหัส / ชื่อผู้จำหน่าย", "Tax ID / ผู้ติดต่อ", "ประเภท", "เครดิต / VAT", "สถานะ", "จัดการ"].map(label => <th className="p-3" key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {loading ? <tr><td className="p-6 text-center" colSpan={6}>กำลังโหลดข้อมูล...</td></tr>
            : filtered.length === 0 ? <tr><td className="p-6 text-center" colSpan={6}>ไม่พบข้อมูลผู้จำหน่าย</td></tr>
              : filtered.map(supplier => <tr key={supplier.id} className="border-t border-[#dfe5de]">
                <td className="p-3"><div className="font-bold">{supplier.name}</div><div>{supplier.code}</div></td>
                <td className="p-3"><div>{supplier.taxId || "-"}</div><div>{supplier.contactPerson || supplier.tel || "-"}</div></td>
                <td className="p-3">{supplier.supplierType === "overseas" ? "ต่างประเทศ" : supplier.supplierType === "contractor" ? "ผู้รับเหมา" : "ในประเทศ"}</td>
                <td className="p-3">{supplier.paymentTerm} วัน / {supplier.vatConfig || "-"}</td>
                <td className="p-3">{supplier.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClass} onClick={() => open(supplier, true)}>ดูข้อมูล</button>
                    <button className={buttonClass} disabled={!canUpdate} title={!canUpdate ? "ไม่มีสิทธิ์แก้ไขข้อมูลหลัก" : undefined} onClick={() => open(supplier)}>แก้ไข</button>
                    {supplier.active
                      ? <button className={buttonClass} disabled={!canDelete || busyId === supplier.id} title={!canDelete ? "ไม่มีสิทธิ์ปิดใช้งานข้อมูลหลัก" : undefined}
                        onClick={() => { if (window.confirm(`ปิดใช้งานผู้จำหน่าย ${supplier.name} ใช่หรือไม่?`)) void changeActive(supplier); }}>ปิดใช้งาน</button>
                      : <button className={buttonClass} disabled={!canUpdate || busyId === supplier.id} title={!canUpdate ? "ไม่มีสิทธิ์แก้ไขข้อมูลหลัก" : undefined}
                        onClick={() => void changeActive(supplier)}>เปิดใช้งาน</button>}
                  </div>
                </td>
              </tr>)}
        </tbody>
      </table>
    </div>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="supplier-title" className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <h2 id="supplier-title" className="text-lg font-bold">{modal.readOnly ? "ข้อมูลผู้จำหน่าย" : modal.supplier ? "แก้ไขผู้จำหน่าย" : "เพิ่มผู้จำหน่าย"}</h2>
        <form onSubmit={save} className="mt-4 space-y-4">
          {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
          <fieldset disabled={modal.readOnly || !writable || saving} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="รหัสผู้จำหน่าย *"><input required className={inputClass} value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value }))} /></Field>
              <Field label="ชื่อผู้จำหน่าย *"><input required className={inputClass} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="ประเภทผู้ขาย">
                <select className={inputClass} value={form.supplierType} onChange={event => setForm(current => ({ ...current, supplierType: event.target.value as SupplierInput["supplierType"] }))}>
                  <option value="domestic">ในประเทศ</option><option value="overseas">ต่างประเทศ</option><option value="contractor">ผู้รับเหมา</option>
                </select>
              </Field>
              <Field label="Tax ID"><input className={inputClass} value={form.taxId} onChange={event => setForm(current => ({ ...current, taxId: event.target.value }))} /></Field>
              <Field label="สาขา"><input className={inputClass} value={form.branch} onChange={event => setForm(current => ({ ...current, branch: event.target.value }))} /></Field>
              <Field label="กลุ่มผู้จำหน่าย"><input className={inputClass} value={form.groupName} onChange={event => setForm(current => ({ ...current, groupName: event.target.value }))} /></Field>
              <Field label="รหัสกลุ่มผู้จำหน่าย"><input className={inputClass} value={form.groupCode} onChange={event => setForm(current => ({ ...current, groupCode: event.target.value }))} /></Field>
              <Field label="ผู้ติดต่อ"><input className={inputClass} value={form.contactPerson} onChange={event => setForm(current => ({ ...current, contactPerson: event.target.value }))} /></Field>
              <Field label="โทรศัพท์"><input className={inputClass} value={form.tel} onChange={event => setForm(current => ({ ...current, tel: event.target.value }))} /></Field>
              <Field label="แฟกซ์"><input className={inputClass} value={form.fax} onChange={event => setForm(current => ({ ...current, fax: event.target.value }))} /></Field>
              <Field label="อีเมล"><input type="email" className={inputClass} value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></Field>
              <Field label="วงเงินเครดิต"><input type="number" min="0" step="0.01" className={inputClass} value={form.creditLimit ?? ""} onChange={event => setForm(current => ({ ...current, creditLimit: event.target.value === "" ? null : Number(event.target.value) }))} /></Field>
              <Field label="เงื่อนไขชำระเงิน (วัน)"><input type="number" min="0" step="1" className={inputClass} value={form.paymentTerm} onChange={event => setForm(current => ({ ...current, paymentTerm: Number(event.target.value) }))} /></Field>
              <Field label="ภาษีมูลค่าเพิ่ม">
                <select className={inputClass} value={form.vatConfig} onChange={event => setForm(current => ({ ...current, vatConfig: event.target.value }))}>
                  <option value="VAT7%">VAT 7%</option><option value="NO_VAT">ไม่มี VAT</option>
                </select>
              </Field>
            </div>
            <Field label="ที่อยู่"><textarea className={inputClass} rows={2} value={form.address} onChange={event => setForm(current => ({ ...current, address: event.target.value }))} /></Field>
            <Field label="ที่อยู่วางบิล"><textarea className={inputClass} rows={2} value={form.billingAddress} onChange={event => setForm(current => ({ ...current, billingAddress: event.target.value }))} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ธนาคาร"><input className={inputClass} value={form.bankName} onChange={event => setForm(current => ({ ...current, bankName: event.target.value }))} /></Field>
              <Field label="สาขาธนาคาร"><input className={inputClass} value={form.bankBranch} onChange={event => setForm(current => ({ ...current, bankBranch: event.target.value }))} /></Field>
              <Field label="เลขที่บัญชี"><input className={inputClass} value={form.bankAccountNo} onChange={event => setForm(current => ({ ...current, bankAccountNo: event.target.value }))} /></Field>
              <Field label="ชื่อบัญชี"><input className={inputClass} value={form.bankAccountName} onChange={event => setForm(current => ({ ...current, bankAccountName: event.target.value }))} /></Field>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass} onClick={() => setModal(null)}>ปิด</button>
            {!modal.readOnly && <button type="submit" className={`${buttonClass} bg-[#0866ff] text-white`} disabled={!writable || saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>}
          </div>
        </form>
      </div>
    </div>}
  </section>;
}
