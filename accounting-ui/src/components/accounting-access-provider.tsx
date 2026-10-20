"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { AccountingAccess, AccountingAccessApi, canOpenAccountingPath } from "@/lib/accounting-access";
import { getStoredUser, getSessionToken, logout } from "@/lib/auth";

const AccessContext = createContext<AccountingAccess | null>(null);

export function useAccountingAccess() {
  return useContext(AccessContext);
}

export function AccountingAccessProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname === "/login" || pathname === "/change-password";
  const [result, setResult] = useState<{ pathname: string; sessionToken: string; access?: AccountingAccess; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (isPublic) return;
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      router.replace("/login");
      return;
    }
    if (getStoredUser()?.mustChangePassword) {
      router.replace("/change-password");
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const access = await AccountingAccessApi.me();
        if (!cancelled) setResult({ pathname, sessionToken, access });
      } catch (error) {
        if (!cancelled) setResult({ pathname, sessionToken, error: error instanceof Error ? error.message : "ตรวจสอบสิทธิ์ไม่สำเร็จ" });
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [isPublic, pathname, router, revision]);

  if (isPublic) return children;
  if (!result || result.pathname !== pathname || result.sessionToken !== getSessionToken()) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#657069]">กำลังตรวจสอบสิทธิ์ Accounting...</div>;
  }
  const access = result.access;
  if (!access || !canOpenAccountingPath(access, pathname)) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f6f2] p-6">
        <section className="w-full max-w-lg rounded-lg border border-[#dfe5de] bg-white p-7">
          <h1 className="text-xl font-bold">สิทธิ์การใช้งาน Accounting</h1>
          <p role="alert" className="mt-3 text-sm text-[#657069]">
            {result.error || (access?.allowed
              ? "คุณไม่มีสิทธิ์เข้าเมนูนี้ กรุณาติดต่อผู้ดูแลระบบ"
              : "บัญชีนี้ยังไม่ได้รับสิทธิ์ Accounting กรุณาให้ admin กำหนดบทบาทให้ก่อน สิทธิ์ระบบเดิมยังใช้งานได้ตามเดิม")}
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            {access?.allowed && <Link className="font-bold text-[#194d34]" href="/dashboard">กลับหน้าภาพรวม</Link>}
            <button onClick={() => { setResult(null); setRevision(value => value + 1); }} className="font-bold text-[#194d34]">ตรวจสอบอีกครั้ง</button>
            <button onClick={async () => { await logout(); router.replace("/login"); }} className="text-red-700">ออกจากระบบ</button>
          </div>
        </section>
      </main>
    );
  }
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}
