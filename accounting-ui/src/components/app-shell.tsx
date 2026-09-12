"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BadgeDollarSign,
  BanknoteArrowDown,
  BookOpenText,
  FileChartColumn,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  WalletCards,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { getStoredUser, logout } from "@/lib/auth";

const navigation = [
  { href: "/dashboard", label: "ภาพรวมบัญชี", icon: LayoutDashboard },
  { href: "#", label: "ลูกหนี้ / ใบแจ้งหนี้", icon: FileText },
  { href: "#", label: "รับชำระเงิน", icon: WalletCards },
  { href: "#", label: "เจ้าหนี้ / ค่าใช้จ่าย", icon: ReceiptText },
  { href: "#", label: "รายการธนาคาร", icon: BanknoteArrowDown },
  { href: "#", label: "สมุดรายวัน", icon: BookOpenText },
  { href: "#", label: "รายงานการเงิน", icon: FileChartColumn },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const user = getStoredUser();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f4f6f2] lg:grid lg:grid-cols-[252px_1fr]">
        {open && (
          <button aria-label="ปิดเมนู" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setOpen(false)} />
        )}
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-63 flex-col border-r border-white/10 bg-[#173f2d] text-white transition-transform lg:sticky lg:top-0 lg:h-screen ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
            <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setOpen(false)}>
              <span className="grid size-10 place-items-center rounded-md bg-white">
                <Image src="/logo.jpg" width={34} height={24} alt="GreenDii" className="h-auto w-8" />
              </span>
              <span>
                <span className="block text-[15px] font-bold">GREENDII</span>
                <span className="block text-[11px] text-[#b9d9c5]">ACCOUNTING</span>
              </span>
            </Link>
            <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase text-[#8db29a]">งานบัญชี</p>
            {navigation.map((item) => {
              const active = item.href !== "#" && pathname.startsWith(item.href);
              return (
                <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={`flex h-11 items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${active ? "bg-[#b8d538] font-bold text-[#173f2d]" : "text-[#d8e6dc] hover:bg-white/10 hover:text-white"}`}>
                  <item.icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/10 p-3">
            <button className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-[13px] text-[#d8e6dc] hover:bg-white/10" title="ตั้งค่า">
              <Settings size={18} /><span>ตั้งค่าบัญชี</span>
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dfe5de] bg-white/95 px-4 backdrop-blur sm:px-6">
            <button className="grid size-10 place-items-center rounded-md border border-[#dfe5de] lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู"><Menu size={20} /></button>
            <div className="hidden items-center gap-2 text-xs text-[#657069] lg:flex">
              <BadgeDollarSign size={17} className="text-[#2f7d4b]" />
              รอบบัญชีปัจจุบัน: กันยายน 2569
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-bold text-[#17211b]">{user?.fullName || user?.username || "ผู้ใช้งาน"}</div>
                <div className="text-[10px] uppercase text-[#657069]">{user?.role || "accounting"}</div>
              </div>
              <button onClick={handleLogout} className="grid size-9 place-items-center rounded-md border border-[#dfe5de] text-[#657069] hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="ออกจากระบบ" aria-label="ออกจากระบบ"><LogOut size={17} /></button>
            </div>
          </header>
          <main className="p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}