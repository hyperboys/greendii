"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { changePassword } from "@/lib/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPassword !== confirm) return setError("รหัสผ่านใหม่ไม่ตรงกัน");
    setLoading(true);
    setError("");
    try {
      await changePassword(oldPassword, newPassword);
      router.replace("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-backdrop grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-md rounded-lg border border-[#dfe5de] bg-white p-7 shadow-[0_18px_55px_rgba(23,63,45,0.12)] sm:p-9">
        <div className="mb-6 grid size-11 place-items-center rounded-md bg-[#e3efe7] text-[#194d34]"><KeyRound size={22} /></div>
        <h1 className="text-2xl font-bold">ตั้งรหัสผ่านใหม่</h1>
        <p className="mt-2 text-sm text-[#657069]">บัญชีนี้ต้องเปลี่ยนรหัสผ่านก่อนเข้าใช้งาน</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold">รหัสผ่านปัจจุบัน<input type="password" required value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#ccd5cd] px-3 outline-none focus:border-[#2f7d4b]" /></label>
          <label className="block text-sm font-bold">รหัสผ่านใหม่<input type="password" required minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#ccd5cd] px-3 outline-none focus:border-[#2f7d4b]" /></label>
          <label className="block text-sm font-bold">ยืนยันรหัสผ่านใหม่<input type="password" required minLength={6} value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#ccd5cd] px-3 outline-none focus:border-[#2f7d4b]" /></label>
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#194d34] font-bold text-white disabled:opacity-60">{loading && <LoaderCircle size={17} className="animate-spin" />}บันทึกรหัสผ่าน</button>
        </form>
      </section>
    </main>
  );
}