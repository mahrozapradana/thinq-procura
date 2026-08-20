import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Check, X, UserCheck, Star, Ban, Search, Plus, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS = {
  approved:"bg-emerald-100 text-emerald-700",
  pending_approval:"bg-amber-100 text-amber-700",
  rejected:"bg-red-100 text-red-700",
};

const PAGE_SIZE = 15;

export default function VendorsMgmt() {
  const [rows, setRows] = useState([]);
  const [approving, setApproving] = useState(null);
  const [blacklisting, setBlacklisting] = useState(null);
  const [pw, setPw] = useState("vendor123");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({ default_password: "vendor123", is_importer: false });

  const load = () => api.get("/vendors").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);

  const createManual = async () => {
    try {
      if (!form.company_name || !form.name || !form.email) return toast.error("Nama Perusahaan / Kontak / Email wajib");
      const r = await api.post("/vendors", form);
      toast.success(`Vendor "${r.data.company_name}" dibuat${r.data.default_password?` — password: ${r.data.default_password}`:""}`);
      setCreateOpen(false); setForm({ default_password: "vendor123", is_importer: false }); load();
    } catch(e){ toast.error(e.response?.data?.detail || "Gagal"); }
  };
  const importCsv = async (file) => {
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("access_token");
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/import/vendors.csv`;
      const r = await fetch(url, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "Import gagal");
      toast.success(`Impor ${d.created||d.count||0} vendor sukses`);
      load();
    } catch(e){ toast.error(e.message); }
    finally { setImporting(false); }
  };

  const filtered = rows.filter(v => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (v.company_name||"").toLowerCase().includes(s) || (v.email||"").toLowerCase().includes(s) || (v.name||"").toLowerCase().includes(s);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const effectiveBlacklisted = (v) => v.blacklisted || (v.avg_rating && v.avg_rating < 2 && (v.ratings_count||0) >= 2);

  const approve = async () => {
    try {
      const r = await api.post(`/vendors/${approving.id}/approve`, { default_password: pw });
      toast.success(`Vendor disetujui. Password default: ${r.data.default_password || "(sudah ada)"}`);
      setApproving(null); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const reject = async (id) => { await api.post(`/vendors/${id}/reject`); toast.success("Vendor ditolak"); load(); };
  const toggleBlacklist = async () => {
    if (!blacklisting) return;
    const target = !blacklisting.blacklisted;
    try {
      await api.post(`/vendors/${blacklisting.id}/blacklist`, { blacklisted: target, reason });
      toast.success(target ? "Vendor di-blacklist" : "Blacklist dibuka");
      setBlacklisting(null); setReason(""); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="vendors-mgmt-page">
      <div>
        <div className="label-tiny">Partners</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Vendor Management</h1>
        <p className="text-sm text-slate-600 mt-1">Review pendaftar, kelola blacklist otomatis (rating &lt; 2★) & manual.</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1"><Search className="absolute left-2 top-2.5 text-slate-400" size={14}/><Input placeholder="Cari perusahaan/email/kontak…" value={q} onChange={e=>{setPage(1);setQ(e.target.value);}} className="pl-8" data-testid="vendor-search"/></div>
        <label className="cursor-pointer">
          <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e=>{const f=e.target.files?.[0];if(f){importCsv(f); e.target.value="";}}} disabled={importing} data-testid="vendor-import-file"/>
          <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border ${importing?"bg-slate-200 text-slate-500 border-slate-300":"bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`} data-testid="vendor-import-btn">
            <FileUp size={12}/>{importing?"Mengimpor...":"Import CSV/XLSX"}
          </span>
        </label>
        <Button onClick={()=>setCreateOpen(true)} data-testid="vendor-create-btn"><Plus size={14}/> Buat Vendor</Button>
        <div className="text-xs text-slate-500 ml-2">{filtered.length} vendor · Hal {page}/{totalPages}</div>
        <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} data-testid="vendor-prev">‹</Button>
        <Button variant="outline" size="sm" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} data-testid="vendor-next">›</Button>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Buat Vendor Manual</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="label-tiny">Nama Perusahaan *</Label><Input value={form.company_name||""} onChange={e=>setForm({...form, company_name:e.target.value})} data-testid="vc-company"/></div>
            <div><Label className="label-tiny">Kode Vendor (opsional)</Label><Input value={form.code||""} onChange={e=>setForm({...form, code:e.target.value})} data-testid="vc-code" placeholder="Auto-generate jika kosong"/></div>
            <div><Label className="label-tiny">Nama Kontak (PIC) *</Label><Input value={form.name||""} onChange={e=>setForm({...form, name:e.target.value})} data-testid="vc-name"/></div>
            <div><Label className="label-tiny">Email *</Label><Input type="email" value={form.email||""} onChange={e=>setForm({...form, email:e.target.value})} data-testid="vc-email"/></div>
            <div><Label className="label-tiny">Telepon</Label><Input value={form.phone||""} onChange={e=>setForm({...form, phone:e.target.value})} data-testid="vc-phone"/></div>
            <div><Label className="label-tiny">NPWP</Label><Input value={form.npwp||""} onChange={e=>setForm({...form, npwp:e.target.value})} data-testid="vc-npwp"/></div>
            <div className="col-span-2"><Label className="label-tiny">Alamat</Label><Input value={form.address||""} onChange={e=>setForm({...form, address:e.target.value})} data-testid="vc-address"/></div>
            <div><Label className="label-tiny">Nama Bank</Label><Input value={form.bank_name||""} onChange={e=>setForm({...form, bank_name:e.target.value})} data-testid="vc-bank"/></div>
            <div><Label className="label-tiny">No Rekening</Label><Input value={form.bank_account||""} onChange={e=>setForm({...form, bank_account:e.target.value})} data-testid="vc-account"/></div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={!!form.is_importer} onChange={e=>setForm({...form, is_importer:e.target.checked})} data-testid="vc-importer" id="vc-imp"/>
              <label htmlFor="vc-imp" className="text-xs cursor-pointer">Importir / bisa terima PO bonded</label>
            </div>
            <div className="col-span-2"><Label className="label-tiny">Password Default Vendor Login</Label><Input value={form.default_password||"vendor123"} onChange={e=>setForm({...form, default_password:e.target.value})} data-testid="vc-pw"/></div>
          </div>
          <DialogFooter><Button onClick={createManual} data-testid="vc-save">Simpan Vendor</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto" data-testid="VendorsMgmt_40_6">
        <table className="data-table" style={{ minWidth: 1200 }}>
          <thead><tr><th>Perusahaan</th><th>Kontak</th><th>Email</th><th>Phone</th><th>NPWP</th><th>Rating</th><th>Importir</th><th>Status</th><th>Blacklist</th><th></th></tr></thead>
          <tbody>
            {pageRows.length===0 && <tr><td colSpan={10} className="text-center py-6 text-slate-400">Tidak ada data</td></tr>}
            {pageRows.map(v=>{
              const bl = effectiveBlacklisted(v);
              return (
                <tr key={v.id} data-testid={`vendor-row-${v.id}`} className={bl ? "bg-red-50/50" : ""}>
                  <td className="font-semibold whitespace-nowrap">{v.company_name}</td>
                  <td className="whitespace-nowrap">{v.name}</td>
                  <td className="text-xs whitespace-nowrap">{v.email}</td>
                  <td className="text-xs font-mono whitespace-nowrap">{v.phone||"-"}</td>
                  <td className="text-xs font-mono whitespace-nowrap">{v.npwp||"-"}</td>
                  <td className="whitespace-nowrap">
                    {v.avg_rating ? (
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(n=>(<Star key={n} size={12} className={n <= Math.round(v.avg_rating) ? "text-amber-500 fill-amber-500" : "text-slate-200"}/>))}
                        <span className="text-xs ml-1 font-mono">{v.avg_rating}</span>
                        <span className="text-[10px] text-slate-400">({v.ratings_count||0})</span>
                      </div>
                    ) : <span className="text-xs text-slate-400">-</span>}
                  </td>
                  <td className="whitespace-nowrap">{v.is_importer ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold uppercase">Importir</span> : "-"}</td>
                  <td className="whitespace-nowrap"><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[v.status]}`}>{v.status}</span></td>
                  <td className="whitespace-nowrap">
                    {bl ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1 w-fit"><Ban size={10}/> {v.blacklisted ? "MANUAL" : "AUTO<2★"}</span> : <span className="text-xs text-emerald-600">Aktif</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {v.status==="pending_approval" && <>
                      <button onClick={()=>{setApproving(v); setPw("vendor123");}} className="p-1 hover:bg-emerald-50 rounded" data-testid={`vendor-approve-${v.id}`}><Check size={14} className="text-emerald-600"/></button>
                      <button onClick={()=>reject(v.id)} className="p-1 hover:bg-red-50 rounded" data-testid={`vendor-reject-${v.id}`}><X size={14} className="text-red-600"/></button>
                    </>}
                    {v.status==="approved" && (
                      <button onClick={()=>setBlacklisting(v)} className={`p-1 rounded ${v.blacklisted ? "hover:bg-emerald-50" : "hover:bg-red-50"}`} data-testid={`vendor-blacklist-${v.id}`}>
                        <Ban size={14} className={v.blacklisted ? "text-emerald-600" : "text-red-600"}/>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!approving} onOpenChange={(v)=>!v && setApproving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Vendor</DialogTitle></DialogHeader>
          {approving && (
            <div className="space-y-3 text-sm">
              <div>{approving.company_name} akan disetujui dan dibuatkan akun vendor portal.</div>
              <div><Label className="label-tiny">Default Password</Label><Input value={pw} onChange={e=>setPw(e.target.value)} data-testid="vendor-default-pw"/></div>
            </div>
          )}
          <DialogFooter><Button onClick={approve} data-testid="vendor-approve-confirm">Setujui & Buat Akun</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blacklisting} onOpenChange={(v)=>!v && setBlacklisting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{blacklisting?.blacklisted ? "Buka Blacklist" : "Blacklist Vendor"}</DialogTitle></DialogHeader>
          {blacklisting && (
            <div className="space-y-3 text-sm">
              <div>Vendor: <b>{blacklisting.company_name}</b></div>
              {!blacklisting.blacklisted && <div><Label className="label-tiny">Alasan</Label><Input value={reason} onChange={e=>setReason(e.target.value)} data-testid="bl-reason" placeholder="Rating rendah, keterlambatan pengiriman…"/></div>}
              <div className="text-xs text-slate-500">Vendor di-blacklist tidak akan muncul di daftar undangan tender & PO baru.</div>
            </div>
          )}
          <DialogFooter><Button onClick={toggleBlacklist} data-testid="bl-confirm" variant={blacklisting?.blacklisted ? "outline" : "destructive"}>{blacklisting?.blacklisted ? "Buka Blacklist" : "Blacklist"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
