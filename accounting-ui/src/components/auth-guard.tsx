"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, hasSession } from "@/lib/auth";

const subscribe = () => () => undefined;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const sessionExists = hydrated && hasSession();
  const mustChangePassword = hydrated && getStoredUser()?.mustChangePassword;

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionExists) {
      router.replace("/login");
      return;
    }
    if (mustChangePassword) {
      router.replace("/change-password");
    }
  }, [hydrated, mustChangePassword, router, sessionExists]);

  if (!hydrated || !sessionExists || mustChangePassword) {
    return <div className="grid min-h-screen place-items-center text-sm text-[#657069]">กำลังตรวจสอบสิทธิ์...</div>;
  }

  return children;
}