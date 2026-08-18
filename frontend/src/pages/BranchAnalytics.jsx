import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { TrendingUp, DollarSign, GitCompare, Zap } from "lucide-react";

export default function BranchAnalytics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState({ branches: [], totals: {} });
  useEffect(() => { api.get(`/analytics/branches-comparison?year=${year}`).then(r => setData(r.data)); }, [year]);
  const t = data.totals || {};
  return (
    <div className="space-y-6" data-testid="branch-analytics">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Analytics</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Perbandingan Cabang / Divisi</h1>
          <p className="text-sm text-slate-600 mt-1">Bandingkan kinerja procurement antar department (spend, cycle, on-time, savings dari negosiasi vendor).</p>
        </div>
        <select value={year} onChange={e=>setYear(parseInt(e.target.value))} className="h-10 border border-slate-200 rounded px-3 text-sm font-mono" data-testid="ba-year">
          {[0,1,2].map(i=>{const y=now.getFullYear()-i; return <option key={y} value={y}>{y}</option>;})}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard testid="ba-kpi-spend" icon={DollarSign} label="Total Spend" value={fmtIDR(t.total_spend||0)} sub={`${t.total_po||0} PO`}/>
        <KpiCard testid="ba-kpi-savings" icon={Zap} label="Total Savings (Vendor Reply)" value={fmtIDR(t.total_savings||0)} sub="Negosiasi harga" tone="emerald"/>
        <KpiCard testid="ba-kpi-branches" icon={GitCompare} label="Divisi Aktif" value={t.branch_count||0} sub={`dari ${t.total_pr||0} PR`}/>
        <KpiCard testid="ba-kpi-conversion" icon={TrendingUp} label="PR→PO Rate" value={t.total_pr ? `${Math.round((t.total_po||0)/t.total_pr*100)}%` : "-"} sub="conversion"/>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="p-3 border-b border-slate-200 label-tiny">Ranking per Divisi (sort: total spend)</div>
        <table className="data-table">
          <thead><tr><th>#</th><th>Divisi</th><th>Budget</th><th>Spend</th><th>Utilisasi</th><th>PR</th><th>PO</th><th>Avg Cycle</th><th>On-Time %</th><th>Savings</th></tr></thead>
          <tbody>
            {(data.branches||[]).map((b,i)=>(
              <tr key={b.department_id} data-testid={`ba-row-${b.department_id}`}>
                <td><span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${i===0?"bg-amber-100 text-amber-700":i===1?"bg-slate-100 text-slate-700":i===2?"bg-orange-100 text-orange-700":"bg-slate-50 text-slate-500"}`}>{i+1}</span></td>
                <td className="font-semibold">{b.department_name}</td>
                <td className="font-mono text-xs">{fmtIDR(b.budget||0)}</td>
                <td className="font-mono text-xs font-semibold">{fmtIDR(b.total_spend||0)}</td>
                <td>
                  {b.budget_utilization_pct !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-200 rounded"><div className={`h-full rounded ${b.budget_utilization_pct>90?"bg-red-500":b.budget_utilization_pct>70?"bg-amber-500":"bg-emerald-500"}`} style={{width:`${Math.min(100,b.budget_utilization_pct)}%`}}/></div>
                      <span className="text-xs font-mono">{b.budget_utilization_pct}%</span>
                    </div>
                  ) : <span className="text-slate-300 text-xs">-</span>}
                </td>
                <td className="text-xs">{b.pr_count}</td>
                <td className="text-xs">{b.po_count}</td>
                <td className="text-xs">{b.avg_cycle_days !== null ? `${b.avg_cycle_days} hr` : "-"}</td>
                <td className="text-xs">{b.on_time_pct !== null ? `${b.on_time_pct}%` : "-"}</td>
                <td className="text-xs font-mono text-emerald-700">{b.savings_from_vendor_reply > 0 ? fmtIDR(b.savings_from_vendor_reply) : "-"}</td>
              </tr>
            ))}
            {(data.branches||[]).length===0 && <tr><td colSpan={10} className="text-center py-8 text-slate-400">Belum ada data — buat PR/PO tahun {year}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ testid, icon: Icon, label, value, sub, tone }) {
  const cls = tone==="emerald" ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200";
  return (
    <div className={`${cls} border rounded-md p-5`} data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="label-tiny">{label}</div>
        <Icon size={16} className="text-slate-400"/>
      </div>
      <div className="font-heading text-2xl font-bold mt-2 font-mono">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
