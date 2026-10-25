"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AccountingAccessApi, AccountingAction, AccountingPermission, AccountingRole, AccountingUser, PermissionModule,
} from "@/lib/accounting-access";

const ACTION_LABELS: Record<AccountingAction, string> = {
  view: "ดู", create: "สร้าง", update: "แก้ไข", delete: "ลบ",
};

const EMPTY_USER = {
  username: "", password: "", fullName: "", initials: "", email: "",
  phone: "", department: "", position: "", lineUserId: "", roleId: "",
};

const fetchSettings = () => Promise.all([AccountingAccessApi.roles(), AccountingAccessApi.users()]);

export default function AccountingAccessPage() {
  const [roles, setRoles] = useState<AccountingRole[]>([]);
  const [users, setUsers] = useState<AccountingUser[]>([]);
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<AccountingPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [newUser, setNewUser] = useState(EMPTY_USER);

  const applySettings = useCallback(([roleData, userData]: Awaited<ReturnType<typeof fetchSettings>>) => {
    setRoles(roleData.roles);
    setModules(roleData.modules);
    setUsers(userData);
  }, []);

  useEffect(() => {
    fetchSettings().then(applySettings).catch(reason => setError(reason instanceof Error ? reason.message : "โหลดข้อมูลสิทธิ์ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [applySettings]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPermissions([]);
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      applySettings(await fetchSettings());
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกสิทธิ์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = (module: PermissionModule, action: AccountingAction, checked: boolean) => {
    const permission: AccountingPermission = `${module.key}.${action}`;
    setPermissions(current => {
      const next = new Set(current);
      if (checked) {
        next.add(permission);
        next.add(`${module.key}.view`);
      } else if (action === "view") {
        for (const item of module.actions) next.delete(`${module.key}.${item}`);
      } else {
        next.delete(permission);
      }
      return [...next];
    });
  };

  const saveRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const data = { name: name.trim(), permissions };
      if (editingId) await AccountingAccessApi.updateRole(editingId, data);
      else await AccountingAccessApi.createRole(data);
      resetForm();
    }, "บันทึกบทบาท Accounting แล้ว");
  };

  const createUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await AccountingAccessApi.createUser(newUser);
      setNewUser(EMPTY_USER);
    }, "เพิ่มผู้ใช้ Accounting แล้ว");
  };

  const filteredUsers = users.filter(user =>
    `${user.username} ${user.fullName}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="mx-auto max-w-370 space-y-6">
        <div>
          <p className="text-xs font-bold text-[#0866ff]">Accounting Administration</p>
          <h1 className="mt-1 text-2xl font-bold">บทบาท & สิทธิ์ Accounting</h1>
          <p className="mt-2 text-sm text-[#657069]">เฉพาะ admin ระบบเดิมจัดการได้ ผู้ใช้หนึ่งคนมีหนึ่งบทบาท Accounting โดยไม่เปลี่ยนบทบาทหรือสิทธิ์ระบบเดิม</p>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        {loading ? <p>กำลังโหลด...</p> : (
          <>
            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-lg border border-[#dfe5de] bg-white p-5">
                <h2 className="font-bold">บทบาท Accounting</h2>
                {!roles.length && <p className="mt-3 text-sm text-[#657069]">ยังไม่มีบทบาท กรุณาสร้างบทบาทก่อนกำหนดให้ผู้ใช้</p>}
                <ul className="mt-3 divide-y divide-[#dfe5de]">
                  {roles.map(role => (
                    <li key={role.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div><strong>{role.name}</strong><p className="text-xs text-[#657069]">{role._count?.assignments || 0} ผู้ใช้ · {role.permissions.length} สิทธิ์</p></div>
                      <div className="flex gap-3">
                        <button disabled={busy} className="text-[#0866ff]" onClick={() => { setEditingId(role.id); setName(role.name); setPermissions([...role.permissions]); }}>แก้ไข</button>
                        <button disabled={busy || Boolean(role._count?.assignments)} className="text-red-700 disabled:opacity-40" title="ลบได้เมื่อไม่มีผู้ใช้ผูกอยู่" onClick={() => {
                          if (!window.confirm(`ลบบทบาท ${role.name}?`)) return;
                          void run(async () => {
                            await AccountingAccessApi.deleteRole(role.id);
                            if (editingId === role.id) resetForm();
                          }, "ลบบทบาท Accounting แล้ว");
                        }}>ลบ</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <form onSubmit={saveRole} className="rounded-lg border border-[#dfe5de] bg-white p-5">
                <h2 className="font-bold">{editingId ? "แก้ไขบทบาท" : "สร้างบทบาทใหม่"}</h2>
                <label className="mt-4 block text-sm">ชื่อบทบาท
                  <input required maxLength={100} disabled={busy} value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" />
                </label>
                <fieldset disabled={busy} className="mt-4 space-y-4">
                  <legend className="mb-2 text-sm font-bold">สิทธิ์แยกตามหมวดงาน</legend>
                  {modules.map(module => (
                    <div key={module.key}>
                      <p className="text-sm font-bold">{module.label}</p>
                      <div className="mt-2 flex flex-wrap gap-4">
                        {module.actions.map(action => (
                          <label key={action} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={permissions.includes(`${module.key}.${action}`)} onChange={event => togglePermission(module, action, event.target.checked)} />
                            {ACTION_LABELS[action]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
                <p className="mt-4 text-xs text-[#657069]">แสดงเฉพาะการทำงานที่ API รองรับในปัจจุบัน สิทธิ์แก้ไขเจ้าหนี้ใช้กับการเปลี่ยนสถานะเช็ค ส่วนสิทธิ์ดูจะถูกเลือกอัตโนมัติเมื่อให้สิทธิ์อื่นในหมวดเดียวกัน</p>
                <div className="mt-4 flex gap-3">
                  <button disabled={busy || !permissions.length || !name.trim()} className="rounded-md bg-[#0866ff] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">บันทึกบทบาท</button>
                  {editingId && <button disabled={busy} type="button" className="text-sm" onClick={resetForm}>ยกเลิก / สร้างใหม่</button>}
                </div>
              </form>
            </section>
            <section className="rounded-lg border border-[#dfe5de] bg-white p-5">
              <h2 className="font-bold">เพิ่มผู้ใช้ Accounting</h2>
              <p className="mt-1 text-xs text-[#657069]">สร้างบัญชีในตารางผู้ใช้ชุดเดียวกับระบบหลัก และกำหนดบทบาท Accounting ให้ทันที</p>
              <form onSubmit={createUser} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">ชื่อผู้ใช้ *
                  <input required autoComplete="username" value={newUser.username} onChange={event => setNewUser(current => ({ ...current, username: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">ชื่อ-นามสกุล *
                  <input required value={newUser.fullName} onChange={event => setNewUser(current => ({ ...current, fullName: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">รหัสผ่าน * (อย่างน้อย 6 ตัว)
                  <input required minLength={6} type="password" autoComplete="new-password" value={newUser.password} onChange={event => setNewUser(current => ({ ...current, password: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">ชื่อย่อ
                  <input maxLength={3} value={newUser.initials} onChange={event => setNewUser(current => ({ ...current, initials: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">อีเมล
                  <input type="email" value={newUser.email} onChange={event => setNewUser(current => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">เบอร์โทรศัพท์
                  <input value={newUser.phone} onChange={event => setNewUser(current => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">แผนก / ฝ่าย
                  <input value={newUser.department} onChange={event => setNewUser(current => ({ ...current, department: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">ตำแหน่ง
                  <input value={newUser.position} onChange={event => setNewUser(current => ({ ...current, position: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">LINE User ID
                  <input value={newUser.lineUserId} onChange={event => setNewUser(current => ({ ...current, lineUserId: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy} />
                </label>
                <label className="text-sm">บทบาท Accounting *
                  <select required value={newUser.roleId} onChange={event => setNewUser(current => ({ ...current, roleId: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] p-2" disabled={busy || !roles.length}>
                    <option value="">เลือกบทบาท</option>
                    {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <div className="flex items-end">
                  <button disabled={busy || !roles.length} className="rounded-md bg-[#0866ff] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                    {busy ? "กำลังบันทึก..." : "เพิ่มผู้ใช้"}
                  </button>
                </div>
              </form>
              {!roles.length && <p className="mt-2 text-xs text-amber-700">สร้างบทบาท Accounting ก่อน จึงจะเพิ่มผู้ใช้ได้</p>}
            </section>
            <section className="rounded-lg border border-[#dfe5de] bg-white p-5">
              <h2 className="font-bold">กำหนดบทบาทให้ผู้ใช้</h2>
              <p className="mt-1 text-xs text-[#657069]">admin มีสิทธิ์ทั้งหมดเสมอ ผู้ใช้อื่นที่ไม่มีบทบาทจะเข้า Accounting ไม่ได้ การเปลี่ยนสิทธิ์มีผลกับ API ทันที</p>
              <input aria-label="ค้นหาผู้ใช้" placeholder="ค้นหาชื่อ / username" value={query} onChange={event => setQuery(event.target.value)} className="mt-4 w-full max-w-md rounded-md border border-[#ccd5cd] p-2 text-sm" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f4f6f2]"><tr><th className="p-3">ผู้ใช้</th><th className="p-3">บทบาทระบบเดิม (ไม่เปลี่ยน)</th><th className="p-3">สถานะ</th><th className="p-3">บทบาท Accounting</th></tr></thead>
                  <tbody className="divide-y divide-[#dfe5de]">
                    {filteredUsers.map(user => (
                      <tr key={user.id}>
                        <td className="p-3"><strong>{user.username}</strong><p className="text-xs text-[#657069]">{user.fullName}</p></td>
                        <td className="p-3">{user.role}</td>
                        <td className="p-3">{user.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
                        <td className="p-3">
                          {user.role === "admin" ? <span>Accounting Admin (ทั้งหมด)</span> : (
                            <select aria-label={`บทบาท Accounting ของ ${user.username}`} disabled={busy} value={user.accountingAssignment?.roleId || ""} className="w-full rounded-md border border-[#ccd5cd] p-2" onChange={event => {
                              const roleId = event.target.value || null;
                              void run(() => AccountingAccessApi.assignRole(user.id, roleId), `บันทึกบทบาทของ ${user.username} แล้ว`);
                            }}>
                              <option value="">ไม่มีสิทธิ์ Accounting</option>
                              {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
