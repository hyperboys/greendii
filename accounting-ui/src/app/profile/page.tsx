"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthUser, getStoredUser, updateProfile } from "@/lib/auth";

type ProfileForm = {
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  lineUserId: string;
};

const EMPTY_PROFILE: ProfileForm = {
  firstName: "", lastName: "", firstNameEn: "", lastNameEn: "",
  email: "", phone: "", department: "", position: "", lineUserId: "",
};

function profileForm(user: AuthUser): ProfileForm {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    firstNameEn: user.firstNameEn ?? "",
    lastNameEn: user.lastNameEn ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    department: user.department ?? "",
    position: user.position ?? "",
    lineUserId: user.lineUserId ?? "",
  };
}

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
    if (storedUser) setForm(profileForm(storedUser));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateProfile(form);
      setUser(current => current ? { ...current, ...updated } : updated);
      setForm(profileForm(updated));
      setMessage("บันทึกข้อมูลโปรไฟล์แล้ว");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "บันทึกโปรไฟล์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof ProfileForm, label: string, type = "text") => (
    <label className="block text-sm font-bold text-[#566159]">
      {label}
      <input type={type} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-[#ccd5cd] bg-white p-2 font-normal outline-none focus:border-[#2f7d4b]" disabled={loading} />
    </label>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase text-[#2f7d4b]">My Account</p>
        <h1 className="mt-1 text-2xl font-bold">โปรไฟล์ของฉัน</h1>
        <p className="mt-2 text-sm text-[#657069]">ข้อมูลนี้ใช้ร่วมกับบัญชีผู้ใช้ระบบ GreenDii หลัก</p>
        <form onSubmit={submit} className="mt-6 rounded-lg border border-[#dfe5de] bg-white p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-4 border-b border-[#eef1ed] pb-5">
            <div className="grid size-14 place-items-center rounded-full bg-[#194d34] text-xl font-bold text-white">{user?.initials || user?.fullName?.charAt(0) || "?"}</div>
            <div><p className="font-bold">{user?.fullName || "ผู้ใช้"}</p><p className="text-sm text-[#657069]">{user?.username}</p></div>
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#7a847d]">ชื่อภาษาไทย</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-[#566159]">Username
              <input value={user?.username ?? ""} readOnly className="mt-1 w-full rounded-md border border-[#dfe5de] bg-[#f4f6f2] p-2 font-normal text-[#657069]" />
            </label>
            {field("firstName", "ชื่อ")}
            {field("lastName", "นามสกุล")}
          </div>
          <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-wide text-[#7a847d]">English Name</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("firstNameEn", "First Name")}
            {field("lastNameEn", "Last Name")}
          </div>
          <p className="mb-3 mt-5 text-xs font-bold uppercase tracking-wide text-[#7a847d]">ข้อมูลติดต่อ</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("email", "อีเมล", "email")}
            {field("phone", "เบอร์โทรศัพท์")}
            {field("department", "แผนก / ฝ่าย")}
            {field("position", "ตำแหน่ง")}
            {field("lineUserId", "LINE User ID")}
          </div>
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}
          <div className="mt-5 flex justify-end">
            <button disabled={loading || !user} className="rounded-md bg-[#194d34] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {loading ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
