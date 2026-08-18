import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, XCircle, Plus, FileUp, Upload } from "lucide-react";

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
};

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
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
  useEffect(()=>{ api.get("/vendor-portal/pos").then(r=>setRows(r.data)); },[]);
  return (
    <div className="space-y-4" data-testid="vendor-pos">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Purchase Orders Saya</h1>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>No PO</th><th>Type</th><th>Total</th><th>Status</th><th>Shipping</th><th>Invoice</th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={6} className="text-center py-6 text-slate-400">Belum ada PO</td></tr>}
            {rows.map(p=>(
              <tr key={p.id} data-testid={`vpo-row-${p.id}`}>
                <td className="font-mono text-xs">{p.po_number}</td>
                <td>{p.po_type}</td>
                <td className="font-mono">{fmtIDR(p.total)}</td>
                <td className="text-xs uppercase font-semibold">{p.status}</td>
                <td className="text-xs">{p.shipping_status}</td>
                <td className="text-xs">{p.invoice_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VendorShipments() {
  const [rows, setRows] = useState([]);
  useEffect(()=>{ api.get("/vendor-portal/shipments").then(r=>setRows(r.data)); },[]);
  return (
    <div className="space-y-4" data-testid="vendor-shipments">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Pengiriman Belum Selesai</h1>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
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
  useEffect(()=>{ api.get("/vendor-portal/profile").then(r=>setP(r.data)); },[]);
  const save = async () => { try{ await api.put("/vendor-portal/profile", p); toast.success("Profil disimpan"); }catch(e){toast.error(e.response?.data?.detail);} };
  if(!p) return <div className="text-sm text-slate-500">Memuat...</div>;
  return (
    <div className="space-y-4" data-testid="vendor-profile">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Profil Perusahaan</h1>
      <div className="bg-white border border-slate-200 rounded p-6 max-w-2xl space-y-3">
        <div><Label className="label-tiny">Nama Perusahaan</Label><Input value={p.company_name||""} disabled/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="label-tiny">Kontak</Label><Input value={p.name||""} disabled/></div>
          <div><Label className="label-tiny">Email</Label><Input value={p.email||""} disabled/></div>
          <div><Label className="label-tiny">Telepon</Label><Input value={p.phone||""} onChange={e=>setP({...p,phone:e.target.value})} data-testid="vp-phone"/></div>
          <div><Label className="label-tiny">NPWP</Label><Input value={p.npwp||""} onChange={e=>setP({...p,npwp:e.target.value})} data-testid="vp-npwp"/></div>
          <div><Label className="label-tiny">Bank Account</Label><Input value={p.bank_account||""} onChange={e=>setP({...p,bank_account:e.target.value})} data-testid="vp-bank"/></div>
          <div><Label className="label-tiny">Importir</Label><Input value={p.is_importer?"Ya":"Tidak"} disabled/></div>
        </div>
        <div><Label className="label-tiny">Alamat</Label><Textarea value={p.address||""} onChange={e=>setP({...p,address:e.target.value})} data-testid="vp-address"/></div>
        <div><Label className="label-tiny">Deskripsi</Label><Textarea value={p.description||""} onChange={e=>setP({...p,description:e.target.value})} data-testid="vp-desc"/></div>
        <Button onClick={save} data-testid="vp-save">Simpan</Button>
      </div>
    </div>
  );
}
