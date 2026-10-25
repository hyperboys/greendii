"use client";

import { newSupplierBranch, type SupplierBranch } from "@/lib/account-suppliers";
const input = "mt-1 w-full min-w-0 rounded border bg-white p-2 text-sm";
const button = "rounded border px-3 py-2 text-sm disabled:opacity-40";
export function SupplierBranches({ branches, onChange }: { branches: SupplierBranch[]; onChange: (branches: SupplierBranch[]) => void }) {
  const patch = (index: number, update: Partial<SupplierBranch>) => onChange(branches.map((branch, i) => i === index ? { ...branch, ...update } : branch));
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">สาขา / ที่อยู่ / ธนาคาร</h3>
      <button type="button" className={button} onClick={() => onChange([...branches, newSupplierBranch()])}>เพิ่มสาขา</button></div>
    {branches.map((branch, index) => <div className="min-w-0 space-y-3 rounded border p-3" key={index}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm"><input type="radio" name="supplier-default-branch" checked={branch.isDefault}
          onChange={() => onChange(branches.map((item, i) => ({ ...item, isDefault: i === index })))} /> สาขาเริ่มต้น</label>
        <button type="button" className={button} disabled={branches.length === 1} onClick={() => {
          const next = branches.filter((_, i) => i !== index);
          onChange(branch.isDefault ? next.map((item, i) => ({ ...item, isDefault: i === 0 })) : next);
        }}>ลบสาขา</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["code", "name", "contactPerson", "tel", "fax", "email"] as const).map((key, i) => <label className="text-sm" key={key}>
          {["รหัสสาขา *", "ชื่อสาขา *", "ผู้ติดต่อสาขา", "โทรศัพท์สาขา", "แฟกซ์สาขา", "อีเมลสาขา"][i]}
          <input className={input} required={key === "code" || key === "name"} type={key === "email" ? "email" : "text"} multiple={key === "email"}
            value={branch[key] ?? ""} onChange={event => patch(index, { [key]: event.target.value })} /></label>)}
        {(["address", "billingAddress"] as const).map((key, i) => <label className="text-sm" key={key}>{["ที่อยู่ติดต่อ", "ที่อยู่วางบิล"][i]}
          <textarea className={input} value={branch[key] ?? ""} onChange={event => patch(index, { [key]: event.target.value })} /></label>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold">บัญชีธนาคารสาขานี้</h4>
        <button type="button" className={button} onClick={() => patch(index, { banks: [...branch.banks,
          { bankName: "", bankBranch: "", bankAccountNo: "", bankAccountName: "", isDefault: !branch.banks.length }] })}>เพิ่มบัญชีธนาคาร</button></div>
      {!branch.banks.length && <p className="text-sm">ยังไม่มีบัญชีธนาคาร (ไม่บังคับ)</p>}
      {branch.banks.map((bank, bankIndex) => <div className="space-y-2 rounded border p-3" key={bankIndex}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["bankName", "bankBranch", "bankAccountNo", "bankAccountName"] as const).map((key, i) => <label className="text-sm" key={key}>
            {["ธนาคาร *", "สาขาธนาคาร", "เลขที่บัญชี *", "ชื่อบัญชี *"][i]}
            <input className={input} required={key !== "bankBranch"} value={bank[key] ?? ""}
              onChange={e => patch(index, { banks: branch.banks.map((item, i) => i === bankIndex ? { ...item, [key]: e.target.value } : item) })} /></label>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm"><input type="radio" name={`supplier-default-bank-${index}`} checked={bank.isDefault}
            onChange={() => patch(index, { banks: branch.banks.map((item, i) => ({ ...item, isDefault: i === bankIndex })) })} /> บัญชีเริ่มต้น</label>
          <button type="button" className={button} onClick={() => {
            const next = branch.banks.filter((_, i) => i !== bankIndex);
            patch(index, { banks: bank.isDefault ? next.map((item, i) => ({ ...item, isDefault: i === 0 })) : next });
          }}>ลบบัญชี</button>
        </div>
      </div>)}
    </div>)}
  </section>;
}
