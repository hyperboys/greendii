"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { canUseAccounting } from "@/lib/accounting-access";
import { useAccountingAccess } from "@/components/accounting-access-provider";

export function UnitOptions() {
  const access = useAccountingAccess();
  const pathname = usePathname();
  const allowed = canUseAccounting(access, "master", "view") ||
    (["ar", "ap", "inventory"] as const).some(module =>
      canUseAccounting(access, module, "create") || canUseAccounting(access, module, "update"));
  const [units, setUnits] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!allowed) { setUnits([]); setError(""); return; }
    let current = true;
    let request = 0;
    async function load() {
      const version = ++request;
      try {
        const rows = await apiFetch<{ id: string; name: string }[]>("/api/accounting-access/lookups/units");
        if (current && version === request) { setUnits(rows); setError(""); }
      } catch (error) {
        if (current && version === request) {
          setUnits([]);
          setError(error instanceof Error ? error.message : "โหลดหน่วยนับไม่สำเร็จ");
        }
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { current = false; window.removeEventListener("focus", load); };
  }, [allowed, pathname, revision]);

  return <>
    <datalist id="accounting-unit-options">
      {allowed && units.map(unit => <option key={unit.id} value={unit.name} />)}
    </datalist>
    {allowed && error && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      โหลดตัวเลือกหน่วยนับไม่สำเร็จ: {error} (ยังพิมพ์หน่วยเองได้){" "}
      <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>ลองใหม่</button>
    </div>}
  </>;
}
