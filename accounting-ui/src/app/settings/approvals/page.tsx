"use client";

import { useEffect, useState } from "react";
import { AccountingAccessApi, type AccountingRole, type AccountingUser } from "@/lib/accounting-access";
import { AccountingApprovalApi, approvalDocumentTypes, type ApprovalConfiguration, type ApprovalDocumentType, type ApprovalTarget } from "@/lib/accounting-approval";

const moduleFor = (type: ApprovalDocumentType) => ["invoice", "bi", "rv", "cn"].includes(type) ? "ar" :
  ["is", "sr", "opening"].includes(type) ? "inventory" : "ap";

export default function AccountingApprovalSettings() {
  const [configs, setConfigs] = useState<ApprovalConfiguration[]>([]);
  const [roles, setRoles] = useState<AccountingRole[]>([]), [users, setUsers] = useState<AccountingUser[]>([]);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    void Promise.all([AccountingApprovalApi.configuration(), AccountingAccessApi.roles(), AccountingAccessApi.users()])
      .then(([configuration, roleData, userData]) => {
        setConfigs(configuration.configurations); setReady(configuration.rolloutReady); setRoles(roleData.roles); setUsers(userData);
      }).catch(reason => setError(reason instanceof Error ? reason.message : "โหลดการตั้งค่าไม่สำเร็จ"));
  }, []);
  const change = (type: ApprovalDocumentType, patch: Partial<ApprovalConfiguration>) =>
    setConfigs(current => current.map(config => config.docType === type ? { ...config, ...patch } : config));
  const save = async (config: ApprovalConfiguration) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await AccountingApprovalApi.saveConfiguration(config);
      change(config.docType, saved); setMessage(`บันทึก ${config.docType.toUpperCase()} แล้ว`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return <main className="space-y-4">
    <h1 className="text-2xl font-bold">ลำดับอนุมัติ Accounting</h1>
    <p>เฉพาะ admin · ลำดับบทบาทหรือผู้ใช้ · ผู้สร้างห้ามอนุมัติตัวเอง แม้เป็น admin · การเปลี่ยนแปลงใช้กับการส่งรอบใหม่เท่านั้น</p>
    {!ready && <p role="status" className="rounded bg-amber-50 p-3 text-amber-900">
      ยังไม่เปิด rollout: บันทึกลำดับเตรียมไว้ได้ แต่เปิดใช้งานไม่ได้จนกว่าจะตรวจครบ 11 ประเภทและการจองยอด AR
    </p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-green-800">{message}</p>}
    {!configs.length && !error && <p>กำลังโหลด...</p>}
    {approvalDocumentTypes.map(type => {
      const config = configs.find(row => row.docType === type);
      if (!config) return null;
      const accountingModule = moduleFor(type);
      const eligibleRoles = roles.filter(role => role.permissions.includes(`${accountingModule}.view`) && role.permissions.includes(`${accountingModule}.approve`) &&
        users.some(user => user.active && user.accountingAssignment?.roleId === role.id));
      const eligibleUsers = users.filter(user => user.active && (user.role === "admin" ||
        eligibleRoles.some(role => role.id === user.accountingAssignment?.roleId)));
      const updateStep = (index: number, step: ApprovalTarget) => change(type, { steps: config.steps.map((entry, i) => i === index ? step : entry) });
      const move = (index: number, direction: number) => {
        const steps = [...config.steps]; [steps[index], steps[index + direction]] = [steps[index + direction], steps[index]];
        change(type, { steps });
      };
      return <section key={type} className="rounded border bg-white p-4">
        <h2 className="font-bold">{type.toUpperCase()} · revision {config.revision}</h2>
        <fieldset disabled={busy} className="mt-2 space-y-3">
          <label className="flex gap-2"><input type="checkbox" disabled={!ready} checked={config.enabled}
            onChange={event => change(type, { enabled: event.target.checked })} />เปิดลำดับใหม่</label>
          {config.steps.map((step, index) => <div key={index} className="flex flex-wrap items-center gap-2">
            <span>ขั้น {index + 1}</span>
            <select aria-label={`ประเภทขั้น ${index + 1} ${type}`} className="rounded border p-2" value={step.kind}
              onChange={event => updateStep(index, { kind: event.target.value as ApprovalTarget["kind"], targetId: "" })}>
              <option value="role">บทบาท (หนึ่งคนในบทบาทอนุมัติ)</option><option value="user">ผู้ใช้ที่ระบุ</option>
            </select>
            <select aria-label={`ผู้อนุมัติขั้น ${index + 1} ${type}`} className="rounded border p-2" value={step.targetId}
              onChange={event => updateStep(index, { ...step, targetId: event.target.value })}>
              <option value="">เลือกผู้อนุมัติที่ใช้งานและมีสิทธิ์ {accountingModule}.approve</option>
              {(step.kind === "role" ? eligibleRoles.map(role => ({ id: role.id, name: role.name })) :
                eligibleUsers.map(user => ({ id: user.id, name: `${user.fullName} (${user.username})` })))
                .map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
              {step.targetId && !(step.kind === "role" ? eligibleRoles : eligibleUsers).some(target => target.id === step.targetId) &&
                <option value={step.targetId}>ผู้อนุมัติเดิมไม่มีสิทธิ์/ไม่ใช้งาน ({step.targetId}) — กรุณาเปลี่ยน</option>}
            </select>
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="เลื่อนขึ้น">↑</button>
            <button type="button" disabled={index === config.steps.length - 1} onClick={() => move(index, 1)} aria-label="เลื่อนลง">↓</button>
            <button type="button" onClick={() => change(type, { steps: config.steps.filter((_, i) => i !== index) })}>ลบขั้น</button>
          </div>)}
          <button type="button" disabled={config.steps.length >= 20} className="rounded border px-3 py-2"
            onClick={() => change(type, { steps: [...config.steps, { kind: "role", targetId: "" }] })}>เพิ่มขั้น</button>{" "}
          <button type="button" disabled={config.steps.some(step => !step.targetId) || (config.enabled && !config.steps.length)}
            className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => void save(config)}>บันทึก {type.toUpperCase()}</button>
        </fieldset>
      </section>;
    })}
  </main>;
}
