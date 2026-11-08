import type { ReactNode } from "react";

export type InformationField = { label: string; value: ReactNode };
export type InformationGroup = { title: string; fields: InformationField[] };
export type InformationColumn = { label: string; align?: "left" | "right" | "center" };

export function AccountingDocumentInformation({ groups, columns, rows, itemsTitle = "รายการ", summary, notes, children }: {
  groups: InformationGroup[];
  columns?: InformationColumn[];
  rows?: { key: string; cells: ReactNode[] }[];
  itemsTitle?: string;
  summary?: InformationField[];
  notes?: ReactNode;
  children?: ReactNode;
}) {
  return <div className={`accounting-document-information grid min-w-0 items-start gap-5 ${summary?.length ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
    <div className="min-w-0 space-y-5">
      <div className="grid items-start gap-5 md:grid-cols-2">
        {groups.map(group => <section key={group.title} className="min-w-0 rounded-xl border border-[#dfe5de] bg-white p-5">
          <h2 className="mb-4 text-base font-bold">{group.title}</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {group.fields.map(field => <div key={field.label} className="min-w-0">
              <dt className="text-xs font-medium text-[#657069]">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-[#17211b]">{field.value ?? "-"}</dd>
            </div>)}
          </dl>
        </section>)}
      </div>
      {columns && rows && <section className="min-w-0 overflow-hidden rounded-xl border border-[#dfe5de] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#dfe5de] px-5 py-4">
          <h2 className="text-base font-bold">{itemsTitle}</h2>
          <span className="shrink-0 rounded-full bg-[#f0f3ef] px-3 py-1 text-xs">{rows.length} รายการ</span>
        </div>
        <p className="px-5 pt-3 text-xs text-[#657069] sm:hidden">เลื่อนตารางซ้าย–ขวาเพื่อดูข้อมูลเพิ่มเติม</p>
        <div role="region" aria-label={itemsTitle} tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f8faf7] text-xs text-[#566159]"><tr>
              {columns.map(column => <th key={column.label} scope="col" className="whitespace-nowrap px-4 py-3" style={{ textAlign: column.align || "left" }}>{column.label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[#edf0ed]">
              {rows.map(row => <tr key={row.key} className="align-top">
                {row.cells.map((cell, index) => <td key={index} className="whitespace-pre-wrap break-words px-4 py-4 tabular-nums" style={{ textAlign: columns[index]?.align || "left" }}>{cell ?? "-"}</td>)}
              </tr>)}
              {!rows.length && <tr><td colSpan={columns.length} className="p-6 text-center text-[#657069]">ไม่มีรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </section>}
      {notes && <section className="rounded-xl border border-[#dfe5de] bg-white p-5">
        <h2 className="mb-2 text-base font-bold">หมายเหตุ</h2>
        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-[#566159]">{notes}</div>
      </section>}
      {children}
    </div>
    {!!summary?.length && <aside aria-label="สรุปยอด" className="min-w-0 rounded-xl border border-[#dfe5de] bg-white p-5 xl:sticky xl:top-5">
      <h2 className="mb-4 text-base font-bold">สรุปยอด</h2>
      <dl className="space-y-3 text-sm">{summary.map((field, index) => <div key={field.label} className={index === summary.length - 1 ? "border-t border-[#dfe5de] pt-4" : "flex justify-between gap-3"}>
        <dt className="text-[#657069]">{field.label}</dt>
        <dd className={index === summary.length - 1 ? "mt-1 break-words text-2xl font-bold tabular-nums text-blue-700" : "text-right tabular-nums"}>{field.value ?? "-"}</dd>
      </div>)}</dl>
    </aside>}
    <style>{`@media print { .accounting-document-information { display: none !important; } }`}</style>
  </div>;
}
