import { fmtIDR } from "@/lib/api";

/**
 * Lightweight SVG line chart of PO price history (no external deps).
 * Props:
 *  - data: [{ price, created_at, po_number, vendor_name }, ...] (any order; component sorts asc by date)
 *  - height (default 160)
 */
export default function PriceTrendChart({ data = [], height = 160 }) {
  const pts = [...data]
    .filter(d => d && d.price)
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  if (pts.length === 0) return null;
  const w = 620;
  const h = height;
  const padX = 40, padY = 20;
  const prices = pts.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(1, maxP - minP);
  const step = pts.length > 1 ? (w - 2*padX) / (pts.length - 1) : 0;
  const yFor = (v) => (h - padY) - ((v - minP) / range) * (h - 2*padY);
  const xFor = (i) => padX + i * step;
  const path = pts.map((p, i) => `${i===0?"M":"L"} ${xFor(i)} ${yFor(p.price)}`).join(" ");
  const area = `${path} L ${xFor(pts.length-1)} ${h-padY} L ${xFor(0)} ${h-padY} Z`;
  const avg = prices.reduce((s,v)=>s+v,0)/prices.length;
  const trend = pts.length > 1 ? (pts[pts.length-1].price - pts[0].price) / pts[0].price * 100 : 0;
  const trendColor = trend > 5 ? "#DC2626" : trend < -5 ? "#059669" : "#64748B";
  return (
    <div className="bg-white border border-slate-200 rounded p-3" data-testid="price-trend-chart">
      <div className="flex justify-between items-center mb-2">
        <div className="label-tiny">Tren Harga PO</div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500">Rata-rata <b className="font-mono text-slate-800">{fmtIDR(avg)}</b></span>
          <span style={{color: trendColor}} data-testid="price-trend-pct">
            {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"} {Math.abs(trend).toFixed(1)}% {pts.length>1?"vs awal":""}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        {/* horizontal grid */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={padX} x2={w-padX} y1={padY + f*(h-2*padY)} y2={padY + f*(h-2*padY)} stroke="#E2E8F0" strokeDasharray="3 3"/>
        ))}
        {/* avg line */}
        <line x1={padX} x2={w-padX} y1={yFor(avg)} y2={yFor(avg)} stroke="#10B981" strokeDasharray="4 2" strokeWidth="1"/>
        {/* area fill */}
        <path d={area} fill="rgba(59,130,246,0.10)"/>
        {/* line */}
        <path d={path} fill="none" stroke="#2563EB" strokeWidth="2"/>
        {/* dots */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={xFor(i)} cy={yFor(p.price)} r="3" fill="#2563EB" data-testid={`ptc-dot-${i}`}>
              <title>{p.po_number} — {new Date(p.created_at).toLocaleDateString("id-ID")}: {fmtIDR(p.price)} ({p.vendor_name||"-"})</title>
            </circle>
          </g>
        ))}
        {/* y-axis labels */}
        <text x={padX-4} y={padY+4} fontSize="9" textAnchor="end" fill="#64748B">{fmtIDR(maxP)}</text>
        <text x={padX-4} y={h-padY} fontSize="9" textAnchor="end" fill="#64748B">{fmtIDR(minP)}</text>
        {/* x-axis endpoints */}
        <text x={padX} y={h-4} fontSize="9" fill="#64748B">{new Date(pts[0].created_at).toLocaleDateString("id-ID",{month:"short",day:"numeric"})}</text>
        <text x={w-padX} y={h-4} fontSize="9" textAnchor="end" fill="#64748B">{new Date(pts[pts.length-1].created_at).toLocaleDateString("id-ID",{month:"short",day:"numeric"})}</text>
      </svg>
    </div>
  );
}
