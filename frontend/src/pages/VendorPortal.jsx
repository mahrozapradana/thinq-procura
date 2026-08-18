import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, XCircle, Plus, FileUp, Upload, Eye, Clock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import Pagination from "@/components/Pagination";
import ExportCsvButton from "@/components/ExportCsvButton";

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
  const [bid, setBid] = useState({});
  const load = () => api.get("/vendor-portal/tenders").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);
  const submit = async () => {
    try { await api.post(`/vendor-portal/tenders/${bidOn.id}/bid`, { ...bid, price: parseFloat(bid.price||0), delivery_days: parseInt(bid.delivery_days||0) });
      toast.success("Bid disubmit"); setBidOn(null); setBid({}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
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
                <td className="font-mono text-xs">{t.tender_number}</td>
                <td>{t.title}</td>
                <td className="text-xs">{t.deadline||"-"}</td>
                <td>{t.items?.length}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[t.status]}`}>{t.status}</span></td>
                <td className="text-right whitespace-nowrap">
                  {t.status==="open" && <>
                    <Button size="sm" onClick={()=>setBidOn(t)} data-testid={`vt-bid-${t.id}`}><Send size={12}/> Bid</Button>
                    <Button size="sm" variant="outline" onClick={()=>decline(t.id)} className="ml-2" data-testid={`vt-decline-${t.id}`}><XCircle size={12}/> Tolak</Button>
                  </>}
                  {t.awarded_vendor_id && <span className="text-[10px] uppercase font-semibold text-blue-700">Awarded</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!bidOn} onOpenChange={(v)=>!v && setBidOn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Bid</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="label-tiny">Harga Total (IDR) *</Label><Input type="number" value={bid.price||""} onChange={e=>setBid({...bid,price:e.target.value})} data-testid="vt-bid-price"/></div>
            <div><Label className="label-tiny">Estimasi Pengiriman (hari)</Label><Input type="number" value={bid.delivery_days||""} onChange={e=>setBid({...bid,delivery_days:e.target.value})} data-testid="vt-bid-days"/></div>
            <div><Label className="label-tiny">Catatan</Label><Textarea value={bid.notes||""} onChange={e=>setBid({...bid,notes:e.target.value})} data-testid="vt-bid-notes"/></div>
          </div>
          <DialogFooter><Button onClick={submit} data-testid="vt-bid-submit">Submit Bid</Button></DialogFooter>
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
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = rows.slice((page-1)*perPage, page*perPage);
  const acknowledge = async (id) => {
    try { await api.post(`/vendor-portal/pos/${id}/acknowledge`); toast.success("PO dikonfirmasi"); load(); }
    catch(e){ toast.error(e.response?.data?.detail || "Gagal"); }
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
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No PO</th><th>Type</th><th>Untaxed</th><th>Pajak</th><th>Grand Total</th><th>Status</th><th>Ack</th><th>Shipping</th><th></th></tr></thead>
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
        items: reply.items.map(i => ({ item_index: i.item_index, price: parseFloat(i.price||0), notes: i.notes })),
      });
      toast.success("Balasan harga terkirim ke buyer");
      setReplyFor(null);
      load();
    } catch(e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };

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
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="data-table">
                  <thead><tr><th>Item</th><th>Qty</th><th>Original Price</th><th>Counter Price</th><th>Catatan</th></tr></thead>
                  <tbody>
                    {reply.items.map((it, i) => (
                      <tr key={i}>
                        <td className="text-xs">{it.product_name}</td>
                        <td>{it.qty}</td>
                        <td className="font-mono text-xs text-slate-400">{fmtIDR(it.original_price)}</td>
                        <td><Input type="number" value={it.price} onChange={e=>{
                          const items=[...reply.items]; items[i]={...items[i], price: e.target.value}; setReply({...reply, items});
                        }} className="h-8 text-xs w-32" data-testid={`rfq-item-price-${i}`}/></td>
                        <td><Input value={it.notes} onChange={e=>{
                          const items=[...reply.items]; items[i]={...items[i], notes: e.target.value}; setReply({...reply, items});
                        }} className="h-8 text-xs" data-testid={`rfq-item-notes-${i}`}/></td>
                      </tr>
                    ))}
                  </tbody>
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
  useEffect(()=>{ api.get("/vendor-portal/shipments").then(r=>setRows(r.data)); },[]);
  return (
    <div className="space-y-4" data-testid="vendor-shipments">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Pengiriman Belum Selesai</h1>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No PO</th><th>Type</th><th>Delivery Date</th><th>Shipping</th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={4} className="text-center py-6 text-slate-400">Semua sudah dikirim</td></tr>}
            {rows.map(p=>(
              <tr key={p.id} data-testid={`vsh-row-${p.id}`}>
                <td className="font-mono text-xs">{p.po_number}</td>
                <td>{p.po_type}</td>
                <td className="text-xs">{p.delivery_date||"-"}</td>
                <td className="text-xs uppercase font-semibold">{p.shipping_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VendorInvoices() {
  const [rows, setRows] = useState([]);
  const [pos, setPos] = useState([]);
  const [ls, setLs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});

  const load = () => {
    api.get("/vendor-portal/invoices").then(r=>setRows(r.data));
    api.get("/vendor-portal/pos").then(r=>setPos(r.data));
    api.get("/vendor-portal/ls-documents").then(r=>setLs(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const submit = async () => {
    try { await api.post("/vendor-portal/invoices", { ...form, amount: parseFloat(form.amount||0) });
      toast.success("Invoice disubmit"); setOpen(false); setForm({}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="vendor-invoices">
      <div className="flex justify-between items-end">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Penagihan / Invoice</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="vi-add-btn"><Plus size={14}/> Ajukan Invoice</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajukan Penagihan</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="label-tiny">PO *</Label>
                <Select value={form.po_id||""} onValueChange={v=>setForm({...form,po_id:v})}>
                  <SelectTrigger data-testid="vi-po"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{pos.filter(p=>["sent","completed","partial","approved"].includes(p.status)).map(p=><SelectItem key={p.id} value={p.id}>{p.po_number} — {fmtIDR(p.total)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Amount</Label><Input type="number" value={form.amount||""} onChange={e=>setForm({...form,amount:e.target.value})} data-testid="vi-amount"/></div>
              <div><Label className="label-tiny">Due Date</Label><Input type="date" value={form.due_date||""} onChange={e=>setForm({...form,due_date:e.target.value})} data-testid="vi-due"/></div>
              <div><Label className="label-tiny">LS Document (opsional)</Label>
                <Select value={form.ls_document_id||""} onValueChange={v=>setForm({...form,ls_document_id:v||null})}>
                  <SelectTrigger data-testid="vi-ls"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{ls.map(l=><SelectItem key={l.id} value={l.id}>{l.reference_number}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="vi-notes"/></div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="vi-save">Ajukan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No Invoice</th><th>PO</th><th>Amount</th><th>Due</th><th>Bonded</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">Belum ada invoice</td></tr>}
            {rows.map(i=>(
              <tr key={i.id} data-testid={`vi-row-${i.id}`}>
                <td className="font-mono text-xs">{i.invoice_number}</td>
                <td className="font-mono text-xs">{i.po_number}</td>
                <td className="font-mono font-semibold">{fmtIDR(i.amount)}</td>
                <td className="text-xs">{i.due_date||"-"}</td>
                <td>{i.is_bonded?<span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Bonded</span>:"-"}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[i.status]}`}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
