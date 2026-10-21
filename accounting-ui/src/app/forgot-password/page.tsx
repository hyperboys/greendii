"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, KeyRound, LoaderCircle } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await forgotPassword(identifier.trim());
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถส่งรหัสผ่านชั่วคราวได้");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-backdrop grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-md rounded-lg border border-[#dfe5de] bg-white p-7 shadow-[0_18px_55px_rgba(23,63,45,0.12)] sm:p-9">
        <div className="mb-6 grid size-11 place-items-center rounded-md bg-[#e3efe7] text-[#194d34]"><KeyRound size={22} /></div>
        <h1 className="text-2xl font-bold">ลืมรหัสผ่าน</h1>
        <p className="mt-2 text-sm text-[#657069]">กรอก username หรืออีเมลที่ผูกกับบัญชี ระบบจะส่งรหัสผ่านชั่วคราวไปยังอีเมล</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold">
            Username หรืออีเมล
            <input required autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-[#ccd5cd] px-3 outline-none focus:border-[#2f7d4b]" disabled={loading || Boolean(message)} />
          </label>
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{message} เข้าสู่ระบบด้วยรหัสชั่วคราว แล้วเปลี่ยนรหัสผ่านทันที</p>}
          <button disabled={loading || Boolean(message)} className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#194d34] font-bold text-white disabled:opacity-60">
            {loading && <LoaderCircle size={17} className="animate-spin" />}
            {loading ? "กำลังส่ง..." : message ? "ส่งแล้ว" : "ส่งรหัสผ่านชั่วคราว"}
          </button>
        </form>
        <Link href="/login" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#194d34]"><ArrowLeft size={16} />กลับไปเข้าสู่ระบบ</Link>
      </section>
    </main>
  );
}
