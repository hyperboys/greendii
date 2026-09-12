import { ArrowDownRight, ArrowUpRight, CircleAlert, FileClock, Plus, ReceiptText, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";

const stats = [
  { label: "ลูกหนี้คงค้าง", value: "฿0.00", note: "รอเชื่อมข้อมูลใบแจ้งหนี้", icon: WalletCards, tone: "bg-[#e3efe7] text-[#23653e]" },
  { label: "เจ้าหนี้คงค้าง", value: "฿0.00", note: "รอเชื่อมข้อมูลค่าใช้จ่าย", icon: ReceiptText, tone: "bg-[#fff0cf] text-[#9a6514]" },
  { label: "ครบกำหนดใน 7 วัน", value: "0 รายการ", note: "ไม่มีรายการใกล้ครบกำหนด", icon: FileClock, tone: "bg-[#e7edf4] text-[#335e85]" },
  { label: "เกินกำหนด", value: "0 รายการ", note: "ไม่มีรายการเกินกำหนด", icon: CircleAlert, tone: "bg-[#f7e5e2] text-[#9a493e]" },
];

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="dashboard-enter mx-auto max-w-370">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#2f7d4b]">Financial overview</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ภาพรวมบัญชี</h1>
            <p className="mt-2 text-sm text-[#657069]">สถานะเอกสารรับ-จ่าย และงานที่ต้องดำเนินการ</p>
          </div>
          <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#194d34] px-4 text-sm font-bold text-white hover:bg-[#123b28]"><Plus size={17} />สร้างรายการใหม่</button>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-lg border border-[#dfe5de] bg-white p-5">
              <div className="flex items-start justify-between"><p className="text-sm font-bold text-[#566159]">{stat.label}</p><span className={`grid size-9 place-items-center rounded-md ${stat.tone}`}><stat.icon size={18} /></span></div>
              <p className="mt-5 text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 text-xs text-[#7a847d]">{stat.note}</p>
            </article>
          ))}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
          <article className="min-h-87.5 rounded-lg border border-[#dfe5de] bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div><h2 className="font-bold">กระแสเงินสดรายเดือน</h2><p className="mt-1 text-xs text-[#657069]">พื้นที่แสดงข้อมูลรับและจ่ายของปีบัญชี 2569</p></div>
              <div className="flex gap-4 text-[11px]"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#2f7d4b]" />รับ</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#f2bd42]" />จ่าย</span></div>
            </div>
            <div className="mt-8 flex h-58.75 items-end justify-around gap-3 border-b border-l border-[#dfe5de] px-4">
              {[28, 46, 38, 62, 54, 78, 66, 83, 58].map((height, index) => <div key={index} className="flex h-full flex-1 items-end justify-center gap-1"><div className="w-full max-w-4 bg-[#2f7d4b]/80" style={{ height: `${height}%` }} /><div className="w-full max-w-4 bg-[#f2bd42]/80" style={{ height: `${Math.max(18, height - 17)}%` }} /></div>)}
            </div>
            <div className="mt-2 flex justify-between px-4 text-[10px] text-[#7a847d]"><span>ม.ค.</span><span>มี.ค.</span><span>พ.ค.</span><span>ก.ค.</span><span>ก.ย.</span></div>
          </article>

          <article className="rounded-lg border border-[#dfe5de] bg-white p-5 sm:p-6">
            <h2 className="font-bold">งานที่ต้องดำเนินการ</h2>
            <p className="mt-1 text-xs text-[#657069]">จัดลำดับตามวันครบกำหนด</p>
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3 rounded-md border border-[#dfe5de] p-3"><span className="grid size-9 place-items-center rounded-md bg-[#fff0cf] text-[#9a6514]"><ArrowDownRight size={18} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">บันทึกค่าใช้จ่าย</p><p className="text-xs text-[#657069]">ยังไม่มีรายการรอดำเนินการ</p></div><span className="text-sm font-bold">0</span></div>
              <div className="flex items-center gap-3 rounded-md border border-[#dfe5de] p-3"><span className="grid size-9 place-items-center rounded-md bg-[#e3efe7] text-[#23653e]"><ArrowUpRight size={18} /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">จับคู่รับชำระ</p><p className="text-xs text-[#657069]">ยังไม่มีรายการรอดำเนินการ</p></div><span className="text-sm font-bold">0</span></div>
            </div>
            <div className="mt-5 rounded-md bg-[#f4f6f2] p-4 text-xs leading-5 text-[#657069]">Dashboard พร้อมสำหรับเชื่อม API รายการบัญชีในขั้นถัดไป โดยยังไม่สร้างหรือเปลี่ยนแปลงตารางฐานข้อมูล</div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}