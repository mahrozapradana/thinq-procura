import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export default function TaxReports() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth()+1));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/reports/taxes/summary?year=${year}&month=${month}`);
      setSummary(r.data);
    } catch(e) { toast.error(e.response?.data?.detail || "Gagal load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [year, month]);

  const download = async () => {
    const t = localStorage.getItem("access_token");
    const r = await fetch(`${API_URL}/api/reports/taxes.xlsx?year=${year}&month=${month}`, {
      credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!r.ok) { toast.error("Gagal unduh"); return; }
    const b = await r.blob();
    const url = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = url; a.download = `tax_report_${year}-${String(month).padStart(2,"0")}.xlsx`; a.click(); URL.revokeObjectURL(url);
  };

  const years = Array.from({length: 5}, (_, i) => String(now.getFullYear()-i));
  const totals = summary?.totals || { untaxed: 0, sales_tax: 0, withholding: 0, grand: 0 };

  return (
    <div className="space-y-6" data-testid="tax-reports-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Finance</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Laporan Pajak Bulanan</h1>
          <p className="text-sm text-slate-600 mt-1">Rekap PPN Keluar dan potongan PPh dari seluruh PO. Excel siap dilampirkan saat pelaporan SPT Masa.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="label-tiny">Tahun</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28" data-testid="tax-year"><SelectValue/></SelectTrigger>
              <SelectContent>{years.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="label-tiny">Bulan</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36" data-testid="tax-month"><SelectValue/></SelectTrigger>
              <SelectContent>{MONTHS.map((m,i)=><SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={download} data-testid="tax-download-xlsx"><FileSpreadsheet size={14}/> Download XLSX</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-5" data-testid="tax-card-untaxed">
          <div className="label-tiny">DPP (Untaxed)</div>
          <div className="font-heading text-2xl font-bold mt-2 font-mono">{fmtIDR(totals.untaxed)}</div>
          <div className="text-xs text-slate-500 mt-1">Basis pengenaan pajak</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-5" data-testid="tax-card-sales">
          <div className="label-tiny text-emerald-800">PPN Keluar</div>
          <div className="font-heading text-2xl font-bold mt-2 font-mono text-emerald-700">+{fmtIDR(totals.sales_tax)}</div>
          <div className="text-xs text-emerald-800/70 mt-1">Menambah total pembayaran</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-md p-5" data-testid="tax-card-wh">
          <div className="label-tiny text-amber-800">Potongan PPh</div>
          <div className="font-heading text-2xl font-bold mt-2 font-mono text-amber-700">-{fmtIDR(totals.withholding)}</div>
          <div className="text-xs text-amber-800/70 mt-1">Mengurangi total pembayaran</div>
        </div>
        <div className="bg-slate-900 text-white rounded-md p-5" data-testid="tax-card-grand">
          <div className="label-tiny text-white/70">Grand Total</div>
          <div className="font-heading text-2xl font-bold mt-2 font-mono">{fmtIDR(totals.grand)}</div>
          <div className="text-xs text-white/70 mt-1">{summary?.row_count || 0} PO tercakup</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-3 border-b border-slate-200 label-tiny">Ringkasan per Jenis Pajak</div>
        <table className="data-table">
          <thead><tr><th>Kode</th><th>Nama</th><th>Tipe</th><th>Rate</th><th>Base (DPP)</th><th>Amount</th><th>Jumlah PO</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center py-6 text-slate-400">Memuat…</td></tr>}
            {!loading && (summary?.summary||[]).length===0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">Tidak ada transaksi pajak di periode ini</td></tr>}
            {(summary?.summary||[]).map(s => (
              <tr key={s.code} data-testid={`tax-summary-${s.code}`}>
                <td className="font-mono font-semibold">{s.code}</td>
                <td>{s.name}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${s.tax_type==="withholding"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>{s.tax_type}</span></td>
                <td className="font-mono">{s.rate}%</td>
                <td className="font-mono">{fmtIDR(s.base_total)}</td>
                <td className={`font-mono font-semibold ${s.tax_type==="withholding"?"text-amber-700":"text-emerald-700"}`}>{s.tax_type==="withholding"?"-":"+"}{fmtIDR(s.amount_total)}</td>
                <td className="text-xs">{s.po_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
