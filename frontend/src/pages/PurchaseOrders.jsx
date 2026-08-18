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
import { Merge, Check, X, Eye, Send, Download, Star, Printer, MessageSquare } from "lucide-react";

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
  const [selected, setSelected] = useState({});
  const [form, setForm] = useState({ po_type: "LOCAL", tax_percent: 11, projects: [] });
  const [rating, setRating] = useState(0);
  const [ratingNote, setRatingNote] = useState("");

  const load = () => {
    api.get(`/pos?page=${page}&page_size=20&q=${encodeURIComponent(q)}`).then(r=>{ setPos(r.data.items); setTotal(r.data.total); setPages(r.data.pages); });
    api.get("/prs?page_size=100&status=approved").then(r=>setPrs(r.data.items || []));
    api.get("/vendors?status=approved&exclude_blacklisted=true").then(r=>setVendors(r.data));
  };
  useEffect(() => { load(); }, [page, q]);

  const selectedIds = Object.keys(selected).filter(k=>selected[k]);

  const createPO = async () => {
    try {
      await api.post("/pos", { ...form, pr_ids: selectedIds });
      toast.success("PO dibuat"); setMergeOpen(false); setSelected({}); setForm({po_type:"LOCAL"}); load();
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
          <Button onClick={()=>setMergeOpen(true)} data-testid="po-merge-btn"><Merge size={14}/> Merge PR → PO</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Cari nomor PO…" value={q} onChange={e=>{setPage(1); setQ(e.target.value);}} className="max-w-md" data-testid="po-search"/>
        <div className="text-xs text-slate-500 ml-auto">{total} PO · Hal {page}/{pages || 1}</div>
        <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} data-testid="po-prev">‹</Button>
        <Button variant="outline" size="sm" disabled={page>=pages} onClick={()=>setPage(p=>p+1)} data-testid="po-next">›</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
                    <tbody>{detail.items?.map((it,i)=>(<tr key={i}><td>{i+1}</td><td className="font-mono text-xs">[{it.product_id?.slice(0,8)}] {it.product_name}</td><td className="text-xs">{it.product_name}</td><td className="text-xs">{(detail.projects||[]).join(",")}</td><td>{it.qty}</td><td className="font-mono">{fmtIDR(it.price)}</td><td className="text-xs">PPN {detail.tax_percent||11}%</td><td className="font-mono">{fmtIDR(it.subtotal)}</td></tr>))}</tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <div className="w-64 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Untaxed Amount</span><span className="font-mono">{fmtIDR(detail.untaxed_amount || detail.total)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">DPP Nilai Lain</span><span className="font-mono">{fmtIDR(detail.dpp_nilai_lain || 0)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Amount Tax ({detail.tax_percent||0}%)</span><span className="font-mono">{fmtIDR(detail.amount_tax || 0)}</span></div>
                    <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Amount Total</span><span className="font-mono">{fmtIDR(detail.amount_total || detail.total)}</span></div>
                  </div>
                </div>
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
