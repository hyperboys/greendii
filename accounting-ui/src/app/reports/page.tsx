"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ReportsApi } from "@/lib/api";
import { FileChartColumn, FileSpreadsheet, RefreshCw } from "lucide-react";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"arAging" | "apAging" | "reconDelivery" | "reconPo">("arAging");
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>({ rows: [] });

  const loadReport = async () => {
    setLoading(true);
    try {
      if (activeTab === "arAging") {
        const res = await ReportsApi.getArAging();
        setReportData(res);
      } else if (activeTab === "apAging") {
        const res = await ReportsApi.getApAging();
        setReportData(res);
      } else if (activeTab === "reconDelivery") {
        const res = await ReportsApi.getReconDeliveryToInvoice();
        setReportData(res);
      } else if (activeTab === "reconPo") {
        const res = await ReportsApi.getReconPoToGoodsReceipt();
        setReportData(res);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeTab]);

  return (
    <AppShell>
      <div className="mx-auto max-w-370">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#2f7d4b]">Financial & Reconciliation Reports</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">รายงานการเงิน & การกระทบยอด</h1>
            <p className="mt-1 text-sm text-[#657069]">รายงานวิเคราะห์อายุหนี้ (AR/AP Aging) และการตรวจสอบความสอดคล้องของเอกสาร</p>
          </div>
          <button
            onClick={loadReport}
            className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#dfe5de] bg-white px-4 text-sm font-bold text-[#566159] hover:bg-[#f4f6f2]"
          >
            <RefreshCw size={16} />รีเฟรชรายงาน
          </button>
        </div>

        {/* Sub Tabs */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-[#dfe5de] pb-3">
          {[
            { id: "arAging", label: "วิเคราะห์อายุลูกหนี้ (AR Aging)" },
            { id: "apAging", label: "วิเคราะห์อายุเจ้าหนี้ (AP Aging)" },
            { id: "reconDelivery", label: "กระทบยอด: ส่งของ -> ออกใบแจ้งหนี้" },
            { id: "reconPo", label: "กระทบยอด: ใบสั่งซื้อ -> รับสินค้า" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-[#194d34] text-white"
                  : "bg-white text-[#566159] hover:bg-[#e8ece7]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Report Content Table */}
        <div className="overflow-hidden rounded-lg border border-[#dfe5de] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[#657069]">กำลังคำนวณและประมวลผลรายงาน...</div>
          ) : !reportData.rows || reportData.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#657069]">ไม่มีข้อมูลในรายงานตามเงื่อนไขที่เลือก</div>
          ) : activeTab === "arAging" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่ IV</th>
                    <th className="p-3.5">ชื่อลูกค้า</th>
                    <th className="p-3.5">วันครบกำหนด</th>
                    <th className="p-3.5 text-right">ยอดคงค้าง</th>
                    <th className="p-3.5 text-right text-[#23653e]">ยังไม่ครบกำหนด</th>
                    <th className="p-3.5 text-right text-[#9a6514]">1 - 30 วัน</th>
                    <th className="p-3.5 text-right text-[#9a493e]">31 - 60 วัน</th>
                    <th className="p-3.5 text-right text-[#9a493e]">&gt; 60 วัน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {reportData.rows.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{r.ivNo}</td>
                      <td className="p-3.5 font-medium">{r.customerName}</td>
                      <td className="p-3.5 text-[#657069]">{r.dueDate ? new Date(r.dueDate).toLocaleDateString("th-TH") : "-"}</td>
                      <td className="p-3.5 text-right font-bold">฿{Number(r.outstandingAmount).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#23653e]">฿{Number(r.current).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#9a6514]">฿{Number(r.days1To30).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#9a493e]">฿{Number(r.days31To60).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-bold text-red-600">฿{Number(r.days61To90 + r.over90Days).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === "apAging" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่ PO</th>
                    <th className="p-3.5">ผู้จำหน่าย</th>
                    <th className="p-3.5">วันที่ PO</th>
                    <th className="p-3.5 text-right">ยอดสุทธิ</th>
                    <th className="p-3.5 text-right text-[#23653e]">ยังไม่ครบกำหนด</th>
                    <th className="p-3.5 text-right text-[#9a6514]">1 - 30 วัน</th>
                    <th className="p-3.5 text-right text-[#9a493e]">31 - 60 วัน</th>
                    <th className="p-3.5 text-right text-[#9a493e]">&gt; 60 วัน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {reportData.rows.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{r.poNo}</td>
                      <td className="p-3.5 font-medium">{r.supplierName}</td>
                      <td className="p-3.5 text-[#657069]">{r.poDate ? new Date(r.poDate).toLocaleDateString("th-TH") : "-"}</td>
                      <td className="p-3.5 text-right font-bold">฿{Number(r.netAmount).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#23653e]">฿{Number(r.current).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#9a6514]">฿{Number(r.days1To30).toLocaleString()}</td>
                      <td className="p-3.5 text-right text-[#9a493e]">฿{Number(r.days31To60).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-bold text-red-600">฿{Number(r.days61To90 + r.over90Days).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#dfe5de] bg-[#f8faf7] font-bold text-[#566159]">
                  <tr>
                    <th className="p-3.5">เลขที่เอกสารต้นทาง</th>
                    <th className="p-3.5">วันที่เอกสาร</th>
                    <th className="p-3.5">คู่ค้า</th>
                    <th className="p-3.5">เอกสารเชื่อมโยงปลายทาง</th>
                    <th className="p-3.5">สถานะการกระทบยอด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe5de]">
                  {reportData.rows.map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-[#f9faf8]">
                      <td className="p-3.5 font-bold text-[#173f2d]">{r.soNo || r.poNo}</td>
                      <td className="p-3.5 text-[#657069]">{r.docDate || r.poDate ? new Date(r.docDate || r.poDate).toLocaleDateString("th-TH") : "-"}</td>
                      <td className="p-3.5 font-medium">{r.customerName || r.supplierName}</td>
                      <td className="p-3.5 text-[#566159]">
                        {r.linkedInvoices?.join(", ") || r.goodsReceipts?.join(", ") || "ยังไม่มีเอกสารปลายทาง"}
                      </td>
                      <td className="p-3.5">
                        {r.isInvoiced || r.hasReceipt ? (
                          <span className="inline-block rounded-md bg-[#e3efe7] px-2 py-0.5 text-[11px] font-bold text-[#23653e]">กระทบยอดแล้ว</span>
                        ) : (
                          <span className="inline-block rounded-md bg-[#fff0cf] px-2 py-0.5 text-[11px] font-bold text-[#9a6514]">รอดำเนินการ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
