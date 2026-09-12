"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Landmark, LoaderCircle } from "lucide-react";
import { hasSession, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasSession()) router.replace("/dashboard");
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      router.replace(user.mustChangePassword ? "/change-password" : "/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-backdrop grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.72fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#173f2d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -bottom-32 -right-32 size-[520px] rounded-full border-[80px] border-[#b8d538]/15" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-white"><Image src="/logo.jpg" alt="GreenDii" width={36} height={26} /></div>
          <div><div className="text-lg font-extrabold">GREENDII</div><div className="text-[11px] text-[#b9d9c5]">BUSINESS OPERATIONS</div></div>
        </div>
        <div className="relative max-w-xl">
          <Landmark size={38} className="mb-7 text-[#b8d538]" strokeWidth={1.5} />
          <h1 className="text-5xl font-bold leading-[1.12]">Accounting,<br />made accountable.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#c8dbcf]">พื้นที่ทำงานสำหรับทีมบัญชี เชื่อมข้อมูลการขาย เอกสาร และฐานข้อมูลชุดเดียวกับระบบ GreenDii</p>
        </div>
        <p className="relative text-xs text-[#8db29a]">GreenDii Co., Ltd. · Internal system</p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
        <div className="login-panel w-full max-w-[420px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <Image src="/logo.jpg" alt="GreenDii" width={54} height={36} className="rounded" />
            <div className="font-extrabold text-[#173f2d]">GREENDII ACCOUNTING</div>
          </div>
          <p className="mb-2 text-xs font-bold uppercase text-[#2f7d4b]">Accounting portal</p>
          <h2 className="text-3xl font-bold text-[#17211b]">เข้าสู่ระบบ</h2>
          <p className="mt-2 text-sm text-[#657069]">ใช้บัญชีผู้ใช้เดียวกับระบบ GreenDii เดิม</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block text-sm font-bold text-[#38433c]">
              ชื่อผู้ใช้
              <input className="mt-2 h-12 w-full rounded-md border border-[#ccd5cd] bg-white px-4 font-normal outline-none transition focus:border-[#2f7d4b] focus:ring-4 focus:ring-[#2f7d4b]/10" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required disabled={loading} placeholder="username" />
            </label>
            <label className="block text-sm font-bold text-[#38433c]">
              รหัสผ่าน
              <span className="relative mt-2 block">
                <input type={visible ? "text" : "password"} className="h-12 w-full rounded-md border border-[#ccd5cd] bg-white px-4 pr-12 font-normal outline-none transition focus:border-[#2f7d4b] focus:ring-4 focus:ring-[#2f7d4b]/10" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={loading} placeholder="••••••••" />
                <button type="button" className="absolute inset-y-0 right-0 grid w-12 place-items-center text-[#657069]" onClick={() => setVisible((value) => !value)} aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </span>
            </label>
            {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#194d34] px-5 text-sm font-bold text-white transition hover:bg-[#123b28] disabled:cursor-not-allowed disabled:opacity-60" disabled={loading}>{loading && <LoaderCircle size={17} className="animate-spin" />}{loading ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}</button>
          </form>
          <p className="mt-8 border-t border-[#dfe5de] pt-5 text-xs leading-5 text-[#657069]">หากไม่สามารถเข้าสู่ระบบได้ กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์งานบัญชี</p>
        </div>
      </section>
    </main>
  );
}