"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BadgeDollarSign,
  Banknote,
  BookOpenText,
  ChevronDown,
  FileChartColumn,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  UserRound,
  Settings,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { getStoredUser, logout } from "@/lib/auth";
import { useAccountingAccess } from "@/components/accounting-access-provider";
import { canOpenAccountingPath } from "@/lib/accounting-access";
import {
  invoiceTabs, payableTabs, inventoryTabs, masterTabs, reportTabs,
  selectedTab, isPublicAccountingPath,
} from "@/lib/accounting-navigation";

const navigation = [
  { href: "/dashboard", label: "ภาพรวมบัญชี", icon: LayoutDashboard },
  { href: "/ar", label: "ลูกหนี้ / รับชำระเงิน", icon: FileText, children: [
    ...invoiceTabs.map(tab => ({ ...tab, href: `/ar/invoices?tab=${tab.id}` })),
    { id: "creditNotes", label: "ใบลดหนี้", href: "/ar/credit-notes" },
    { id: "receipts", label: "รับชำระเงิน", href: "/ar/receipts" },
  ] },
  { href: "/ap/vouchers", label: "เจ้าหนี้ / ค่าใช้จ่าย", icon: ReceiptText, tabs: payableTabs },
  { href: "/inventory", label: "คลังสินค้า / สต็อก", icon: Banknote, tabs: inventoryTabs },
  { href: "/master", label: "ข้อมูลหลัก & ผังบัญชี", icon: BookOpenText, tabs: masterTabs },
  { href: "/reports", label: "รายงานการเงิน", icon: FileChartColumn, tabs: reportTabs },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const user = getStoredUser();
  const access = useAccountingAccess();

  useEffect(() => {
    const activeGroup = navigation.find(item => (item.children || item.tabs) &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)))?.href;
    setExpanded(Object.fromEntries(
      navigation.filter(item => item.children || item.tabs).map(item => [item.href, item.href === activeGroup]),
    ));
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (desktop.matches) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.querySelector<HTMLButtonElement>('button[aria-label="ปิดเมนู"]')?.focus();
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", handleKeyDown);
      if (!desktop.matches) menuButton?.focus();
    };
  }, [open]);

  if (isPublicAccountingPath(pathname)) return children;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <AuthGuard>
      <div className={`accounting-shell min-h-screen bg-[#f4f6f2] lg:grid ${collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[252px_minmax(0,1fr)]"}`}>
        {open && (
          <button aria-label="ปิดเมนู" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setOpen(false)} />
        )}
        <aside ref={sidebarRef} id="accounting-sidebar" aria-label="แถบเมนูบัญชี" className={`fixed inset-y-0 left-0 z-40 flex w-63 max-w-[calc(100vw-2rem)] flex-col border-r border-white/10 bg-[#0866ff] text-white transition-transform motion-reduce:transition-none lg:visible lg:sticky lg:top-0 lg:h-[100dvh] ${collapsed ? "lg:w-[72px]" : ""} ${open ? "visible translate-x-0" : "invisible -translate-x-full lg:translate-x-0"}`}>
          <div className={`flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-5 ${collapsed ? "lg:px-4" : ""}`}>
            <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setOpen(false)}>
              <span className="grid size-10 place-items-center rounded-md bg-white">
                <Image src="/logo.jpg" width={34} height={24} alt="GreenDii" className="h-auto w-8" />
              </span>
              <span className={collapsed ? "lg:hidden" : undefined}>
                <span className="block text-[15px] font-bold">GREENDII</span>
                <span className="block text-[11px]">ACCOUNTING</span>
              </span>
            </Link>
            <button className="grid size-11 place-items-center rounded-md hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          <nav aria-label="เมนูบัญชี" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-5">
            <p className={`px-3 pb-2 text-xs font-bold uppercase ${collapsed ? "lg:sr-only" : ""}`}>งานบัญชี</p>
            {navigation.filter(item => access && canOpenAccountingPath(access, item.href)).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const items = item.children ?? item.tabs?.map(tab => ({ ...tab, href: `${item.href}?tab=${tab.id}` }));
              const currentTab = item.tabs ? selectedTab(item.tabs, item.href === "/master" && pathname.startsWith("/master/")
                ? pathname.split("/")[2] : searchParams.get("tab") ?? undefined)
                : selectedTab(invoiceTabs, searchParams.get("tab") ?? undefined);
              const isExpanded = expanded[item.href] ?? active;
              const navClass = `flex min-h-11 w-full items-center gap-3 rounded-r-xl border-l-[3px] px-3 py-2 text-left text-[15px] transition-colors ${active ? "border-white bg-[#054cbd] font-bold shadow-sm" : "border-transparent hover:bg-[#054cbd]"}`;
              if (items) return (
                <div key={item.href}>
                  <button type="button" aria-label={item.label} title={collapsed ? item.label : undefined} aria-expanded={!collapsed && isExpanded} aria-controls={`nav-${item.href.replaceAll("/", "-")}`}
                    onClick={() => {
                      setCollapsed(false);
                      setExpanded(Object.fromEntries(
                        navigation.filter(group => group.children || group.tabs)
                          .map(group => [group.href, group.href === item.href && (collapsed || !isExpanded)]),
                      ));
                    }} className={navClass}>
                    <item.icon size={18} strokeWidth={1.8} className="shrink-0" />
                    <span className={`flex-1 ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                    <ChevronDown size={16} className={`shrink-0 transition-transform motion-reduce:transition-none ${collapsed ? "lg:hidden" : ""} ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  <div id={`nav-${item.href.replaceAll("/", "-")}`} aria-hidden={!isExpanded}
                    style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr", opacity: isExpanded ? 1 : 0, visibility: isExpanded ? "visible" : "hidden" }}
                    className={`ml-5 mt-1 grid overflow-hidden transition-[grid-template-rows,opacity,visibility] duration-300 motion-reduce:transition-none ${collapsed ? "lg:hidden" : ""}`}>
                    <div className="min-h-0 overflow-hidden border-l border-white/20 pl-3">
                    {items.filter(child => access && canOpenAccountingPath(access, child.href.split("?")[0])).map(child => {
                      const childPath = child.href.split("?")[0];
                      const recordTab = pathname.startsWith("/master/") ? pathname.split("/")[2]
                        : pathname.startsWith("/inventory/issues/") ? "issues"
                        : pathname.startsWith("/inventory/returns/") ? "returns"
                        : pathname === "/ar/delivery-orders" || pathname.startsWith("/ar/delivery-orders/") ? "so"
                        : pathname === "/ar/billing-notes" || pathname.startsWith("/ar/billing-notes/") ? "billingNotes"
                        : pathname === "/ar/credit-notes" || pathname.startsWith("/ar/credit-notes/") ? "creditNotes"
                        : pathname.startsWith("/ar/invoices/") ? "invoices"
                        : pathname.startsWith("/ap/vouchers/ps/") ? "ps"
                        : pathname.startsWith("/ap/vouchers/pv/") ? "pv"
                        : pathname.startsWith("/ap/vouchers/cq/") ? "cq"
                        : pathname.startsWith("/ap/vouchers/gr/") ? "gr"
                        : pathname.startsWith("/ap/vouchers/") ? "po" : null;
                      const childActive = active && (recordTab ? child.id === recordTab
                        : child.id === "receipts" ? pathname === childPath || pathname.startsWith(`${childPath}/`)
                        : pathname === childPath && child.id === currentTab);
                      return (
                        <Link key={child.id} href={child.href} aria-current={childActive ? "page" : undefined}
                          onClick={() => {
                            setOpen(false);
                            setExpanded(Object.fromEntries(navigation.filter(group => group.children || group.tabs)
                              .map(group => [group.href, group.href === item.href])));
                          }}
                          className={`block rounded-md px-3 py-2 text-sm transition-colors ${childActive ? "bg-white/20 font-bold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                          {child.label}
                        </Link>
                      );
                    })}
                    </div>
                  </div>
                </div>
              );
              return (
                <Link key={item.label} href={item.href} aria-label={item.label} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={navClass}>
                  <item.icon size={18} strokeWidth={1.8} className="shrink-0" />
                  <span className={collapsed ? "lg:hidden" : undefined}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0 border-t border-white/10 p-3">
            <Link href="/profile" aria-label="โปรไฟล์ของฉัน" title={collapsed ? "โปรไฟล์ของฉัน" : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 w-full items-center gap-3 rounded-r-xl border-l-[3px] px-3 py-2 text-[15px] ${pathname.startsWith("/profile") ? "border-white bg-[#054cbd] shadow-sm" : "border-transparent hover:bg-[#054cbd]"}`}>
              <UserRound size={18} className="shrink-0" /><span className={collapsed ? "lg:hidden" : undefined}>โปรไฟล์ของฉัน</span>
            </Link>
            <Link href="/change-password" aria-label="เปลี่ยนรหัสผ่าน" title={collapsed ? "เปลี่ยนรหัสผ่าน" : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 w-full items-center gap-3 rounded-r-xl border-l-[3px] px-3 py-2 text-[15px] ${pathname.startsWith("/change-password") ? "border-white bg-[#054cbd] shadow-sm" : "border-transparent hover:bg-[#054cbd]"}`}>
              <KeyRound size={18} className="shrink-0" /><span className={collapsed ? "lg:hidden" : undefined}>เปลี่ยนรหัสผ่าน</span>
            </Link>
            {access?.isAdmin && (
              <Link href="/settings/access" aria-label="บทบาท & สิทธิ์ Accounting" title={collapsed ? "บทบาท & สิทธิ์ Accounting" : undefined} onClick={() => setOpen(false)} className={`flex min-h-11 w-full items-center gap-3 rounded-r-xl border-l-[3px] px-3 py-2 text-[15px] ${pathname.startsWith("/settings/access") ? "border-white bg-[#054cbd] shadow-sm" : "border-transparent hover:bg-[#054cbd]"}`}>
                <Settings size={18} className="shrink-0" /><span className={collapsed ? "lg:hidden" : undefined}>บทบาท & สิทธิ์ Accounting</span>
              </Link>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dfe5de] bg-white/95 px-4 backdrop-blur sm:px-6">
            <button ref={menuButtonRef} className="grid size-11 place-items-center rounded-md border border-[#dfe5de] lg:hidden" onClick={() => { setCollapsed(false); setOpen(true); }} aria-label="เปิดเมนู" aria-controls="accounting-sidebar" aria-expanded={open}><Menu size={20} /></button>
            <button type="button" className="mr-3 hidden size-10 shrink-0 place-items-center rounded-md border border-[#dfe5de] text-[#657069] hover:bg-[#f4f6f2] lg:grid"
              onClick={() => setCollapsed(value => !value)} aria-controls="accounting-sidebar" aria-expanded={!collapsed}
              aria-label={collapsed ? "ขยายเมนูด้านซ้าย" : "ย่อเมนูด้านซ้าย"} title={collapsed ? "ขยายเมนูด้านซ้าย" : "ย่อเมนูด้านซ้าย"}>
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <div className="hidden items-center gap-2 text-xs text-[#657069] lg:flex">
              <BadgeDollarSign size={17} className="text-[#0866ff]" />
              รอบบัญชีปัจจุบัน: กันยายน 2569
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-bold text-[#17211b]">{user?.fullName || user?.username || "ผู้ใช้งาน"}</div>
                <div className="text-[10px] text-[#657069]">{access?.isAdmin ? "Accounting Admin" : access?.role?.name}</div>
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