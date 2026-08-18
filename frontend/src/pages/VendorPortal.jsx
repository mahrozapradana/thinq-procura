import React, { Fragment, useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, XCircle, Plus, FileUp, Upload, Eye, Clock, Save, Paperclip, X, Info, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import Pagination from "@/components/Pagination";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useDataTable } from "@/components/useDataTable";
import Countdown from "@/components/Countdown";
import InvoiceDetailSheet from "@/components/InvoiceDetailSheet";

const API_URL = process.env.REACT_APP_BACKEND_URL;
async function uploadFile(file) {
  const t = localStorage.getItem("access_token");
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_URL}/api/uploads/ls`, {
    method: "POST",
    credentials: "include",
    headers: t ? { Authorization: `Bearer ${t}` } : {},
    body: fd,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail || "Upload gagal");
  return d;
}

const STATUS = {
  open:"bg-emerald-100 text-emerald-700", closed:"bg-amber-100 text-amber-700", awarded:"bg-blue-100 text-blue-700",
  submitted:"bg-blue-100 text-blue-700", declined:"bg-slate-100 text-slate-700",
  outstanding:"bg-amber-100 text-amber-700", paid:"bg-emerald-100 text-emerald-700",
  draft:"bg-slate-100 text-slate-700", pending_approval:"bg-amber-100 text-amber-700",
  approved:"bg-emerald-100 text-emerald-700", sent:"bg-blue-100 text-blue-700",
  partial:"bg-amber-100 text-amber-700", completed:"bg-emerald-100 text-emerald-700",
};

function PODetailSheet({ poId, onClose }) {
  const [po, setPo] = useState(null);
  useEffect(()=>{
    if(!poId) return;
    setPo(null);
    api.get(`/vendor-portal/pos/${poId}`).then(r=>setPo(r.data)).catch(()=>{});
  }, [poId]);
  return (
    <Sheet open={!!poId} onOpenChange={(v)=>!v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white" data-testid="vendor-po-detail">
        {!po ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">#{po.po_number}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><div className="label-tiny">Type</div><div><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${po.po_type==="BONDED"?"bg-blue-100 text-blue-700":"bg-slate-100"}`}>{po.po_type}</span></div></div>
                <div><div className="label-tiny">Status</div><div><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[po.status]||"bg-slate-100"}`}>{po.status}</span></div></div>
                <div><div className="label-tiny">Order Date</div><div>{po.order_date ? new Date(po.order_date).toLocaleDateString("id-ID") : "-"}</div></div>
                <div><div className="label-tiny">Delivery Date</div><div>{po.delivery_date || "-"}</div></div>
                <div><div className="label-tiny">Payment Terms</div><div>{po.payment_terms || "-"}</div></div>
                <div><div className="label-tiny">Shipping</div><div className="uppercase text-xs">{po.shipping_status}</div></div>
              </div>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {(po.items||[]).map((it,i)=>(
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td className="text-xs">{it.product_name || it.product_id}</td>
                        <td>{it.qty}</td>
                        <td className="font-mono">{fmtIDR(it.price)}</td>
                        <td className="font-mono">{fmtIDR(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-72 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal (untaxed)</span><span className="font-mono">{fmtIDR(po.untaxed_amount || po.total)}</span></div>
                  {(po.tax_breakdown||[]).map((tx,i)=>(
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-500">{tx.name} ({tx.rate}%){tx.tax_type==="withholding"?" — potongan":""}</span>
                      <span className="font-mono">{tx.tax_type==="withholding"?"-":"+"}{fmtIDR(Math.abs(tx.amount))}</span>
                    </div>
                  ))}
                  {(!po.tax_breakdown || po.tax_breakdown.length===0) && po.amount_tax>0 && (
                    <div className="flex justify-between"><span className="text-slate-500">Pajak ({po.tax_percent||0}%)</span><span className="font-mono">+{fmtIDR(po.amount_tax)}</span></div>
                  )}
                  {po.dpp_nilai_lain>0 && <div className="flex justify-between"><span className="text-slate-500">DPP Nilai Lain</span><span className="font-mono">{fmtIDR(po.dpp_nilai_lain)}</span></div>}
                  <div className="flex justify-between border-t pt-1 mt-1 font-bold"><span>Grand Total</span><span className="font-mono">{fmtIDR(po.amount_total || po.total)}</span></div>
                </div>
              </div>
              {po.notes && <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs"><div className="label-tiny mb-1">Catatan</div>{po.notes}</div>}
              <div className="text-[10px] text-slate-400 italic">Read-only view. Untuk pertanyaan gunakan chat pada PO (tersedia setelah PO disetujui).</div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function VendorHome() {
  const [pos, setPos] = useState([]);
  const [inv, setInv] = useState([]);
  const [tenders, setTenders] = useState([]);
  useEffect(()=>{
    api.get("/vendor-portal/pos").then(r=>setPos(r.data));
    api.get("/vendor-portal/invoices").then(r=>setInv(r.data));
    api.get("/vendor-portal/tenders").then(r=>setTenders(r.data));
  },[]);
  const outstanding = inv.filter(i=>i.status==="outstanding").reduce((s,i)=>s+i.amount,0);
  return (
    <div className="space-y-6" data-testid="vendor-home">
      <div>
        <div className="label-tiny">Vendor Portal</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Welcome Back</h1>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded p-5"><div className="label-tiny">Active PO</div><div className="font-heading text-3xl font-bold mt-2">{pos.length}</div></div>
        <div className="bg-white border border-slate-200 rounded p-5"><div className="label-tiny">Outstanding Invoice</div><div className="font-heading text-xl font-bold mt-2">{fmtIDR(outstanding)}</div></div>
        <div className="bg-white border border-slate-200 rounded p-5"><div className="label-tiny">Tender Aktif</div><div className="font-heading text-3xl font-bold mt-2">{tenders.filter(t=>t.status==="open").length}</div></div>
        <div className="bg-slate-900 text-white rounded p-5"><div className="label-tiny text-white/70">Portal</div><div className="font-heading text-xl font-bold mt-2 leading-tight">Bidding, invoice & LS<br/>satu tempat.</div></div>
      </div>
    </div>
  );
}

export function VendorTenders() {
  const [rows, setRows] = useState([]);
  const [bidOn, setBidOn] = useState(null);
  const [bid, setBid] = useState({ items: [], attachments: [] });
  const [suggestions, setSuggestions] = useState({}); // { product_id: {avg,min,max,last,count} }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const load = () => api.get("/vendor-portal/tenders").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  useEffect(()=>{ if(detailId) api.get(`/vendor-portal/tenders/${detailId}`).then(r=>setDetail(r.data)); else setDetail(null); }, [detailId]);
  const openBid = async (t) => {
    const r = await api.get(`/vendor-portal/tenders/${t.id}`);
    const full = r.data;
    setBidOn(full);
    setBid({
      price: full.my_bid?.price || "",
      delivery_days: full.my_bid?.delivery_days || "",
      notes: full.my_bid?.notes || "",
      items: (full.items||[]).map((it, i) => ({
        item_index: i,
        product_id: it.product_id,
        product_name: it.product_name,
        qty_requested: it.qty,
        can_fulfill: full.my_bid?.items?.[i]?.can_fulfill ?? true,
        qty_offered: full.my_bid?.items?.[i]?.qty_offered ?? it.qty,
        price: full.my_bid?.items?.[i]?.price ?? it.price,
        notes: full.my_bid?.items?.[i]?.notes || "",
      })),
      attachments: full.my_bid?.attachments || [],
    });
    // Fetch price suggestions (fair-range) — non-blocking
    setSuggestions({});
    try {
      const s = await api.get(`/vendor-portal/tenders/${t.id}/price-suggestions`);
      setSuggestions(s.data.suggestions || {});
    } catch(e) { /* ignore */ }
  };
  const doSubmit = async (isDraft) => {
    try {
      setSaving(true);
      const totalPrice = bid.items.reduce((s,i)=>s + (i.can_fulfill ? parseFloat(i.price||0)*parseFloat(i.qty_offered||0) : 0), 0);
      await api.post(`/vendor-portal/tenders/${bidOn.id}/bid`, {
        price: totalPrice || parseFloat(bid.price||0),
        delivery_days: parseInt(bid.delivery_days||0),
        notes: bid.notes,
        items: bid.items.map(i=>({ item_index:i.item_index, can_fulfill:i.can_fulfill, qty_offered:parseFloat(i.qty_offered||0), price:parseFloat(i.price||0), notes:i.notes })),
        attachments: bid.attachments || [],
        is_draft: !!isDraft,
      });
      toast.success(isDraft ? "Draft bid disimpan" : "Bid disubmit");
      setBidOn(null); setBid({items:[], attachments:[]}); setSuggestions({}); load();
    } catch(e){ toast.error(e.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };
  const submit = () => doSubmit(false);
  const saveDraft = () => doSubmit(true);
  const uploadAttachment = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("epr-token");
      const res = await fetch(`${API_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload gagal");
      setBid(prev => ({...prev, attachments: [...(prev.attachments||[]), { url: data.url, filename: data.filename, size: data.size, content_type: data.content_type }]}));
      toast.success(`${file.name} terunggah`);
    } catch(e){ toast.error(e.message || "Upload gagal"); }
    finally { setUploading(false); }
  };
  const removeAttachment = (idx) => {
    setBid(prev => ({...prev, attachments: (prev.attachments||[]).filter((_,i)=>i!==idx)}));
  };
  const decline = async (id) => { await api.post(`/vendor-portal/tenders/${id}/decline`); toast.success("Ditolak"); load(); };
  return (
    <div className="space-y-4" data-testid="vendor-tenders">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Tender Tersedia</h1>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No</th><th>Judul</th><th>Deadline</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">Tidak ada tender</td></tr>}
            {rows.map(t=>(
              <tr key={t.id} data-testid={`vt-row-${t.id}`}>
                <td className="font-mono text-xs" data-label="No">{t.tender_number}</td>
                <td data-label="Judul">{t.title}</td>
                <td className="text-xs" data-label="Deadline"><Countdown deadline={t.deadline}/></td>
                <td data-label="Items">{t.items?.length}</td>
                <td data-label="Status"><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[t.status]}`}>{t.status}</span></td>
                <td className="text-right whitespace-nowrap" data-label="Aksi">
                  <button onClick={()=>setDetailId(t.id)} className="p-1 hover:bg-slate-100 rounded" data-testid={`vt-view-${t.id}`}><Eye size={14}/></button>
                  {t.status==="open" && <>
                    <Button size="sm" onClick={()=>openBid(t)} className="ml-1" data-testid={`vt-bid-${t.id}`}><Send size={12}/> Bid</Button>
                    <Button size="sm" variant="outline" onClick={()=>decline(t.id)} className="ml-1" data-testid={`vt-decline-${t.id}`}><XCircle size={12}/> Tolak</Button>
                  </>}
                  {t.awarded_vendor_id && <span className="text-[10px] uppercase font-semibold text-blue-700 ml-1">Awarded</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tender Detail Sheet */}
      <Sheet open={!!detailId} onOpenChange={(v)=>!v && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
          {!detail ? <div className="p-6 text-sm text-slate-500">Memuat...</div> : (
            <>
              <SheetHeader><SheetTitle className="font-mono">{detail.tender_number} — {detail.title}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><div className="label-tiny">Status</div><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[detail.status]}`}>{detail.status}</span></div>
                  <div><div className="label-tiny">Deadline</div><Countdown deadline={detail.deadline} size="md"/></div>
                  {detail.is_sealed && (
                    <div className="col-span-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs" data-testid="vt-sealed-banner">
                      🔒 <b>Sealed Bid Tender</b> — harga kompetitor akan disembunyikan hingga panitia membuka amplop di akhir deadline.
                    </div>
                  )}
                  <div className="col-span-2"><div className="label-tiny">Deskripsi</div>{detail.description || "-"}</div>
                  {(detail.attachments||[]).length > 0 && (
                    <div className="col-span-2" data-testid="vt-detail-attachments">
                      <div className="label-tiny mb-1">Dokumen Pendukung (dari panitia)</div>
                      <ul className="space-y-1">
                        {detail.attachments.map((a,i)=>(
                          <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                            <FileUp size={12} className="text-slate-500"/>
                            <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate flex-1" data-testid={`vt-detail-doc-${i}`}>{a.filename}</a>
                            <span className="text-slate-400">{a.size ? `${(a.size/1024).toFixed(1)} KB` : ""}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="border border-slate-200 rounded overflow-x-auto">
                  <table className="data-table">
                    <thead><tr><th>Item</th><th>Qty</th><th>Est. Harga</th></tr></thead>
                    <tbody>
                      {(detail.items||[]).map((it,i)=>(
                        <tr key={i}><td>{it.product_name}</td><td>{it.qty}</td><td className="font-mono">{fmtIDR(it.price||0)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.my_bid && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs" data-testid="vt-detail-mybid">
                    <b>Bid Anda</b>: Total Rp {(detail.my_bid.price||0).toLocaleString("id-ID")} · {detail.my_bid.delivery_days} hari · Status <b>{detail.my_bid.status}</b>
                    {(detail.my_bid.attachments||[]).length > 0 && (
                      <div className="mt-1">Lampiran: {(detail.my_bid.attachments||[]).map((a,i)=>(
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="underline mr-2">{a.filename}</a>
                      ))}</div>
                    )}
                    {(detail.my_bid.history||[]).length > 0 && (
                      <div className="mt-3 border-t border-blue-200 pt-2">
                        <div className="label-tiny mb-1">Riwayat Revisi Bid ({(detail.my_bid.history||[]).length})</div>
                        <ol className="relative border-l-2 border-blue-200 ml-1 space-y-2">
                          {detail.my_bid.history.map((h,i)=>(
                            <li key={i} className="ml-3 text-[11px]" data-testid={`vt-bid-hist-${i}`}>
                              <div className="absolute -left-[7px] w-3 h-3 bg-white border-2 border-blue-400 rounded-full mt-0.5"></div>
                              <div><b>{fmtIDR(h.price||0)}</b> · {h.delivery_days||"?"} hari · <span className="uppercase">{h.status}</span></div>
                              <div className="text-slate-500">{h.submitted_at ? new Date(h.submitted_at).toLocaleString("id-ID") : ""}</div>
                              {h.notes && <div className="italic text-slate-500">"{h.notes}"</div>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!bidOn} onOpenChange={(v)=>!v && setBidOn(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span>Submit Bid — {bidOn?.tender_number}</span>
              {bidOn?.deadline && <Countdown deadline={bidOn.deadline}/>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="border border-slate-200 rounded overflow-x-auto max-h-72">
              <table className="data-table">
                <thead><tr><th>Item</th><th>Qty Diminta</th><th>Sanggup</th><th>Qty Sanggup</th><th>Harga/Unit</th><th>Rentang Wajar</th><th>Catatan</th></tr></thead>
                <tbody>
                  {bid.items.map((it,i)=>{
                    const s = suggestions[it.product_id];
                    const price = parseFloat(it.price||0);
                    let priceHint = null;
                    if (s && s.count > 0) {
                      if (price > 0 && s.max && price > s.max * 1.15) priceHint = { cls: "text-red-600", text: `↑ ${((price/s.avg-1)*100).toFixed(0)}% di atas rata-rata` };
                      else if (price > 0 && s.min && price < s.min * 0.85) priceHint = { cls: "text-amber-600", text: `↓ ${((1-price/s.avg)*100).toFixed(0)}% di bawah rata-rata` };
                      else if (price > 0) priceHint = { cls: "text-emerald-600", text: "Dalam rentang wajar" };
                    }
                    return (
                      <tr key={i}>
                        <td className="text-xs">{it.product_name}</td>
                        <td className="text-xs">{it.qty_requested}</td>
                        <td><input type="checkbox" checked={it.can_fulfill} onChange={e=>{const items=[...bid.items];items[i]={...items[i],can_fulfill:e.target.checked};setBid({...bid,items});}} data-testid={`vt-bid-fulfill-${i}`}/></td>
                        <td><Input type="number" value={it.qty_offered} disabled={!it.can_fulfill} onChange={e=>{const items=[...bid.items];items[i]={...items[i],qty_offered:e.target.value};setBid({...bid,items});}} className="h-8 text-xs w-20" data-testid={`vt-bid-qty-${i}`}/></td>
                        <td>
                          <Input type="number" value={it.price} disabled={!it.can_fulfill} onChange={e=>{const items=[...bid.items];items[i]={...items[i],price:e.target.value};setBid({...bid,items});}} className="h-8 text-xs w-28 font-mono" data-testid={`vt-bid-price-${i}`}/>
                          {priceHint && <div className={`text-[10px] mt-0.5 ${priceHint.cls}`} data-testid={`vt-bid-hint-${i}`}>{priceHint.text}</div>}
                        </td>
                        <td className="text-[10px] font-mono leading-tight" data-testid={`vt-bid-range-${i}`}>
                          {s && s.count > 0 ? (
                            <div className="space-y-0.5">
                              <div className="text-emerald-700">avg {fmtIDR(s.avg)}</div>
                              <div className="text-slate-500">min {fmtIDR(s.min)} · max {fmtIDR(s.max)}</div>
                              <div className="text-slate-400">{s.count} PO histori</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Belum ada histori</span>
                          )}
                        </td>
                        <td><Input value={it.notes} disabled={!it.can_fulfill} onChange={e=>{const items=[...bid.items];items[i]={...items[i],notes:e.target.value};setBid({...bid,items});}} className="h-8 text-xs" data-testid={`vt-bid-notes-${i}`}/></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-sm font-heading font-bold">
              Total Bid: <span className="ml-2 font-mono" data-testid="vt-bid-total">{fmtIDR(bid.items.reduce((s,i)=>s+(i.can_fulfill?parseFloat(i.price||0)*parseFloat(i.qty_offered||0):0),0))}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Estimasi Pengiriman (hari)</Label><Input type="number" value={bid.delivery_days||""} onChange={e=>setBid({...bid,delivery_days:e.target.value})} data-testid="vt-bid-days"/></div>
              <div><Label className="label-tiny">Catatan Umum</Label><Input value={bid.notes||""} onChange={e=>setBid({...bid,notes:e.target.value})} data-testid="vt-bid-notes-all"/></div>
            </div>
            {/* Attachments */}
            <div className="border border-dashed border-slate-300 rounded p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <Label className="label-tiny flex items-center gap-1"><Paperclip size={12}/> Lampiran (Spec, Brosur, Proposal)</Label>
                <label className="cursor-pointer">
                  <input type="file" className="hidden" data-testid="vt-bid-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={e=>{const f=e.target.files?.[0]; if(f){uploadAttachment(f); e.target.value="";}}} disabled={uploading}/>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${uploading?"bg-slate-200 text-slate-500":"bg-blue-600 text-white hover:bg-blue-700"}`} data-testid="vt-bid-upload-btn">
                    <Upload size={12}/>{uploading?"Mengunggah...":"Tambah File"}
                  </span>
                </label>
              </div>
              {(bid.attachments||[]).length === 0 ? (
                <div className="text-xs text-slate-400 italic">Belum ada lampiran. PDF/JPG/DOCX maks 10MB.</div>
              ) : (
                <ul className="space-y-1" data-testid="vt-bid-attach-list">
                  {(bid.attachments||[]).map((a,i)=>(
                    <li key={i} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1">
                      <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate max-w-md">{a.filename}</a>
                      <button onClick={()=>removeAttachment(i)} className="text-slate-400 hover:text-red-600" data-testid={`vt-bid-attach-rm-${i}`}><X size={14}/></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {bidOn?.my_bid?.status === "draft" && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2" data-testid="vt-bid-draft-loaded">
                <Info size={12}/> Memuat draft yang tersimpan — silakan lanjutkan atau submit.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={saveDraft} disabled={saving} data-testid="vt-bid-save-draft"><Save size={14}/> Simpan Draft</Button>
            <Button onClick={submit} disabled={saving} data-testid="vt-bid-submit"><Send size={14}/> Submit Bid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VendorPOs() {
  const [rows, setRows] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = () => api.get("/vendor-portal/pos").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  const dt = useDataTable(rows, { storageKey: "vendor-pos", defaultSort: { key: "created_at", dir: "desc" } });
  const total = dt.sortedRows.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = dt.sortedRows.slice((page-1)*perPage, page*perPage);
  const acknowledge = async (id) => {
    try { await api.post(`/vendor-portal/pos/${id}/acknowledge`); toast.success("PO dikonfirmasi"); load(); }
    catch(e){ toast.error(e.response?.data?.detail || "Gagal"); }
  };
  const bulkAck = async (ids, clear) => {
    let done = 0;
    for (const id of ids) { try { await api.post(`/vendor-portal/pos/${id}/acknowledge`); done++; } catch {} }
    toast.success(`${done}/${ids.length} PO dikonfirmasi`);
    clear(); load();
  };
  return (
    <div className="space-y-4" data-testid="vendor-pos">
      <div className="flex justify-between items-end">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Purchase Orders Saya</h1>
        <ExportCsvButton rows={rows} filename="vendor-pos" columns={[
          {key:"po_number",label:"No PO"},{key:"po_type",label:"Type"},{key:"amount_total",label:"Grand Total"},
          {key:"status",label:"Status"},{key:"shipping_status",label:"Shipping"},{key:"vendor_acknowledged",label:"Diakui"},
        ]}/>
      </div>
      <p className="text-xs text-slate-500">Hanya PO yang sudah disetujui procurement & ditujukan pada perusahaan Anda. Read-only.</p>
      <dt.SavedViewsBar/>
      <dt.BulkToolbar actions={[
        { key: "ack", label: "✓ Konfirmasi Semua", onClick: bulkAck },
        { key: "export", label: "Export Terpilih", className: "bg-blue-500 hover:bg-blue-600 text-white", onClick: (ids)=>{
          const sel = rows.filter(r=>ids.includes(r.id));
          const csv = "po_number,total,status\n" + sel.map(r=>`${r.po_number},${r.amount_total||r.total},${r.status}`).join("\n");
          const blob = new Blob([csv], {type:"text/csv"});
          const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="pos-selected.csv"; a.click();
        }},
      ]}/>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{width:32}}><dt.SelectAllCheckbox/></th>
              <dt.SortHeader k="po_number">No PO</dt.SortHeader>
              <dt.SortHeader k="po_type">Type</dt.SortHeader>
              <dt.SortHeader k="amount_total">Grand Total</dt.SortHeader>
              <dt.SortHeader k="status">Status</dt.SortHeader>
              <dt.SortHeader k="shipping_status">Shipping</dt.SortHeader>
              <th>Ack</th>
              <th></th>
            </tr>
            <dt.FilterRow cols={[{filter:false},{key:"po_number",label:"No PO"},{key:"po_type",label:"Type"},{filter:false},{key:"status",label:"Status"},{key:"shipping_status",label:"Ship"},{filter:false},{filter:false}]}/>
          </thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400">Belum ada PO aktif</td></tr>}
            {paged.map(p=>(
              <tr key={p.id} data-testid={`vpo-row-${p.id}`}>
                <td className="font-mono text-xs">{p.po_number}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${p.po_type==="BONDED"?"bg-blue-100 text-blue-700":"bg-slate-100"}`}>{p.po_type}</span></td>
                <td className="font-mono text-xs">{fmtIDR(p.untaxed_amount || p.total)}</td>
                <td className="text-xs">{(p.taxes_snapshot||[]).map(t=>t.code).join(", ") || (p.tax_percent?`PPN ${p.tax_percent}%`:"-")}</td>
                <td className="font-mono font-semibold">{fmtIDR(p.amount_total || p.total)}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[p.status]||"bg-slate-100"}`}>{p.status}</span></td>
                <td className="text-xs">{p.vendor_acknowledged ? <span className="text-emerald-700 font-semibold">✓ Diakui</span> : <span className="text-slate-400">Belum</span>}</td>
                <td className="text-xs">{p.shipping_status}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={()=>setDetailId(p.id)} className="p-1 hover:bg-slate-100 rounded" data-testid={`vpo-view-${p.id}`}><Eye size={14}/></button>
                  {(p.status==="approved" || p.status==="sent") && !p.vendor_acknowledged && (
                    <button onClick={()=>acknowledge(p.id)} className="ml-1 text-[10px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold" data-testid={`vpo-ack-${p.id}`}>Konfirmasi Terima</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} perPage={perPage}/>
      </div>
      <PODetailSheet poId={detailId} onClose={()=>setDetailId(null)} />
    </div>
  );
}

export function VendorRFQs() {
  const [rows, setRows] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [replyFor, setReplyFor] = useState(null);
  const [reply, setReply] = useState({ can_fulfill: true, items: [], delivery_days: "", overall_notes: "" });
  const [page, setPage] = useState(1);
  const perPage = 10;
  const load = () => api.get("/vendor-portal/rfqs").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = rows.slice((page-1)*perPage, page*perPage);

  const openReply = async (po) => {
    // fetch fresh detail so we can iterate items
    const r = await api.get(`/vendor-portal/pos/${po.id}`);
    const full = r.data;
    setReplyFor(full);
    setReply({
      can_fulfill: true,
      delivery_days: "",
      overall_notes: full.vendor_reply?.overall_notes || "",
      items: (full.items||[]).map((it, i) => ({
        item_index: i,
        original_price: it.price,
        product_name: it.product_name,
        qty: it.qty,
        price: full.vendor_reply?.items?.[i]?.price ?? it.price,
        discount_type: full.vendor_reply?.items?.[i]?.discount_type || "",
        discount_value: full.vendor_reply?.items?.[i]?.discount_value ?? 0,
        notes: full.vendor_reply?.items?.[i]?.notes || "",
      })),
    });
  };

  const submitReply = async () => {
    try {
      await api.post(`/vendor-portal/rfqs/${replyFor.id}/reply`, {
        can_fulfill: reply.can_fulfill,
        delivery_days: reply.delivery_days ? parseInt(reply.delivery_days) : null,
        overall_notes: reply.overall_notes,
        items: reply.items.map(i => ({
          item_index: i.item_index,
          price: parseFloat(i.price||0),
          discount_type: i.discount_type || null,
          discount_value: parseFloat(i.discount_value||0),
          notes: i.notes,
        })),
      });
      toast.success("Balasan harga terkirim ke buyer");
      setReplyFor(null);
      load();
    } catch(e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  // Compute per-row totals & grand total after discount for the vendor to preview
  const computeRow = (it) => {
    const subtotal = (parseFloat(it.price||0) * parseFloat(it.qty||0));
    let disc = 0;
    const dv = parseFloat(it.discount_value||0);
    if (dv > 0 && it.discount_type === "percent") disc = subtotal * dv / 100;
    else if (dv > 0 && it.discount_type === "amount") disc = dv * parseFloat(it.qty||0);
    disc = Math.max(0, Math.min(disc, subtotal));
    return { subtotal, discount: disc, after: subtotal - disc };
  };
  const grandTotals = reply.items.reduce((acc, it) => {
    const c = computeRow(it);
    acc.subtotal += c.subtotal; acc.discount += c.discount; acc.after += c.after;
    return acc;
  }, { subtotal: 0, discount: 0, after: 0 });

  return (
    <div className="space-y-4" data-testid="vendor-rfqs">
      <div>
        <div className="label-tiny">Vendor Portal</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">RFQ / PO Menunggu Persetujuan</h1>
        <p className="text-sm text-slate-600 mt-1">PO yang belum final — Anda dapat mengirim konfirmasi / counter harga sebelum buyer men-approve internal.</p>
      </div>
      <div className="flex justify-end">
        <ExportCsvButton rows={rows} filename="vendor-rfqs" columns={[
          {key:"po_number",label:"No RFQ/PO"},{key:"po_type",label:"Type"},{key:"amount_total",label:"Grand Total"},
          {key:"status",label:"Status"},{label:"Balasan",get:p=>p.vendor_reply?"Dibalas":"Belum"},
        ]}/>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No RFQ / PO</th><th>Type</th><th>Untaxed</th><th>Pajak</th><th>Grand Total</th><th>Status</th><th>Balasan</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Tidak ada RFQ / PO menunggu</td></tr>}
            {paged.map(p=>(
              <tr key={p.id} data-testid={`vrfq-row-${p.id}`}>
                <td className="font-mono text-xs">{p.po_number}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${p.po_type==="BONDED"?"bg-blue-100 text-blue-700":"bg-slate-100"}`}>{p.po_type}</span></td>
                <td className="font-mono text-xs">{fmtIDR(p.untaxed_amount || p.total)}</td>
                <td className="text-xs">{(p.taxes_snapshot||[]).map(t=>t.code).join(", ") || (p.tax_percent?`PPN ${p.tax_percent}%`:"-")}</td>
                <td className="font-mono font-semibold">{fmtIDR(p.amount_total || p.total)}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[p.status]||"bg-slate-100"}`}><Clock size={10} className="inline mr-1"/>{p.status}</span></td>
                <td className="text-xs">{p.vendor_reply ? <span className="text-blue-700 font-semibold">✓ Dibalas</span> : <span className="text-slate-400">Belum</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={()=>setDetailId(p.id)} className="p-1 hover:bg-slate-100 rounded" data-testid={`vrfq-view-${p.id}`}><Eye size={14}/></button>
                  <button onClick={()=>openReply(p)} className="ml-1 text-[10px] px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-semibold" data-testid={`vrfq-reply-${p.id}`}>Balas Harga</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} perPage={perPage}/>
      </div>
      <PODetailSheet poId={detailId} onClose={()=>setDetailId(null)} />

      <Dialog open={!!replyFor} onOpenChange={(v)=>!v && setReplyFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Balas Harga — {replyFor?.po_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-4 items-center text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={reply.can_fulfill} onChange={()=>setReply({...reply, can_fulfill: true})} data-testid="rfq-reply-canfulfill"/>
                Bisa penuhi (konfirmasi / counter harga)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={!reply.can_fulfill} onChange={()=>setReply({...reply, can_fulfill: false})} data-testid="rfq-reply-decline"/>
                Tidak bisa penuhi (tolak)
              </label>
            </div>
            {reply.can_fulfill && (
              <div className="border border-slate-200 rounded overflow-x-auto max-h-[420px]">
                <table className="data-table">
                  <thead><tr><th>Item</th><th className="text-right">Qty</th><th className="text-right">Original</th><th className="text-right">Counter</th><th>Diskon</th><th className="text-right">Subtotal Net</th><th>Catatan</th></tr></thead>
                  <tbody>
                    {reply.items.map((it, i) => {
                      const c = computeRow(it);
                      return (
                        <tr key={i}>
                          <td className="text-xs">{it.product_name}</td>
                          <td className="text-right">{it.qty}</td>
                          <td className="font-mono text-xs text-slate-400 text-right">{fmtIDR(it.original_price)}</td>
                          <td><Input type="number" value={it.price} onChange={e=>{
                            const items=[...reply.items]; items[i]={...items[i], price: e.target.value}; setReply({...reply, items});
                          }} className="h-8 text-xs w-28 font-mono text-right" data-testid={`rfq-item-price-${i}`}/></td>
                          <td>
                            <div className="flex gap-1 items-center">
                              <Select value={it.discount_type || "none"} onValueChange={v=>{
                                const items=[...reply.items]; items[i]={...items[i], discount_type: v==="none"?"":v, discount_value: v==="none"?0:items[i].discount_value}; setReply({...reply, items});
                              }}>
                                <SelectTrigger className="h-8 text-xs w-24" data-testid={`rfq-item-disc-type-${i}`}><SelectValue/></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">- Tidak -</SelectItem>
                                  <SelectItem value="percent">Persen (%)</SelectItem>
                                  <SelectItem value="amount">Rp / unit</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input type="number" min="0" value={it.discount_value||0} disabled={!it.discount_type} onChange={e=>{
                                const items=[...reply.items]; items[i]={...items[i], discount_value: e.target.value}; setReply({...reply, items});
                              }} className="h-8 text-xs w-20 font-mono" data-testid={`rfq-item-disc-val-${i}`}/>
                            </div>
                            {c.discount > 0 && <div className="text-[10px] text-red-600 mt-0.5">- {fmtIDR(c.discount)}</div>}
                          </td>
                          <td className="text-right font-mono text-xs font-semibold" data-testid={`rfq-item-net-${i}`}>{fmtIDR(c.after)}</td>
                          <td><Input value={it.notes} onChange={e=>{
                            const items=[...reply.items]; items[i]={...items[i], notes: e.target.value}; setReply({...reply, items});
                          }} className="h-8 text-xs" data-testid={`rfq-item-notes-${i}`}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-semibold text-xs">
                      <td colSpan={2}>Total</td>
                      <td></td>
                      <td className="text-right font-mono" data-testid="rfq-total-subtotal">{fmtIDR(grandTotals.subtotal)}</td>
                      <td className="text-right font-mono text-red-600" data-testid="rfq-total-discount">- {fmtIDR(grandTotals.discount)}</td>
                      <td className="text-right font-mono text-emerald-700" data-testid="rfq-total-after">{fmtIDR(grandTotals.after)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Estimasi Pengiriman (hari)</Label><Input type="number" value={reply.delivery_days} onChange={e=>setReply({...reply, delivery_days: e.target.value})} data-testid="rfq-reply-days"/></div>
              <div className="col-span-1"><Label className="label-tiny">Catatan Umum</Label><Textarea value={reply.overall_notes} onChange={e=>setReply({...reply, overall_notes: e.target.value})} data-testid="rfq-reply-notes"/></div>
            </div>
          </div>
          <DialogFooter><Button onClick={submitReply} data-testid="rfq-reply-submit">Kirim Balasan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VendorShipments() {
  const [rows, setRows] = useState([]);
  const [records, setRecords] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ items: [], shipping_pricelist: [{name:"Ongkir", qty:1, unit_price:0}], attachments: [] });
  const [saving, setSaving] = useState(false);
  const load = () => {
    api.get("/vendor-portal/shipments").then(r=>setRows(r.data));
    api.get("/vendor-portal/shipments/records").then(r=>setRecords(r.data));
  };
  useEffect(()=>{ load(); },[]);
  const openFor = async (po) => {
    const r = await api.get(`/vendor-portal/pos/${po.id}`);
    const full = r.data;
    setForm({
      po_id: po.id,
      po_number: po.po_number,
      po_items: full.items || [],
      items: (full.items||[]).map((it, i) => ({ po_item_index: i, product_name: it.product_name, qty_ordered: it.qty, qty_shipped: it.qty, active: true })),
      shipping_pricelist: [{name:"Ongkir", qty:1, unit_price:0}],
      attachments: [],
      currency: full.currency || "IDR",
    });
    setOpen(true);
  };
  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/vendor-portal/shipments", {
        po_id: form.po_id,
        tracking_number: form.tracking_number,
        carrier: form.carrier,
        shipped_date: form.shipped_date,
        expected_arrival: form.expected_arrival,
        items: form.items.filter(i=>i.active).map(i=>({ po_item_index: i.po_item_index, qty_shipped: parseFloat(i.qty_shipped||0) })),
        shipping_cost: parseFloat(form.shipping_cost||0),
        shipping_pricelist: (form.shipping_pricelist||[]).filter(p=>p.name).map(p=>({name:p.name, qty:parseFloat(p.qty||1), unit_price:parseFloat(p.unit_price||0)})),
        currency: form.currency || "IDR",
        notes: form.notes,
        attachments: form.attachments,
      });
      toast.success("Data pengiriman tersimpan");
      setOpen(false); setForm({items:[], shipping_pricelist:[], attachments:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail || "Gagal"); }
    finally { setSaving(false); }
  };
  const plTotal = (form.shipping_pricelist||[]).reduce((s,p)=>s+parseFloat(p.qty||0)*parseFloat(p.unit_price||0),0);
  return (
    <div className="space-y-4" data-testid="vendor-shipments">
      <div className="flex justify-between items-end">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Pengiriman</h1>
      </div>
      <div>
        <div className="label-tiny mb-2">PO yang perlu dikirim</div>
        <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>No PO</th><th>Type</th><th>Delivery Date</th><th>Shipping</th><th></th></tr></thead>
            <tbody>
              {rows.length===0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400">Semua sudah dikirim</td></tr>}
              {rows.map(p=>(
                <tr key={p.id} data-testid={`vsh-row-${p.id}`}>
                  <td className="font-mono text-xs">{p.po_number}</td>
                  <td>{p.po_type}</td>
                  <td className="text-xs">{p.delivery_date||"-"}</td>
                  <td className="text-xs uppercase font-semibold">{p.shipping_status}</td>
                  <td className="text-right"><Button size="sm" onClick={()=>openFor(p)} data-testid={`vsh-create-${p.id}`}>Buat Pengiriman</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="label-tiny mb-2">Riwayat Pengiriman ({records.length})</div>
        <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>No Shipment</th><th>PO</th><th>Carrier</th><th>Tracking</th><th>Shipped</th><th>ETA</th><th>Cost</th><th>Status</th></tr></thead>
            <tbody>
              {records.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada pengiriman</td></tr>}
              {records.map(s=>(
                <tr key={s.id} data-testid={`vsh-rec-${s.id}`}>
                  <td className="font-mono text-xs">{s.shipment_number}</td>
                  <td className="font-mono text-xs">{s.po_number}</td>
                  <td className="text-xs">{s.carrier||"-"}</td>
                  <td className="font-mono text-xs">{s.tracking_number||"-"}</td>
                  <td className="text-xs">{s.shipped_date||"-"}</td>
                  <td className="text-xs">{s.expected_arrival||"-"}</td>
                  <td className="font-mono text-xs">{s.currency} {(s.shipping_cost||0).toLocaleString("id-ID")}</td>
                  <td><span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Buat Pengiriman — {form.po_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Carrier / Ekspedisi</Label><Input value={form.carrier||""} onChange={e=>setForm({...form, carrier:e.target.value})} data-testid="vsh-carrier" placeholder="JNE / DHL / Sicepat..."/></div>
              <div><Label className="label-tiny">No Resi / Tracking</Label><Input value={form.tracking_number||""} onChange={e=>setForm({...form, tracking_number:e.target.value})} data-testid="vsh-tracking"/></div>
              <div><Label className="label-tiny">Tanggal Kirim</Label><Input type="date" value={form.shipped_date||""} onChange={e=>setForm({...form, shipped_date:e.target.value})} data-testid="vsh-shipped"/></div>
              <div><Label className="label-tiny">Estimasi Tiba</Label><Input type="date" value={form.expected_arrival||""} onChange={e=>setForm({...form, expected_arrival:e.target.value})} data-testid="vsh-eta"/></div>
            </div>
            <div>
              <Label className="label-tiny">Item yang Dikirim</Label>
              <div className="border border-slate-200 rounded overflow-x-auto mt-1">
                <table className="data-table">
                  <thead><tr><th></th><th>Produk</th><th className="text-right">Qty PO</th><th className="text-right">Qty Kirim</th></tr></thead>
                  <tbody>
                    {(form.items||[]).map((it, i)=>(
                      <tr key={i} data-testid={`vsh-item-${i}`}>
                        <td><input type="checkbox" checked={it.active} onChange={e=>{const items=[...form.items];items[i]={...items[i],active:e.target.checked};setForm({...form,items});}}/></td>
                        <td className="text-xs">{it.product_name}</td>
                        <td className="text-right text-slate-500">{it.qty_ordered}</td>
                        <td className="text-right"><Input type="number" min="0" step="0.01" value={it.qty_shipped} disabled={!it.active} onChange={e=>{const items=[...form.items];items[i]={...items[i],qty_shipped:e.target.value};setForm({...form,items});}} className="h-8 text-xs w-24 font-mono ml-auto" data-testid={`vsh-qty-${i}`}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="label-tiny">Pricelist Ongkir / Handling</Label>
                <Button size="sm" variant="outline" onClick={()=>setForm({...form, shipping_pricelist:[...(form.shipping_pricelist||[]), {name:"",qty:1,unit_price:0}]})} data-testid="vsh-pl-add"><Plus size={12}/> Baris</Button>
              </div>
              <div className="border border-slate-200 rounded p-2 space-y-1">
                {(form.shipping_pricelist||[]).map((p,i)=>(
                  <div key={i} className="grid grid-cols-12 gap-2" data-testid={`vsh-pl-${i}`}>
                    <Input className="col-span-5 h-8 text-xs" placeholder="Deskripsi (Ongkir, Handling...)" value={p.name} onChange={e=>{const pl=[...form.shipping_pricelist];pl[i]={...pl[i],name:e.target.value};setForm({...form, shipping_pricelist:pl});}}/>
                    <Input className="col-span-2 h-8 text-xs" type="number" placeholder="Qty" value={p.qty} onChange={e=>{const pl=[...form.shipping_pricelist];pl[i]={...pl[i],qty:e.target.value};setForm({...form, shipping_pricelist:pl});}}/>
                    <Input className="col-span-4 h-8 text-xs font-mono" type="number" placeholder="Harga/Unit" value={p.unit_price} onChange={e=>{const pl=[...form.shipping_pricelist];pl[i]={...pl[i],unit_price:e.target.value};setForm({...form, shipping_pricelist:pl});}}/>
                    <button className="col-span-1 text-red-500" onClick={()=>setForm({...form, shipping_pricelist:form.shipping_pricelist.filter((_,idx)=>idx!==i)})}><X size={14}/></button>
                  </div>
                ))}
                <div className="flex justify-end pt-1 text-sm font-semibold border-t border-slate-100">Total Ongkir: <span className="ml-2 font-mono" data-testid="vsh-pl-total">{fmtIDR(plTotal)}</span></div>
              </div>
            </div>
            <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes||""} onChange={e=>setForm({...form, notes:e.target.value})} data-testid="vsh-notes"/></div>
          </div>
          <DialogFooter><Button onClick={submit} disabled={saving} data-testid="vsh-save">Kirim Pengiriman</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function VendorInvoices() {
  const [rows, setRows] = useState([]);
  const [pos, setPos] = useState([]);
  const [ls, setLs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ line_items: [], attachments: [] });
  const [detailId, setDetailId] = useState(null);
  const [billing, setBilling] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [groupBy, setGroupBy] = useState("none");
  const [search, setSearch] = useState("");

  const load = () => {
    api.get("/vendor-portal/invoices").then(r=>setRows(r.data));
    api.get("/vendor-portal/pos").then(r=>setPos(r.data));
    api.get("/vendor-portal/ls-documents").then(r=>setLs(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const uploadFile = async (file, kind) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("epr-token");
      const r = await fetch(`${API_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      if (kind === "faktur") setForm(p=>({...p, faktur_pajak_url:d.url, faktur_pajak_filename:d.filename}));
      else if (kind === "bast") setForm(p=>({...p, bast_url:d.url, bast_filename:d.filename}));
      else setForm(p=>({...p, attachments: [...(p.attachments||[]), { url:d.url, filename:d.filename, size:d.size, content_type:d.content_type, kind:"supporting" }]}));
      toast.success(`${file.name} terunggah`);
    } catch(e){ toast.error(e.message); }
    finally { setUploading(false); }
  };
  const rmAttach = (i) => setForm(p=>({...p, attachments: (p.attachments||[]).filter((_,idx)=>idx!==i)}));

  const pickPO = async (poId) => {
    setForm(p=>({...p, po_id: poId, line_items: []}));
    try {
      const r = await api.get(`/vendor-portal/pos/${poId}/billing-status`);
      setBilling(r.data);
    } catch(e){ toast.error(e.response?.data?.detail); setBilling(null); }
  };
  const toggleLine = (item) => {
    setForm(p => {
      const existing = (p.line_items||[]).find(x => x.po_item_index === item.item_index);
      if (existing) return { ...p, line_items: p.line_items.filter(x => x.po_item_index !== item.item_index) };
      return { ...p, line_items: [...(p.line_items||[]), { po_item_index: item.item_index, qty_billed: item.qty_remaining, unit_price: item.price, discount_amount: 0 }] };
    });
  };
  const updateLine = (idx, key, val) => {
    setForm(p => ({...p, line_items: p.line_items.map(li => li.po_item_index===idx ? {...li, [key]: val} : li)}));
  };
  const computedAmount = (form.line_items||[]).reduce((s,li)=>s + Math.max(0, parseFloat(li.unit_price||0) * parseFloat(li.qty_billed||0) - parseFloat(li.discount_amount||0)), 0);

  const submit = async () => {
    try {
      if (!form.po_id) return toast.error("Pilih PO");
      if (!form.faktur_pajak_url) return toast.error("Faktur Pajak wajib diupload");
      if (!form.bast_url) return toast.error("BAST wajib diupload");
      if (!form.line_items?.length) return toast.error("Pilih minimal satu item yang ditagih");
      await api.post("/vendor-portal/invoices", {
        ...form,
        amount: computedAmount,
        line_items: form.line_items.map(li => ({
          po_item_index: li.po_item_index,
          qty_billed: parseFloat(li.qty_billed),
          unit_price: parseFloat(li.unit_price||0),
          discount_amount: parseFloat(li.discount_amount||0),
          notes: li.notes,
        })),
      });
      toast.success("Invoice tersubmit");
      setOpen(false); setForm({ line_items:[], attachments:[] }); setBilling(null); load();
    } catch(e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

  const filtered = rows.filter(i => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (i.invoice_number||"").toLowerCase().includes(s) || (i.po_number||"").toLowerCase().includes(s) || (i.status||"").toLowerCase().includes(s);
  });
  const grouped = (() => {
    if (groupBy === "none") return { "": filtered };
    const g = {};
    for (const i of filtered) {
      let k = "-";
      if (groupBy === "status") k = i.status || "-";
      else if (groupBy === "po") k = i.po_number || "-";
      else if (groupBy === "month") k = (i.created_at||"").slice(0,7) || "-";
      else if (groupBy === "currency") k = i.currency || "IDR";
      (g[k] = g[k] || []).push(i);
    }
    return g;
  })();

  return (
    <div className="space-y-4" data-testid="vendor-invoices">
      <div className="flex justify-between items-end">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Penagihan / Invoice</h1>
        <Dialog open={open} onOpenChange={(v)=>{ setOpen(v); if(!v){ setForm({line_items:[],attachments:[]}); setBilling(null);} }}>
          <DialogTrigger asChild><Button data-testid="vi-add-btn"><Plus size={14}/> Ajukan Invoice</Button></DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Ajukan Penagihan</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="label-tiny">PO *</Label>
                <Select value={form.po_id||""} onValueChange={pickPO}>
                  <SelectTrigger data-testid="vi-po"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{pos.filter(p=>["sent","completed","partial","approved"].includes(p.status)).map(p=><SelectItem key={p.id} value={p.id}>{p.po_number} — {fmtIDR(p.total)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {billing && (
                <div>
                  <Label className="label-tiny">Item yang Ditagih (checklist + isi qty; qty tidak boleh melebihi sisa)</Label>
                  <div className="border border-slate-200 rounded overflow-x-auto max-h-64 mt-1">
                    <table className="data-table">
                      <thead><tr><th></th><th>Produk</th><th className="text-right">Qty PO</th><th className="text-right">Terbayar</th><th className="text-right">Sisa</th><th className="text-right">Qty Tagih</th><th className="text-right">Harga</th><th className="text-right">Diskon</th><th className="text-right">Subtotal</th></tr></thead>
                      <tbody>
                        {billing.items.map(it => {
                          const line = (form.line_items||[]).find(x=>x.po_item_index===it.item_index);
                          const active = !!line;
                          const disabled = it.qty_remaining <= 0;
                          const sub = active ? Math.max(0, parseFloat(line.unit_price||0)*parseFloat(line.qty_billed||0) - parseFloat(line.discount_amount||0)) : 0;
                          return (
                            <tr key={it.item_index} className={disabled?"opacity-40":active?"bg-emerald-50/40":""} data-testid={`vi-line-${it.item_index}`}>
                              <td><input type="checkbox" checked={active} disabled={disabled} onChange={()=>toggleLine(it)} data-testid={`vi-line-chk-${it.item_index}`}/></td>
                              <td className="text-xs">
                                <div className="font-semibold">{it.product_name}</div>
                                {it.product_code && <div className="text-[10px] font-mono text-slate-500">{it.product_code}</div>}
                              </td>
                              <td className="text-right">{it.qty_ordered}</td>
                              <td className="text-right text-slate-500">{it.qty_billed}</td>
                              <td className={`text-right font-semibold ${it.qty_remaining===0?"text-slate-400":"text-emerald-700"}`} data-testid={`vi-line-rem-${it.item_index}`}>{it.qty_remaining}</td>
                              <td className="text-right">
                                <Input type="number" min="0" max={it.qty_remaining} step="0.01" value={line?.qty_billed ?? ""} disabled={!active} onChange={e=>updateLine(it.item_index, "qty_billed", e.target.value)} className="h-8 text-xs w-20 font-mono ml-auto" data-testid={`vi-line-qty-${it.item_index}`}/>
                              </td>
                              <td className="text-right">
                                <Input type="number" min="0" step="0.01" value={line?.unit_price ?? it.price} disabled={!active} onChange={e=>updateLine(it.item_index, "unit_price", e.target.value)} className="h-8 text-xs w-24 font-mono ml-auto"/>
                              </td>
                              <td className="text-right">
                                <Input type="number" min="0" step="0.01" value={line?.discount_amount ?? 0} disabled={!active} onChange={e=>updateLine(it.item_index, "discount_amount", e.target.value)} className="h-8 text-xs w-20 font-mono ml-auto"/>
                              </td>
                              <td className="text-right font-mono text-xs font-semibold">{fmtIDR(sub)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 font-semibold">
                          <td colSpan={8} className="text-right">Total Tagihan</td>
                          <td className="text-right font-mono" data-testid="vi-total">{fmtIDR(computedAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="label-tiny">Nomor Faktur Pajak</Label>
                  <Input value={form.faktur_pajak_number||""} onChange={e=>setForm({...form, faktur_pajak_number:e.target.value})} data-testid="vi-fp-number"/>
                </div>
                <div>
                  <Label className="label-tiny">Nomor BAST</Label>
                  <Input value={form.bast_number||""} onChange={e=>setForm({...form, bast_number:e.target.value})} data-testid="vi-bast-number"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`border border-dashed rounded p-3 ${form.faktur_pajak_url?"bg-emerald-50 border-emerald-300":"bg-slate-50 border-slate-300"}`}>
                  <Label className="label-tiny">Faktur Pajak (WAJIB PDF)*</Label>
                  <label className="cursor-pointer block mt-1">
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg" onChange={e=>{const f=e.target.files?.[0];if(f){uploadFile(f,"faktur"); e.target.value="";}}} disabled={uploading} data-testid="vi-fp-file"/>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-xs">
                      <Upload size={10}/> {form.faktur_pajak_url?"Ganti":"Upload"}
                    </span>
                  </label>
                  {form.faktur_pajak_url && <a href={form.faktur_pajak_url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-blue-700 underline break-all">{form.faktur_pajak_filename}</a>}
                </div>
                <div className={`border border-dashed rounded p-3 ${form.bast_url?"bg-emerald-50 border-emerald-300":"bg-slate-50 border-slate-300"}`}>
                  <Label className="label-tiny">BAST (WAJIB PDF)*</Label>
                  <label className="cursor-pointer block mt-1">
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg" onChange={e=>{const f=e.target.files?.[0];if(f){uploadFile(f,"bast"); e.target.value="";}}} disabled={uploading} data-testid="vi-bast-file"/>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white text-xs">
                      <Upload size={10}/> {form.bast_url?"Ganti":"Upload"}
                    </span>
                  </label>
                  {form.bast_url && <a href={form.bast_url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-blue-700 underline break-all">{form.bast_filename}</a>}
                </div>
              </div>
              <div className="border border-dashed border-slate-300 rounded p-3 bg-slate-50">
                <div className="flex items-center justify-between mb-1">
                  <Label className="label-tiny flex items-center gap-1"><Paperclip size={10}/> Dokumen Pendukung (opsional)</Label>
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){uploadFile(f,"supporting"); e.target.value="";}}} disabled={uploading} data-testid="vi-att-file"/>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs"><Upload size={10}/> Tambah</span>
                  </label>
                </div>
                {(form.attachments||[]).length === 0 ? <div className="text-xs text-slate-400 italic">Belum ada</div> : (
                  <ul className="space-y-1">
                    {(form.attachments||[]).map((a,i)=>(
                      <li key={i} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1">
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate">{a.filename}</a>
                        <button onClick={()=>rmAttach(i)} className="text-slate-400 hover:text-red-600"><X size={12}/></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="label-tiny">Due Date</Label><Input type="date" value={form.due_date||""} onChange={e=>setForm({...form,due_date:e.target.value})} data-testid="vi-due"/></div>
                <div><Label className="label-tiny">LS Document (bonded, opsional)</Label>
                  <Select value={form.ls_document_id||""} onValueChange={v=>setForm({...form,ls_document_id:v||null})}>
                    <SelectTrigger data-testid="vi-ls"><SelectValue placeholder="-"/></SelectTrigger>
                    <SelectContent>{ls.map(l=><SelectItem key={l.id} value={l.id}>{l.reference_number}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="vi-notes"/></div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={uploading} data-testid="vi-save">Ajukan Invoice ({fmtIDR(computedAmount)})</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <Input placeholder="Cari nomor invoice / PO / status..." value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs" data-testid="vi-search"/>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-slate-600">Group by:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-32 text-xs" data-testid="vi-groupby"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Tanpa —</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="po">PO</SelectItem>
              <SelectItem value="month">Bulan</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-slate-500 ml-auto">{filtered.length} invoice</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No Invoice</th><th>PO</th><th>Amount</th><th>Due</th><th>Docs</th><th>Bonded</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {Object.keys(grouped).length === 0 || filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada invoice</td></tr> : Object.entries(grouped).map(([groupKey, invs]) => (
              <Fragment key={`grp-${groupKey}`}>
                {groupBy !== "none" && <tr className="bg-slate-100" data-testid={`vi-group-${groupKey}`}><td colSpan={8} className="font-semibold text-xs px-2 py-1 text-slate-700 uppercase">{groupKey} <span className="text-slate-400 font-normal">({invs.length})</span></td></tr>}
                {invs.map(i => (
                  <tr key={i.id} data-testid={`vi-row-${i.id}`}>
                    <td className="font-mono text-xs">{i.invoice_number}</td>
                    <td className="font-mono text-xs">{i.po_number}</td>
                    <td className="font-mono font-semibold">{fmtIDR(i.amount_total || i.amount)}</td>
                    <td className="text-xs">{i.due_date||"-"}</td>
                    <td className="text-xs">
                      {i.faktur_pajak_url && <span className="inline-flex items-center gap-0.5 text-[10px] px-1 mr-1 rounded bg-emerald-100 text-emerald-700" title="Faktur Pajak">FP</span>}
                      {i.bast_url && <span className="inline-flex items-center gap-0.5 text-[10px] px-1 mr-1 rounded bg-blue-100 text-blue-700" title="BAST">BAST</span>}
                      {(i.attachments||[]).length > 0 && <span className="text-[10px] text-slate-500">+{i.attachments.length}</span>}
                    </td>
                    <td>{i.is_bonded?<span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span>:"-"}</td>
                    <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
                    <td className="text-right"><button onClick={()=>setDetailId(i.id)} className="p-1 hover:bg-slate-100 rounded" data-testid={`vi-view-${i.id}`}><Eye size={14}/></button></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <InvoiceDetailSheet invoiceId={detailId} source="vendor" onClose={()=>setDetailId(null)}/>
    </div>
  );
}

export function VendorLS() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ doc_type:"LS", hs_codes: [] });
  const [hs, setHs] = useState([]);
  const [pos, setPos] = useState([]);

  const load = () => api.get("/vendor-portal/ls-documents").then(r=>setRows(r.data));
  useEffect(()=>{ load(); api.get("/hs-codes").then(r=>setHs(r.data)); api.get("/vendor-portal/pos").then(r=>setPos(r.data.filter(p=>p.po_type==="BONDED"))); },[]);

  const submit = async () => {
    try { await api.post("/vendor-portal/ls-documents", form);
      toast.success("Dokumen tersubmit"); setOpen(false); setForm({doc_type:"LS", hs_codes:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="vendor-ls">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Dokumen LS / Kepabeanan</h1>
          <p className="text-sm text-slate-600 mt-1">Sebagai importir, ajukan dokumen LS / PIB / BC untuk PO Bonded.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="vls-add-btn"><FileUp size={14}/> Submit Dokumen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Dokumen Kepabeanan</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="label-tiny">Jenis Dokumen</Label>
                <Select value={form.doc_type} onValueChange={v=>setForm({...form,doc_type:v})}>
                  <SelectTrigger data-testid="vls-type"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LS">LS (Laporan Surveyor)</SelectItem>
                    <SelectItem value="PIB">PIB</SelectItem>
                    <SelectItem value="BC23">BC 2.3</SelectItem>
                    <SelectItem value="BC40">BC 4.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">PO Bonded (opsional)</Label>
                <Select value={form.po_id||""} onValueChange={v=>setForm({...form,po_id:v||null})}>
                  <SelectTrigger data-testid="vls-po"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{pos.map(p=><SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Nomor Referensi</Label><Input value={form.reference_number||""} onChange={e=>setForm({...form,reference_number:e.target.value})} data-testid="vls-ref"/></div>
              <div><Label className="label-tiny">HS Codes</Label>
                <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto border border-slate-200 rounded p-2 text-xs">
                  {hs.map(h=>(
                    <label key={h.id} className="flex items-center gap-1"><input type="checkbox" checked={form.hs_codes.includes(h.code)} onChange={(e)=>setForm({...form, hs_codes: e.target.checked ? [...form.hs_codes, h.code] : form.hs_codes.filter(x=>x!==h.code)})} data-testid={`vls-hs-${h.code}`}/>{h.code}</label>
                  ))}
                </div>
              </div>
              <div><Label className="label-tiny">Upload File (PDF / gambar / doc, maks 10MB)</Label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={async (e)=>{
                  const f = e.target.files?.[0]; if(!f) return;
                  try {
                    toast.info("Mengunggah…");
                    const res = await uploadFile(f);
                    setForm(prev => ({...prev, file_url: res.url, file_name: res.filename}));
                    toast.success("File terupload");
                  } catch(err) { toast.error(err.message || "Upload gagal. Pastikan bucket 'ls-documents' sudah dibuat di Supabase dan policy INSERT untuk anon aktif."); }
                }} data-testid="vls-file" className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-slate-900 file:text-white file:font-semibold file:cursor-pointer"/>
                {form.file_url && <div className="mt-1 text-[11px] text-emerald-600 break-all"><a href={form.file_url} target="_blank" rel="noreferrer" className="underline">{form.file_name || form.file_url}</a></div>}
              </div>
              <div><Label className="label-tiny">Atau URL Manual (opsional)</Label><Input value={form.file_url||""} onChange={e=>setForm({...form,file_url:e.target.value})} placeholder="https://..." data-testid="vls-url"/></div>
              <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="vls-notes"/></div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="vls-save">Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Jenis</th><th>Ref No</th><th>PO</th><th>HS Codes</th><th>Status</th><th>Tanggal</th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">Belum ada dokumen</td></tr>}
            {rows.map(d=>(
              <tr key={d.id} data-testid={`vls-row-${d.id}`}>
                <td className="font-semibold">{d.doc_type}</td>
                <td className="font-mono text-xs">{d.reference_number}</td>
                <td className="font-mono text-xs">{d.po_id||"-"}</td>
                <td className="text-xs">{d.hs_codes?.join(", ")}</td>
                <td className="text-xs uppercase font-semibold">{d.status}</td>
                <td className="text-xs">{d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Lihat</a> : "-"}</td>
                <td className="text-xs">{new Date(d.created_at).toLocaleDateString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VendorProfile() {
  const [p, setP] = useState(null);
  const [tab, setTab] = useState("info");
  useEffect(()=>{ api.get("/vendor-portal/profile").then(r=>setP(r.data||{})); },[]);
  const save = async () => {
    try {
      await api.put("/vendor-portal/profile-extended", p);
      toast.success("Profil disimpan");
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const uploadDoc = async (file, field, key) => {
    try {
      toast.info(`Uploading ${file.name}…`);
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("access_token");
      const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`, { method: "POST", credentials: "include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Upload gagal");
      if (field === "add_awarding" || field === "add_certification") {
        const arr = [...(p[key] || []), { name: file.name, file: d.url }];
        setP({...p, [key]: arr});
      } else {
        setP({...p, [field]: d.url});
      }
      toast.success("Terupload");
    } catch(err){ toast.error(err.message); }
  };
  const addPIC = () => setP({...p, pics: [...(p.pics||[]), {name:"", role:"", phone:"", email:""}]});
  const setPIC = (i,k,v) => setP({...p, pics: (p.pics||[]).map((x,idx)=>idx===i?{...x,[k]:v}:x)});
  const rmPIC = (i) => setP({...p, pics: (p.pics||[]).filter((_,idx)=>idx!==i)});
  const addAddr = () => setP({...p, addresses: [...(p.addresses||[]), {label:"", address:"", city:"", country:"Indonesia", postal_code:""}]});
  const setAddr = (i,k,v) => setP({...p, addresses: (p.addresses||[]).map((x,idx)=>idx===i?{...x,[k]:v}:x)});
  const rmAddr = (i) => setP({...p, addresses: (p.addresses||[]).filter((_,idx)=>idx!==i)});

  if(!p) return <div className="text-sm text-slate-500">Memuat...</div>;
  const TABS = [
    {k:"info", label:"Info"}, {k:"address", label:"Address"}, {k:"document", label:"Document"}, {k:"pic", label:"PIC"},
  ];
  return (
    <div className="space-y-4" data-testid="vendor-profile">
      <div className="bg-white border border-slate-200 rounded-md p-5 flex items-center justify-between">
        <div>
          <div className="font-heading text-xl font-bold">{p.username || p.email?.split('@')[0]} - {p.company_name}</div>
          <button className="mt-2 text-xs px-3 py-1.5 border border-slate-300 rounded" data-testid="vp-edit-btn">Edit Profile</button>
        </div>
        <div className="flex gap-2">
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} data-testid={`vp-tab-${t.k}`}
              className={`text-xs px-3 py-2 rounded ${tab===t.k?"bg-slate-900 text-white":"bg-slate-100 hover:bg-slate-200"}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab==="info" && (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
          <div className="label-tiny">Company Information</div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="label-tiny">Username</Label><Input value={p.username||""} onChange={e=>setP({...p,username:e.target.value})} data-testid="vp-username"/></div>
            <div><Label className="label-tiny">Phone Number</Label><Input value={p.phone||""} onChange={e=>setP({...p,phone:e.target.value})} data-testid="vp-phone"/></div>
            <div><Label className="label-tiny">Email</Label><Input value={p.email||""} disabled/></div>
            <div><Label className="label-tiny">NPWP</Label><Input value={p.npwp||""} onChange={e=>setP({...p,npwp:e.target.value})} data-testid="vp-npwp"/></div>
            <div><Label className="label-tiny">Website</Label><Input value={p.website||""} onChange={e=>setP({...p,website:e.target.value})} data-testid="vp-web"/></div>
            <div>
              <Label className="label-tiny">Vendor Notification</Label>
              <div className="flex gap-4 mt-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="vn" checked={p.vendor_notification==="emails"} onChange={()=>setP({...p,vendor_notification:"emails"})} data-testid="vp-notif-email"/>Handle By Emails</label>
                <label className="flex items-center gap-2"><input type="radio" name="vn" checked={p.vendor_notification==="portal"} onChange={()=>setP({...p,vendor_notification:"portal"})} data-testid="vp-notif-portal"/>Handle in Vendor Portal</label>
              </div>
            </div>
          </div>
          <Button onClick={save} data-testid="vp-save-info">Simpan</Button>
        </div>
      )}

      {tab==="address" && (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
          <div className="flex justify-between"><div className="label-tiny">Alamat</div><Button size="sm" variant="outline" onClick={addAddr} data-testid="vp-addr-add">+ Alamat</Button></div>
          {(p.addresses||[]).length===0 && <div className="text-xs text-slate-500">Belum ada alamat.</div>}
          {(p.addresses||[]).map((a,i)=>(
            <div key={i} className="grid grid-cols-5 gap-2 border border-slate-200 rounded p-2 items-end" data-testid={`vp-addr-${i}`}>
              <Input placeholder="Label (HO/Cabang)" value={a.label} onChange={e=>setAddr(i,"label",e.target.value)}/>
              <Input placeholder="Alamat" value={a.address} onChange={e=>setAddr(i,"address",e.target.value)} className="col-span-2"/>
              <Input placeholder="Kota" value={a.city} onChange={e=>setAddr(i,"city",e.target.value)}/>
              <div className="flex gap-1"><Input placeholder="Kode Pos" value={a.postal_code} onChange={e=>setAddr(i,"postal_code",e.target.value)}/><button onClick={()=>rmAddr(i)} className="text-red-500 px-2">×</button></div>
            </div>
          ))}
          <Button onClick={save} data-testid="vp-save-addr">Simpan</Button>
        </div>
      )}

      {tab==="document" && (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-6">
          <div>
            <div className="label-tiny mb-2">Document</div>
            {[["siup_url","SIUP"],["npwp_url","NPWP"],["akta_url","Akta"]].map(([k,label])=>(
              <div key={k} className="flex items-center justify-between border-b border-slate-100 py-2">
                <div><div className="font-semibold text-sm">{label}</div>{p[k] && <a href={p[k]} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Lihat file</a>}</div>
                <input type="file" onChange={e=>e.target.files?.[0] && uploadDoc(e.target.files[0], k)} data-testid={`vp-upload-${k}`} className="text-xs"/>
              </div>
            ))}
          </div>
          {[["awarding","Awarding"],["certification","Certification"]].map(([key,title])=>(
            <div key={key}>
              <div className="flex justify-between mb-2"><div className="label-tiny">{title}</div>
                <label className="text-xs cursor-pointer bg-slate-900 text-white px-3 py-1 rounded"><input type="file" className="hidden" onChange={e=>e.target.files?.[0] && uploadDoc(e.target.files[0], `add_${key}`, key)} data-testid={`vp-add-${key}`}/> + Upload</label>
              </div>
              <table className="data-table">
                <thead><tr><th>#</th><th>Name</th><th>File</th></tr></thead>
                <tbody>
                  {(p[key]||[]).length===0 && <tr><td colSpan={3} className="text-center text-slate-400 py-3">-</td></tr>}
                  {(p[key]||[]).map((r,i)=>(<tr key={i}><td>{i+1}</td><td>{r.name}</td><td><a href={r.file} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">Lihat</a></td></tr>))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab==="pic" && (
        <div className="bg-white border border-slate-200 rounded-md p-6 space-y-3">
          <div className="flex justify-between"><div className="label-tiny">Person in Charge (PIC)</div><Button size="sm" variant="outline" onClick={addPIC} data-testid="vp-pic-add">+ PIC</Button></div>
          {(p.pics||[]).length===0 && <div className="text-xs text-slate-500">Belum ada PIC.</div>}
          {(p.pics||[]).map((x,i)=>(
            <div key={i} className="grid grid-cols-6 gap-2 border border-slate-200 rounded p-2 items-end" data-testid={`vp-pic-${i}`}>
              <Input placeholder="Nama" value={x.name} onChange={e=>setPIC(i,"name",e.target.value)}/>
              <Input placeholder="Jabatan" value={x.role} onChange={e=>setPIC(i,"role",e.target.value)}/>
              <Input placeholder="Phone" value={x.phone} onChange={e=>setPIC(i,"phone",e.target.value)}/>
              <Input placeholder="Email" value={x.email} onChange={e=>setPIC(i,"email",e.target.value)}/>
              <button onClick={async ()=>{
                if (!x.email) return toast.error("Email PIC wajib untuk login");
                try {
                  const r = await api.post(`/vendors/${p.id}/pics/create-login`, { pic_index: i, password: "vendor123" });
                  toast.success(x.user_id ? "PIC sudah punya login" : `Login dibuat. Password: ${r.data.default_password}`);
                  const fresh = await api.get("/vendor-portal/profile"); setP(fresh.data);
                } catch(e) { toast.error(e.response?.data?.detail); }
              }} className="text-xs px-2 py-1 bg-slate-900 text-white rounded" data-testid={`vp-pic-login-${i}`}>{x.user_id ? "Sudah Login" : "Buat Login"}</button>
              <button onClick={()=>rmPIC(i)} className="text-red-500 justify-self-end">×</button>
            </div>
          ))}
          <Button onClick={save} data-testid="vp-save-pic">Simpan</Button>
        </div>
      )}
    </div>
  );
}

// ============================
// Vendor Pricelists (self-serve)
// ============================
export function VendorPricelists() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", price: "", currency: "IDR", min_qty: 1, notes: "" });
  const [uploading, setUploading] = useState(false);

  const load = () => api.get("/vendor-portal/pricelists").then(r=>setRows(r.data));
  useEffect(()=>{ load(); api.get("/products").then(r=>setProducts(r.data)); },[]);

  const submit = async () => {
    try {
      if (!form.product_id || !form.price) return toast.error("Produk & harga wajib diisi");
      await api.post("/vendor-portal/pricelists", {
        ...form,
        price: parseFloat(form.price),
        min_qty: parseFloat(form.min_qty||1),
      });
      toast.success("Harga tersimpan");
      setOpen(false); setForm({ product_id:"", price:"", currency:"IDR", min_qty:1, notes:"" }); load();
    } catch(e){ toast.error(e.response?.data?.detail || "Gagal"); }
  };
  const bulkUpload = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("epr-token");
      const r = await fetch(`${API_URL}/api/vendor-portal/pricelists/bulk`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Bulk upload gagal");
      toast.success(`Berhasil impor ${d.created} baris (dari ${d.total_rows})`);
      if ((d.errors||[]).length > 0) {
        toast.warning(`${d.errors.length} baris error — lihat konsol`, { description: JSON.stringify(d.errors.slice(0,3)) });
        console.warn("Bulk pricelist errors:", d.errors);
      }
      load();
    } catch(e){ toast.error(e.message); }
    finally { setUploading(false); }
  };
  const remove = async (id) => {
    if (!confirm("Hapus daftar harga ini?")) return;
    await api.delete(`/vendor-portal/pricelists/${id}`);
    toast.success("Dihapus"); load();
  };
  const uploadPdf = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("epr-token");
      const r = await fetch(`${API_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setForm(prev => ({...prev, file_url: d.url, filename: d.filename}));
      toast.success("File terunggah");
    } catch(e){ toast.error(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-4" data-testid="vendor-pricelists">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Vendor Portal</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Daftar Harga Saya</h1>
          <p className="text-sm text-slate-600 mt-1">Publikasikan harga produk Anda agar tim procurement dapat melihat penawaran terkini saat merencanakan pembelian.</p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="cursor-pointer">
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e=>{const f=e.target.files?.[0]; if(f){bulkUpload(f); e.target.value="";}}} disabled={uploading} data-testid="vpl-bulk-input"/>
            <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border ${uploading?"bg-slate-200 text-slate-500 border-slate-300":"bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`} data-testid="vpl-bulk-btn">
              <FileUp size={12}/>{uploading?"Mengunggah...":"Bulk Upload (CSV/XLSX)"}
            </span>
          </label>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button data-testid="vpl-add-btn"><Plus size={14}/> Tambah Harga</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Harga Produk</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="label-tiny">Produk</Label>
                <Select value={form.product_id} onValueChange={v=>setForm({...form, product_id:v})}>
                  <SelectTrigger data-testid="vpl-product"><SelectValue placeholder="Pilih produk"/></SelectTrigger>
                  <SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} — ${p.name}` : p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label className="label-tiny">Harga / Unit</Label><Input type="number" value={form.price} onChange={e=>setForm({...form, price:e.target.value})} data-testid="vpl-price"/></div>
                <div><Label className="label-tiny">Mata Uang</Label>
                  <Select value={form.currency} onValueChange={v=>setForm({...form, currency:v})}>
                    <SelectTrigger data-testid="vpl-currency"><SelectValue/></SelectTrigger>
                    <SelectContent>{["IDR","USD","SGD","JPY","EUR"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="label-tiny">Min Qty</Label><Input type="number" value={form.min_qty} onChange={e=>setForm({...form, min_qty:e.target.value})} data-testid="vpl-minqty"/></div>
                <div><Label className="label-tiny">Berlaku Dari</Label><Input type="date" value={form.valid_from||""} onChange={e=>setForm({...form, valid_from:e.target.value})} data-testid="vpl-from"/></div>
                <div><Label className="label-tiny">Berlaku Hingga</Label><Input type="date" value={form.valid_until||""} onChange={e=>setForm({...form, valid_until:e.target.value})} data-testid="vpl-until"/></div>
              </div>
              <div>
                <Label className="label-tiny">Lampiran Pricelist (PDF/Excel, opsional)</Label>
                <input type="file" accept=".pdf,.xls,.xlsx,.jpg,.png" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadPdf(f);}} data-testid="vpl-file" className="block w-full text-xs mt-1"/>
                {form.file_url && <a href={form.file_url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-700 underline">{form.filename}</a>}
              </div>
              <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} data-testid="vpl-notes"/></div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={uploading} data-testid="vpl-save">Simpan Harga</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
        <b>Format Bulk CSV/XLSX:</b> kolom wajib <code>product_code</code> &amp; <code>price</code>; opsional <code>currency</code>, <code>min_qty</code>, <code>valid_from</code>, <code>valid_until</code>, <code>notes</code>.
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Produk</th><th>Harga</th><th>Min Qty</th><th>Berlaku</th><th>Verified</th><th>File</th><th>Catatan</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada harga. Klik "Tambah Harga".</td></tr>}
            {rows.map(r=>(
              <tr key={r.id} data-testid={`vpl-row-${r.id}`}>
                <td>
                  <div className="font-semibold">{r.product_name}</div>
                  {r.product_code && <div className="text-[10px] font-mono text-slate-500">{r.product_code}</div>}
                </td>
                <td className="font-mono font-semibold">{r.currency||"IDR"} {(r.price||0).toLocaleString("id-ID")}</td>
                <td>{r.min_qty||1}</td>
                <td className="text-xs">{r.valid_from||"-"} → {r.valid_until||"-"}</td>
                <td>
                  {r.verified ? (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700" title={`Diverifikasi ${r.verified_by_name||""} pada ${r.verified_at||""}`} data-testid={`vpl-verified-${r.id}`}>✓ Verified</span>
                  ) : <span className="text-slate-400 text-[10px]">Belum</span>}
                </td>
                <td>{r.file_url ? <a href={r.file_url} target="_blank" rel="noreferrer" className="text-blue-700 underline text-xs">{r.filename||"file"}</a> : <span className="text-slate-400 text-xs">-</span>}</td>
                <td className="text-xs">{r.notes||"-"}</td>
                <td className="text-right"><button onClick={()=>remove(r.id)} data-testid={`vpl-del-${r.id}`}><Trash2 size={14} className="text-slate-400 hover:text-red-500"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


