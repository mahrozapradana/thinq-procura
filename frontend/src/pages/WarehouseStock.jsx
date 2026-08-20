import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function WarehouseStock() {
  const [rows, setRows] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [wh, setWh] = useState("");
  const [bond, setBond] = useState("");
  const [q, setQ] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (wh) params.set("warehouse_id", wh);
    if (bond) params.set("is_bonded", bond === "yes" ? "true" : "false");
    if (q) params.set("q", q);
    api.get(`/warehouse-stock?${params.toString()}`).then(r => setRows(r.data));
  };
  useEffect(() => { load(); }, [wh, bond, q]);
  useEffect(() => { api.get("/warehouses").then(r => setWarehouses(r.data)); }, []);

  return (
    <div className="space-y-4" data-testid="stock-page">
      <div>
        <div className="label-tiny">Warehouse</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Stok per Lokasi</h1>
        <p className="text-sm text-slate-600 mt-1">Ringkasan stok berdasarkan gudang, lokasi, dan lot number. Bonded vs non-bonded terpisah.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Cari product/warehouse/lot…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs" data-testid="stock-search"/>
        <Select value={wh||"__all"} onValueChange={v=>setWh(v==="__all"?"":v)}>
          <SelectTrigger className="max-w-xs" data-testid="stock-wh"><SelectValue placeholder="Semua Warehouse"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Semua Warehouse</SelectItem>
            {warehouses.map(w=><SelectItem key={w.id} value={w.id}>{w.name} {w.is_bonded?"(Bonded)":""}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={bond||"__all"} onValueChange={v=>setBond(v==="__all"?"":v)}>
          <SelectTrigger className="max-w-[180px]" data-testid="stock-bonded"><SelectValue placeholder="Semua"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Semua</SelectItem>
            <SelectItem value="yes">Bonded / KB</SelectItem>
            <SelectItem value="no">Non Bonded</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-slate-500 ml-auto">{rows.length} baris</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table" style={{ minWidth: 1000 }}>
          <thead><tr><th>Warehouse</th><th>Location</th><th>Product</th><th>Lot #</th><th>Qty</th><th>Unit</th><th>Umur (hari)</th><th>Bonded</th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Tidak ada stok</td></tr>}
            {rows.map((r,i)=>(
              <tr key={i} data-testid={`stock-row-${i}`} className={r.aging_alert?"bg-red-50":(r.warehouse_bonded?"bg-blue-50/30":"")}>
                <td className="whitespace-nowrap">{r.warehouse_name}</td>
                <td className="whitespace-nowrap">{r.location_name}</td>
                <td className="whitespace-nowrap"><span className="font-mono text-xs text-slate-500">{r.product_code}</span> {r.product_name}</td>
                <td className="font-mono text-xs">{r.lot_number || "-"}</td>
                <td className="font-mono font-semibold">{r.qty}</td>
                <td>{r.unit}</td>
                <td className={`font-mono ${r.aging_alert?"text-red-600 font-bold":r.aged_days>30?"text-amber-600":"text-slate-500"}`}>{r.aged_days} hr {r.aging_alert && <span className="text-[10px] uppercase ml-1 px-1 rounded bg-red-100 text-red-700">⚠ AGING</span>}</td>
                <td>{r.warehouse_bonded ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
