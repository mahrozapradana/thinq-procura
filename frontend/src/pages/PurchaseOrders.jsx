import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Merge, Check, X, Eye, Send, Download, Star, Printer, MessageSquare, FileUp, Upload } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;
async function downloadReport(path, filename) {
  const t = localStorage.getItem("access_token");
  const r = await fetch(`${API_URL}/api${path}`, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} });
  const b = await r.blob();
  const url = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

const STATUS_STYLE = {
  approved: "bg-emerald-100 text-emerald-700",
  pending_approval: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  partial: "bg-amber-100 text-amber-700",
};

export default function PurchaseOrders() {
  const [pos, setPos] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [prs, setPrs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [detail, setDetail] = useState(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [selected, setSelected] = useState({});
  const [form, setForm] = useState({ po_type: "LOCAL", tax_percent: 11, projects: [], tax_ids: [], currency: "IDR", exchange_rate: 1 });
  const [taxes, setTaxes] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [companyRates, setCompanyRates] = useState({});
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState("");
  // Verified pricelist hints per product_id — used in merge PR→PO dialog
  const [verifiedHints, setVerifiedHints] = useState({});

  const selectedIds = Object.keys(selected).filter(k=>selected[k]);

  // Fetch verified pricelist for each product that appears in selected PRs
  useEffect(() => {
    const productIds = [...new Set(selectedIds.flatMap(id => (prs.find(p=>p.id===id)?.items||[]).map(i=>i.product_id).filter(Boolean)))];
    productIds.forEach(pid => {
      if (verifiedHints[pid] !== undefined) return;
      api.get(`/pricelists/cheapest?product_id=${pid}&only_verified=true`)
        .then(r => setVerifiedHints(prev => ({...prev, [pid]: r.data})))
        .catch(() => setVerifiedHints(prev => ({...prev, [pid]: null})));
    });
  }, [selectedIds, prs]);

  const bulkImport = async (file) => {
    setBulkUploading(true); setBulkResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("access_token");
      const r = await fetch(`${API_URL}/api/pos/bulk-import`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Import gagal");
      setBulkResult(d);
      toast.success(`Berhasil buat ${d.created_count} PO dari ${d.total_rows} baris`);
      load();
    } catch(e){ toast.error(e.message); }
    finally { setBulkUploading(false); }
  };

  const load = () => {
    api.get(`/pos?page=${page}&page_size=20&q=${encodeURIComponent(q)}`).then(r=>{ setPos(r.data.items); setTotal(r.data.total); setPages(r.data.pages); });
    api.get("/prs?page_size=100&status=approved").then(r=>setPrs(r.data.items || []));
    api.get("/vendors?status=approved&exclude_blacklisted=true").then(r=>setVendors(r.data));
    api.get("/taxes?active_only=true").then(r=>setTaxes(r.data)).catch(()=>{});
    api.get("/settings/company").then(r=>setCompanyRates(r.data.exchange_rates || {})).catch(()=>{});
  };
  useEffect(() => { load(); }, [page, q]);

  useEffect(() => {
    if (selectedIds.length === 0) { setSuggestions([]); return; }
    const productIds = [...new Set(selectedIds.flatMap(id => (prs.find(p=>p.id===id)?.items||[]).map(i=>i.product_id)))].join(",");
    api.get(`/vendor-suggestions?product_ids=${productIds}&top=3`).then(r=>setSuggestions(r.data.suggestions || [])).catch(()=>setSuggestions([]));
  }, [selectedIds.join(","), prs.length]);

  const createPO = async () => {
    try {
      const rate = form.currency === "IDR" ? 1 : (companyRates[form.currency] || form.exchange_rate || 1);
      await api.post("/pos", { ...form, exchange_rate: rate, pr_ids: selectedIds });
      toast.success("PO dibuat"); setMergeOpen(false); setSelected({}); setForm({po_type:"LOCAL", tax_ids:[], currency:"IDR", exchange_rate:1}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const approve = async (id) => { await api.post(`/pos/${id}/approve`); toast.success("Approved"); load(); };
  const reject = async (id) => { await api.post(`/pos/${id}/reject`); toast.success("Rejected"); load(); };
  const send = async (id) => { await api.post(`/pos/${id}/send`); toast.success("PO dikirim ke vendor"); load(); };
  const submitRating = async () => {
    try {
      const r = await api.post(`/pos/${detail.id}/rate`, { rating, note: ratingNote });
      toast.success(`Rating tersimpan. Rata-rata: ${r.data.avg_rating}★ (${r.data.count})`);
      setRating(0); setRatingNote("");
      // refresh detail
      const upd = await api.get(`/pos/${detail.id}`);
      setDetail(upd.data);
      load();
    } catch(e) { toast.error(e.response?.data?.detail); }
  };
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState("");
  const loadMsgs = async (id) => { try { const r = await api.get(`/pos/${id}/messages`); setMessages(r.data); } catch {} };
  const sendMsg = async () => {
    if (!msgText.trim()) return;
    try { const r = await api.post(`/pos/${detail.id}/messages`, { text: msgText }); setMessages(m=>[...m, r.data]); setMsgText(""); }
    catch(e) { toast.error(e.response?.data?.detail); }
  };
  useEffect(() => { if (detail) loadMsgs(detail.id); }, [detail?.id]);
  const printPO = () => {
    const t = localStorage.getItem("access_token");
    fetch(`${process.env.REACT_APP_BACKEND_URL}/api/pos/${detail.id}/print.pdf`, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(r=>r.blob()).then(b=>{ const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=`PO_${detail.po_number}.pdf`; a.click(); URL.revokeObjectURL(u); });
  };

  return (
    <div className="space-y-4" data-testid="po-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Procurement</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Purchase Orders</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>downloadReport("/reports/pos.csv","purchase_orders.csv")} data-testid="po-export-csv"><Download size={14}/> CSV</Button>
          <Button variant="outline" size="sm" onClick={()=>downloadReport("/reports/pos.pdf","purchase_orders.pdf")} data-testid="po-export-pdf"><Download size={14}/> PDF</Button>
          <Button variant="outline" onClick={()=>{ setBulkOpen(true); setBulkResult(null); }} data-testid="po-bulk-btn"><FileUp size={14}/> Bulk Import</Button>
          <Button onClick={()=>setMergeOpen(true)} data-testid="po-merge-btn"><Merge size={14}/> Merge PR → PO</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Cari nomor PO…" value={q} onChange={e=>{setPage(1); setQ(e.target.value);}} className="max-w-md" data-testid="po-search"/>
        <div className="text-xs text-slate-500 ml-auto">{total} PO · Hal {page}/{pages || 1}</div>
        <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} data-testid="po-prev">‹</Button>
        <Button variant="outline" size="sm" disabled={page>=pages} onClick={()=>setPage(p=>p+1)} data-testid="po-next">›</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No PO</th><th>Type</th><th>Vendor</th><th>Total</th><th>Status</th><th>Shipping</th><th>Invoice</th><th></th></tr></thead>
          <tbody>
            {pos.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada PO</td></tr>}
            {pos.map(p => (
              <tr key={p.id} data-testid={`po-row-${p.id}`}>
                <td className="font-mono text-xs">{p.po_number}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${p.po_type==="BONDED"?"bg-blue-100 text-blue-700":"bg-slate-100"}`}>{p.po_type}</span></td>
                <td>{vendors.find(v=>v.id===p.vendor_id)?.company_name || p.vendor_id}</td>
                <td className="font-mono">{fmtIDR(p.total)}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[p.status]||"bg-slate-100"}`}>{p.status}</span></td>
                <td className="text-xs text-slate-600">{p.shipping_status}</td>
                <td className="text-xs text-slate-600">{p.invoice_status}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={()=>setDetail(p)} className="p-1 hover:bg-slate-100 rounded" data-testid={`po-view-${p.id}`}><Eye size={14}/></button>
                  {p.status==="pending_approval" && <>
                    <button onClick={()=>approve(p.id)} className="p-1 hover:bg-emerald-50 rounded" data-testid={`po-approve-${p.id}`}><Check size={14} className="text-emerald-600"/></button>
                    <button onClick={()=>reject(p.id)} className="p-1 hover:bg-red-50 rounded" data-testid={`po-reject-${p.id}`}><X size={14} className="text-red-600"/></button>
                  </>}
                  {p.status==="approved" && <button onClick={()=>send(p.id)} className="p-1 hover:bg-blue-50 rounded" data-testid={`po-send-${p.id}`}><Send size={14} className="text-blue-600"/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bulk Import PO dari CSV/XLSX</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs bg-blue-50 border border-blue-200 rounded p-3">
              <b>Format:</b> kolom wajib <code>vendor_code, product_code, qty, price</code>. Opsional: <code>po_type</code> (LOCAL|BONDED), <code>currency</code>, <code>delivery_date</code>, <code>notes</code>.
              Baris dengan <code>vendor_code + po_type + currency</code> yang sama akan digabung ke 1 PO.
            </div>
            <label className="cursor-pointer block border-2 border-dashed border-slate-300 rounded p-6 text-center hover:bg-slate-50">
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e=>{const f=e.target.files?.[0];if(f){bulkImport(f); e.target.value="";}}} disabled={bulkUploading} data-testid="po-bulk-file"/>
              <Upload size={20} className="mx-auto mb-1 text-slate-400"/>
              <div className="text-sm">{bulkUploading?"Mengupload...":"Klik atau drop file CSV / XLSX"}</div>
            </label>
            {bulkResult && (
              <div className="text-xs" data-testid="po-bulk-result">
                <div className="font-semibold text-emerald-700">✓ {bulkResult.created_count} PO dibuat dari {bulkResult.total_rows} baris</div>
                {(bulkResult.created||[]).length > 0 && <div className="mt-1 border border-slate-200 rounded p-2 bg-slate-50">
                  {bulkResult.created.map((c,i)=><div key={i} className="font-mono text-[11px]">{c.po_number} — {c.items} item, total {fmtIDR(c.total)}</div>)}
                </div>}
                {(bulkResult.errors||[]).length > 0 && <div className="mt-1 text-red-600">Errors: {bulkResult.errors.length}
                  <ul className="pl-4 list-disc">{bulkResult.errors.slice(0,5).map((e,i)=><li key={i}>Row {e.row}: {e.error}</li>)}</ul>
                </div>}
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={()=>setBulkOpen(false)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Merge PR menjadi PO</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="label-tiny">Type PO *</Label>
                <Select value={form.po_type} onValueChange={v=>setForm({...form,po_type:v})}>
                  <SelectTrigger data-testid="po-type"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOCAL">Local</SelectItem>
                    <SelectItem value="BONDED">Bonded / International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Vendor *</Label>
                <Select value={form.vendor_id||""} onValueChange={v=>setForm({...form,vendor_id:v})}>
                  <SelectTrigger data-testid="po-vendor"><SelectValue placeholder="Pilih vendor"/></SelectTrigger>
                  <SelectContent>{vendors.map(v=><SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Delivery Date</Label><Input type="date" value={form.delivery_date||""} onChange={e=>setForm({...form,delivery_date:e.target.value})} data-testid="po-delivery"/></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="label-tiny">Currency</Label>
                <Select value={form.currency||"IDR"} onValueChange={v=>setForm({...form, currency: v, exchange_rate: v==="IDR"?1:(companyRates[v]||1)})}>
                  <SelectTrigger data-testid="po-currency"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IDR">IDR (Rupiah)</SelectItem>
                    <SelectItem value="USD">USD (Bonded)</SelectItem>
                    <SelectItem value="SGD">SGD</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.currency && form.currency !== "IDR" && (
                <div className="col-span-2">
                  <Label className="label-tiny">Kurs → IDR</Label>
                  <Input type="number" value={form.exchange_rate||companyRates[form.currency]||""} onChange={e=>setForm({...form, exchange_rate: parseFloat(e.target.value||0)})} data-testid="po-exchange-rate"/>
                  <div className="text-[10px] text-slate-500 mt-1">Default dari Settings → Company → Kurs. Total IDR akan otomatis disimpan untuk pelaporan pajak.</div>
                </div>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded p-3" data-testid="po-suggest">
                <div className="label-tiny mb-2">💡 Rekomendasi Vendor (skor tertinggi)</div>
                <div className="space-y-1">
                  {suggestions.map((s,i)=>{
                    // Check if this vendor has a verified pricelist for any of the products in selected PRs
                    const products = selectedIds.flatMap(id => (prs.find(p=>p.id===id)?.items||[]));
                    const verifiedMatch = products.map(it => verifiedHints[it.product_id]?.cheapest).filter(v => v && v.vendor_id === s.vendor_id);
                    const verifiedPrice = verifiedMatch[0]?.price;
                    return (
                    <button key={s.vendor_id} onClick={()=>setForm({...form, vendor_id: s.vendor_id})} className={`w-full text-left flex items-center gap-3 p-2 rounded border ${form.vendor_id===s.vendor_id?"border-slate-900 bg-white":"border-slate-200 bg-white hover:border-slate-400"}`} data-testid={`po-suggest-${i}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i===0?"bg-emerald-500 text-white":"bg-slate-200 text-slate-700"}`}>{s.score}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-2">
                          {s.company_name}
                          {verifiedPrice && <span className="inline-flex items-center gap-0.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700" data-testid={`po-suggest-verified-${i}`}>✓ Verified Rp {(verifiedPrice||0).toLocaleString("id-ID")}</span>}
                        </div>
                        <div className="text-[10px] text-slate-500">{s.reasons.join(" · ")}</div>
                      </div>
                      {i===0 && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Top</span>}
                    </button>
                  );})}
                </div>
              </div>
            )}
            {/* Verified pricelist hints — show one chip per unique product with verified price */}
            {selectedIds.length > 0 && (() => {
              const uniqueProducts = [...new Map(selectedIds.flatMap(id => (prs.find(p=>p.id===id)?.items||[])).map(it => [it.product_id, it])).values()];
              const withVerified = uniqueProducts.filter(it => verifiedHints[it.product_id]?.cheapest);
              if (withVerified.length === 0) return null;
              return (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3" data-testid="po-verified-hints">
                  <div className="label-tiny mb-2 text-emerald-800">✓ Harga Verified untuk Produk PR ini</div>
                  <div className="flex flex-wrap gap-1.5">
                    {withVerified.map((it, i) => {
                      const c = verifiedHints[it.product_id].cheapest;
                      return (
                        <button key={i} type="button" onClick={()=>setForm(prev => ({...prev, vendor_id: c.vendor_id}))} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100" data-testid={`po-verified-chip-${i}`} title="Klik untuk pilih vendor ini">
                          <span className="font-bold">✓ {it.product_name}</span>
                          <span className="font-mono font-semibold">Rp {(c.price||0).toLocaleString("id-ID")}</span>
                          <span className="text-emerald-700">· {c.vendor_name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <div>
              <Label className="label-tiny">Pajak (bisa lebih dari satu — sales menambah, withholding mengurangi)</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-32 overflow-y-auto border border-slate-200 rounded p-2 text-xs mt-1" data-testid="po-tax-list">
                {taxes.length===0 && <div className="text-slate-400 col-span-full text-center py-2">Belum ada master pajak. Tambah di Master Data → Pajak.</div>}
                {taxes.map(tx=>(
                  <label key={tx.id} className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded ${(form.tax_ids||[]).includes(tx.id)?"bg-slate-900 text-white":"hover:bg-slate-100"}`}>
                    <input type="checkbox" checked={(form.tax_ids||[]).includes(tx.id)}
                      onChange={e=>setForm({...form, tax_ids: e.target.checked ? [...(form.tax_ids||[]), tx.id] : (form.tax_ids||[]).filter(x=>x!==tx.id)})}
                      data-testid={`po-tax-${tx.code}`}/>
                    <span className="font-semibold">{tx.code}</span>
                    <span className="opacity-70">{tx.rate}%</span>
                  </label>
                ))}
              </div>
              {(form.tax_ids||[]).length>0 && (()=>{
                const untaxed = selectedIds.reduce((s,id)=>s + (prs.find(p=>p.id===id)?.total||0), 0);
                const applied = taxes.filter(t=>form.tax_ids.includes(t.id));
                const salesTotal = applied.filter(t=>t.tax_type!=="withholding").reduce((s,t)=>s+untaxed*t.rate/100,0);
                const whTotal = applied.filter(t=>t.tax_type==="withholding").reduce((s,t)=>s+untaxed*t.rate/100,0);
                const grand = untaxed + salesTotal - whTotal;
                return <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono space-y-0.5" data-testid="po-tax-preview">
                  <div className="flex justify-between"><span>Subtotal (untaxed)</span><span>{fmtIDR(untaxed)}</span></div>
                  {applied.map(t=>(<div key={t.id} className="flex justify-between"><span>{t.name} ({t.rate}%)</span><span>{t.tax_type==="withholding"?"-":"+"}{fmtIDR(untaxed*t.rate/100)}</span></div>))}
                  <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Grand Total</span><span>{fmtIDR(grand)}</span></div>
                </div>;
              })()}
            </div>
            <div className="border border-slate-200 rounded max-h-72 overflow-y-auto">
              <table className="data-table">
                <thead><tr><th></th><th>PR</th><th>Requester</th><th>Total</th></tr></thead>
                <tbody>
                  {prs.length===0 && <tr><td colSpan={4} className="text-center py-4 text-slate-400">Tidak ada PR approved</td></tr>}
                  {prs.map(p=>(
                    <tr key={p.id}>
                      <td><Checkbox checked={!!selected[p.id]} onCheckedChange={(v)=>setSelected({...selected,[p.id]:v})} data-testid={`po-select-pr-${p.id}`}/></td>
                      <td className="font-mono text-xs">{p.pr_number}</td>
                      <td>{p.requester_name}</td>
                      <td className="font-mono">{fmtIDR(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter><Button onClick={createPO} disabled={!selectedIds.length || !form.vendor_id} data-testid="po-create-btn">Buat PO ({selectedIds.length} PR)</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!detail} onOpenChange={(v)=>!v && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
          {detail && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle className="font-mono">#{detail.po_number}</SheetTitle>
                  <Button size="sm" variant="outline" onClick={printPO} data-testid="po-print"><Printer size={14}/> Print PDF</Button>
                </div>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><div className="label-tiny">Vendor</div><div className="font-semibold">{detail.vendor_name || vendors.find(v=>v.id===detail.vendor_id)?.company_name}</div></div>
                  <div><div className="label-tiny">Order Date</div><div>{detail.order_date ? new Date(detail.order_date).toLocaleDateString("id-ID") : "-"}</div></div>
                  <div><div className="label-tiny">Vendor Code</div><div className="font-mono text-xs">{detail.vendor_code || "-"}</div></div>
                  <div><div className="label-tiny">Receipt Date</div><div>{detail.receipt_date ? new Date(detail.receipt_date).toLocaleDateString("id-ID") : "-"}</div></div>
                  <div><div className="label-tiny">Warehouse</div><div>{detail.warehouse || "-"}</div></div>
                  <div><div className="label-tiny">Vendor Forecast</div><div>{detail.vendor_forecast || "-"}</div></div>
                  <div><div className="label-tiny">Payment Terms</div><div>{detail.payment_terms || "-"}</div></div>
                  <div><div className="label-tiny">Projects</div><div className="flex flex-wrap gap-1">{(detail.projects || []).map(p=><span key={p} className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded font-semibold uppercase">{p}</span>) || "-"}</div></div>
                </div>
                <div>
                  <table className="data-table">
                    <thead><tr><th>#</th><th>Product</th><th>Description</th><th>Projects</th><th>Qty</th><th>Unit Price</th><th>Taxes</th><th>Subtotal</th></tr></thead>
                    <tbody>{detail.items?.map((it,i)=>(<tr key={i}><td>{i+1}</td><td className="font-mono text-xs">[{it.product_id?.slice(0,8)}] {it.product_name}</td><td className="text-xs">{it.product_name}</td><td className="text-xs">{(detail.projects||[]).join(",")}</td><td>{it.qty}</td><td className="font-mono">{fmtIDR(it.price)}</td><td className="text-xs">{(detail.taxes_snapshot||[]).length>0 ? detail.taxes_snapshot.map(t=>t.code).join(", ") : `PPN ${detail.tax_percent||0}%`}</td><td className="font-mono">{fmtIDR(it.subtotal)}</td></tr>))}</tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <div className="w-72 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Untaxed Amount</span><span className="font-mono">{fmtIDR(detail.untaxed_amount || detail.total)}</span></div>
                    {(detail.tax_breakdown||[]).map((tx,i)=>(
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-500">{tx.name} ({tx.rate}%){tx.tax_type==="withholding"?" — potongan":""}</span>
                        <span className="font-mono">{tx.tax_type==="withholding"?"-":"+"}{fmtIDR(Math.abs(tx.amount))}</span>
                      </div>
                    ))}
                    {(!detail.tax_breakdown || detail.tax_breakdown.length===0) && detail.amount_tax>0 && (
                      <div className="flex justify-between"><span className="text-slate-500">Amount Tax ({detail.tax_percent||0}%)</span><span className="font-mono">{fmtIDR(detail.amount_tax)}</span></div>
                    )}
                    {detail.dpp_nilai_lain>0 && <div className="flex justify-between"><span className="text-slate-500">DPP Nilai Lain</span><span className="font-mono">{fmtIDR(detail.dpp_nilai_lain)}</span></div>}
                    <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Grand Total</span><span className="font-mono">{fmtIDR(detail.amount_total || detail.total)}</span></div>
                  </div>
                </div>
                {detail.vendor_reply && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded" data-testid="po-vendor-reply">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="label-tiny text-blue-800">Balasan Vendor {detail.vendor_reply.vendor_name && `— ${detail.vendor_reply.vendor_name}`}</div>
                        <div className="text-xs text-slate-600 mt-1">
                          {detail.vendor_reply.can_fulfill ? "✓ Vendor menyatakan bisa memenuhi" : "✗ Vendor menolak"}
                          {detail.vendor_reply.delivery_days ? ` · Estimasi ${detail.vendor_reply.delivery_days} hari` : ""}
                          {detail.vendor_reply.submitted_at ? ` · ${new Date(detail.vendor_reply.submitted_at).toLocaleString("id-ID")}` : ""}
                        </div>
                      </div>
                      {!detail.vendor_reply_accepted_at && !detail.vendor_reply_rejected_at && detail.vendor_reply.can_fulfill && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={async ()=>{
                            try { const r=await api.post(`/pos/${detail.id}/accept-vendor-reply`);
                              toast.success(r.data.reapproved ? `Diterima. Perubahan ${r.data.delta_pct.toFixed(1)}% > 5% → approval diulang.` : "Balasan diterima");
                              const upd=await api.get(`/pos/${detail.id}`); setDetail(upd.data); load();
                            } catch(e){ toast.error(e.response?.data?.detail); }
                          }} data-testid="po-accept-reply" className="bg-emerald-600 hover:bg-emerald-700">Terima</Button>
                          <Button size="sm" variant="outline" onClick={async ()=>{
                            try { await api.post(`/pos/${detail.id}/reject-vendor-reply`);
                              toast.success("Balasan ditolak");
                              const upd=await api.get(`/pos/${detail.id}`); setDetail(upd.data); load();
                            } catch(e){ toast.error(e.response?.data?.detail); }
                          }} data-testid="po-reject-reply">Tolak</Button>
                        </div>
                      )}
                      {detail.vendor_reply_accepted_at && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Diterima</span>}
                    </div>
                    {detail.vendor_reply.can_fulfill && (detail.vendor_reply.items||[]).length>0 && (
                      <div className="mt-3 border border-blue-200 rounded bg-white overflow-hidden">
                        <table className="data-table">
                          <thead><tr><th>Item</th><th>Harga Asli</th><th>Counter Vendor</th><th>Δ</th><th>Catatan Vendor</th></tr></thead>
                          <tbody>
                            {detail.vendor_reply.items.map((r,i)=>{
                              const orig = detail.items?.[r.item_index];
                              const origPrice = orig?.price || 0;
                              const delta = origPrice ? ((r.price - origPrice)/origPrice*100) : 0;
                              const isBig = Math.abs(delta) > 5;
                              return (
                                <tr key={i} data-testid={`po-reply-item-${i}`}>
                                  <td className="text-xs">{orig?.product_name || `#${r.item_index}`}</td>
                                  <td className="font-mono text-xs">{fmtIDR(origPrice)}</td>
                                  <td className="font-mono text-xs font-semibold">{fmtIDR(r.price)}</td>
                                  <td className={`text-xs font-semibold ${isBig?(delta>0?"text-red-600":"text-emerald-600"):"text-slate-500"}`}>
                                    {delta>0?"+":""}{delta.toFixed(1)}%{isBig?" ⚠":""}
                                  </td>
                                  <td className="text-xs text-slate-600">{r.notes || "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {detail.vendor_reply.overall_notes && (
                      <div className="mt-2 text-xs bg-white/60 border border-blue-100 rounded p-2"><b>Catatan umum:</b> {detail.vendor_reply.overall_notes}</div>
                    )}
                    {detail.reapproval_reason && (
                      <div className="mt-2 text-xs bg-amber-100 border border-amber-300 rounded p-2 text-amber-800"><b>⚠ Approval diulang:</b> {detail.reapproval_reason}</div>
                    )}
                  </div>
                )}
                {detail.vendor_acknowledged && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs" data-testid="po-ack-info">
                    <b>✓ Vendor telah konfirmasi terima PO</b> {detail.vendor_acknowledged_by_name && `oleh ${detail.vendor_acknowledged_by_name}`} · {detail.vendor_acknowledged_at && new Date(detail.vendor_acknowledged_at).toLocaleString("id-ID")}
                  </div>
                )}
                <div>
                  <div className="label-tiny mb-2">Approval Timeline</div>
                  {detail.approvals?.length ? detail.approvals.map((a,i)=>(
                    <div key={i} className="flex items-center gap-3 p-2 border border-slate-200 rounded mb-2">
                      <div className={`w-7 h-7 rounded font-mono text-xs flex items-center justify-center ${a.status==="approved"?"bg-emerald-500 text-white":a.status==="rejected"?"bg-red-500 text-white":"bg-slate-200"}`}>L{a.level}</div>
                      <div className="flex-1 text-xs uppercase font-semibold">{a.role}</div>
                      <div className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[a.status]||"bg-slate-100"}`}>{a.status}</div>
                    </div>
                  )) : <div className="text-xs text-slate-500">Auto-approved</div>}
                </div>
                {detail.po_type==="BONDED" && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="label-tiny text-blue-700">Kepabeanan / Kawasan Berikat</div>
                    <div className="text-sm text-slate-700 mt-1">PO ini termasuk BONDED. Vendor wajib melampirkan dokumen LS & HS Code saat submit invoice.</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[["bc20","BC 2.0"],["bc23","BC 2.3"],["bc262","BC 2.6.2"],["bc27","BC 2.7"],["bc40","BC 4.0"]].map(([k,label])=>(
                        <button key={k} onClick={async ()=>{
                          try { const r = await api.post(`/pos/${detail.id}/create-customs/${k}`); toast.success(`${label} dibuat`); window.location.href = `/customs?edit=${r.data.id}`; }
                          catch(e){ toast.error(e.response?.data?.detail); }
                        }} data-testid={`po-create-${k}`} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700">Buat {label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {detail.status === "completed" && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded" data-testid="rate-vendor-section">
                    <div className="label-tiny text-amber-800">Vendor Performance Rating</div>
                    {detail.vendor_rating ? (
                      <div className="mt-2 text-sm">
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map(n=>(<Star key={n} size={16} className={n <= detail.vendor_rating ? "text-amber-500 fill-amber-500" : "text-slate-300"}/>))}
                          <span className="ml-2 font-semibold">{detail.vendor_rating}/5</span>
                        </div>
                        {detail.vendor_rating_note && <div className="text-xs text-slate-600 mt-1">"{detail.vendor_rating_note}"</div>}
                        <button className="text-xs text-blue-600 mt-2" onClick={()=>setRating(0)} data-testid="rate-vendor-edit">Ubah rating</button>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map(n=>(
                            <button key={n} onClick={()=>setRating(n)} data-testid={`rate-star-${n}`}>
                              <Star size={22} className={n <= rating ? "text-amber-500 fill-amber-500" : "text-slate-300"}/>
                            </button>
                          ))}
                          {rating>0 && <span className="ml-2 text-sm font-semibold">{rating}/5</span>}
                        </div>
                        <input type="text" placeholder="Catatan (opsional)" value={ratingNote} onChange={e=>setRatingNote(e.target.value)} className="w-full text-sm border border-slate-200 rounded px-2 py-1" data-testid="rate-note"/>
                        <button disabled={!rating} onClick={submitRating} className="text-sm bg-slate-900 text-white px-3 py-1.5 rounded disabled:opacity-50" data-testid="rate-submit">Simpan Rating</button>
                      </div>
                    )}
                  </div>
                )}
                {/* Chat */}
                <div className="border border-slate-200 rounded p-3" data-testid="po-chat">
                  <div className="flex items-center gap-2 mb-2"><MessageSquare size={14}/><div className="label-tiny">Chat Buyer ↔ Vendor</div></div>
                  <div className="max-h-64 overflow-y-auto space-y-2 mb-2">
                    {messages.length === 0 && <div className="text-xs text-slate-400 text-center py-4">Belum ada pesan</div>}
                    {messages.map(m=>(
                      <div key={m.id} className={`text-sm p-2 rounded ${m.side==="vendor"?"bg-blue-50 mr-8":"bg-slate-100 ml-8"}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m.user_name} · {m.user_role} · {new Date(m.created_at).toLocaleString("id-ID")}</div>
                        <div className="mt-0.5">{m.text}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>e.key==="Enter" && sendMsg()} placeholder="Tulis pesan…" className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5" data-testid="po-chat-input"/>
                    <Button size="sm" onClick={sendMsg} data-testid="po-chat-send"><Send size={12}/></Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
