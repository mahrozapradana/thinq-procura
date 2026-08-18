import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { ArrowUpRight, Wallet, ClipboardList, FileText, Gavel, Users, TrendingDown, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

function Kpi({ label, value, hint, icon:Icon, testid }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-5" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div className="label-tiny">{label}</div>
        {Icon && <Icon size={16} className="text-slate-400"/>}
      </div>
      <div className="font-heading text-3xl font-bold text-slate-900 mt-3">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [forecast, setForecast] = useState([]);
  useEffect(() => {
    api.get("/dashboard/stats").then(r => setS(r.data));
    api.get("/dashboard/budget-forecast").then(r => setForecast(r.data));
  }, []);
  if (!s) return <div className="text-sm text-slate-500">Memuat dashboard...</div>;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <div className="label-tiny">Command Center</div>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">Ringkasan Procurement</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi testid="kpi-pr-pending" label="PR Menunggu Approval" value={s.pr_pending} icon={ClipboardList} hint={`${s.pr_approved} sudah approved`}/>
        <Kpi testid="kpi-po-pending" label="PO Menunggu Approval" value={s.po_pending} icon={FileText} hint={`${s.po_total} total PO`}/>
        <Kpi testid="kpi-tender-open" label="Tender Terbuka" value={s.tender_open} icon={Gavel}/>
        <Kpi testid="kpi-vendor-pending" label="Vendor Menunggu Review" value={s.vendor_pending} icon={Users}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-6" data-testid="budget-summary">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-tiny">Budget Utilization</div>
              <div className="font-heading text-xl font-bold mt-1">Total Budget: {fmtIDR(s.budget_total)}</div>
            </div>
            <Link to="/budgets" className="text-xs text-blue-600 flex items-center gap-1">Detail <ArrowUpRight size={12}/></Link>
          </div>
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <div>Terpakai <span className="font-mono font-semibold">{fmtIDR(s.budget_used)}</span></div>
              <div className="text-slate-500">Sisa <span className="font-mono">{fmtIDR(s.budget_available)}</span></div>
            </div>
            <div className="mt-2 h-3 bg-slate-100 rounded-sm overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${s.budget_total ? Math.min(100, (s.budget_used/s.budget_total)*100):0}%` }}/>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 text-white rounded-md p-6" data-testid="kb-hero">
          <div className="label-tiny text-white/70">Compliance</div>
          <div className="font-heading text-2xl font-bold mt-2 leading-tight">Kawasan Berikat<br/>Aktif</div>
          <p className="text-xs text-slate-300 mt-3">Dokumen LS, HS Code, dan pemisahan PO Lokal vs Bonded sudah terintegrasi.</p>
          <Link to="/settings" className="mt-4 inline-flex text-xs bg-white/10 px-3 py-2 rounded hover:bg-white/20">Setting Perusahaan →</Link>
        </div>
      </div>

      {/* Budget Forecast */}
      <div className="bg-white border border-slate-200 rounded-md" data-testid="budget-forecast">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="label-tiny">Forecast</div>
            <div className="font-heading text-lg font-bold flex items-center gap-2"><TrendingDown size={18}/> Budget Exhaustion Forecast</div>
            <div className="text-xs text-slate-500">Prediksi berdasarkan burn rate 90 hari terakhir. Warning otomatis untuk yang habis dalam ≤30 hari.</div>
          </div>
        </div>
        <table className="data-table">
          <thead><tr><th>Department</th><th>Product</th><th>Periode</th><th>Sisa</th><th>Burn / bulan</th><th>Sisa Hari</th><th>Est. Habis</th><th>Warning</th></tr></thead>
          <tbody>
            {forecast.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada data untuk forecast</td></tr>}
            {forecast.map(f => (
              <tr key={f.budget_id} data-testid={`forecast-row-${f.budget_id}`} className={f.days_to_exhaust && f.days_to_exhaust <= 30 ? "bg-red-50" : ""}>
                <td>{f.department}</td>
                <td>{f.product}</td>
                <td className="font-mono text-xs">{f.period}</td>
                <td className="font-mono">{fmtIDR(f.available)}</td>
                <td className="font-mono text-slate-600">{fmtIDR(f.avg_monthly_burn)}</td>
                <td className="font-mono">{f.days_to_exhaust != null ? `${f.days_to_exhaust} hr` : "-"}</td>
                <td className="text-xs">{f.projected_exhaust_date || "-"}</td>
                <td className="text-xs">{f.warning ? <span className={f.warning.startsWith("❌") ? "text-red-600 font-semibold" : "text-amber-600 font-semibold flex items-center gap-1"}><AlertTriangle size={12}/> {f.warning.replace(/^[⚠️❌]\s?/, "")}</span> : <span className="text-emerald-600 text-xs">On track</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
