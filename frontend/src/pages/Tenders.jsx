import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Eye, PlayCircle, Award, StopCircle, Upload, Paperclip, X, Unlock, Lock, History, Download, Search } from "lucide-react";
import { Fragment } from "react";
import Pagination from "@/components/Pagination";
import ExportCsvButton from "@/components/ExportCsvButton";
import { useDataTable } from "@/components/useDataTable";

const STATUS_STYLE = {
  open:"bg-emerald-100 text-emerald-700",
  draft:"bg-slate-100 text-slate-700",
  closed:"bg-amber-100 text-amber-700",
  awarded:"bg-blue-100 text-blue-700",
};

export default function Tenders() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ items:[], invited_vendor_ids:[], is_bonded:false, is_sealed:false, attachments:[] });
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [statusFilter, setStatusFilter] = useState("all");
  const perPage = 10;
  const dt = useDataTable(rows, { storageKey: "tenders", defaultSort: { key: "created_at", dir: "desc" } });
  const filtered = dt.sortedRows.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.tender_number||"").toLowerCase().includes(s) || (t.title||"").toLowerCase().includes(s) || (t.description||"").toLowerCase().includes(s);
  });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total/perPage));
  const paged = groupBy === "none" ? filtered.slice((page-1)*perPage, page*perPage) : filtered;
  const grouped = (() => {
    if (groupBy === "none") return { "": paged };
    const g = {};
    for (const t of filtered) {
      let k = "-";
      if (groupBy === "status") k = t.status || "-";
      else if (groupBy === "type") k = t.is_sealed ? "Sealed" : (t.is_bonded ? "Bonded" : "Standard");
      else if (groupBy === "month") k = (t.created_at||"").slice(0,7) || "-";
      (g[k] = g[k] || []).push(t);
    }
    return g;
  })();

  const load = () => api.get("/tenders").then(r=>setRows(r.data));
  const reloadDetail = async (id) => { const r = await api.get(`/tenders/${id}`); setDetail(r.data); };
  useEffect(()=>{ load(); api.get("/products").then(r=>setProducts(r.data)); api.get("/vendors?status=approved&exclude_blacklisted=true").then(r=>setVendors(r.data));},[]);

  const addItem = () => setForm({...form, items:[...form.items,{product_id:"",qty:1,specs:""}]});
  const setItem = (i,k,v) => setForm({...form, items: form.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)});
  const rmItem = (i) => setForm({...form, items: form.items.filter((_,idx)=>idx!==i)});

  const uploadDoc = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("epr-token");
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      setForm(prev => ({...prev, attachments: [...(prev.attachments||[]), { url:data.url, filename:data.filename, size:data.size, content_type:data.content_type }]}));
      toast.success(`${file.name} terunggah`);
    } catch(e){ toast.error(e.message || "Upload gagal"); }
    finally { setUploading(false); }
  };
  const rmDoc = (i) => setForm(prev => ({...prev, attachments: (prev.attachments||[]).filter((_,idx)=>idx!==i)}));

  const submit = async () => {
    try {
      const payload = { ...form, items: form.items.map(it => ({...it, qty: parseFloat(it.qty), product_name: products.find(p=>p.id===it.product_id)?.name})) };
      await api.post("/tenders", payload);
      toast.success("Tender dibuat"); setOpen(false); setForm({items:[],invited_vendor_ids:[],is_bonded:false,is_sealed:false,attachments:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const openT = async (id) => { await api.post(`/tenders/${id}/open`); toast.success("Tender dibuka"); load(); };
  const closeT = async (id) => { await api.post(`/tenders/${id}/close`); toast.success("Tender ditutup"); load(); };
  const award = async (tid, vid) => { await api.post(`/tenders/${tid}/award/${vid}`); toast.success("Awarded"); load(); reloadDetail(tid); };
  const reveal = async (tid) => {
    if (!confirm("Buka amplop sealed bid? Tindakan ini tidak dapat dibatalkan dan akan menampilkan semua harga vendor.")) return;
    try { await api.post(`/tenders/${tid}/reveal`); toast.success("Amplop dibuka — semua harga tampil"); load(); reloadDetail(tid); }
    catch(e){ toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="tender-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Sourcing</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Tender</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="tender-add-btn"><Plus size={14}/> Buat Tender</Button></DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Buat Tender</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="label-tiny">Judul</Label><Input value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})} data-testid="tender-title"/></div>
              <div><Label className="label-tiny">Deskripsi</Label><Textarea value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})} data-testid="tender-desc"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="label-tiny">Deadline</Label><Input type="date" value={form.deadline||""} onChange={e=>setForm({...form,deadline:e.target.value})} data-testid="tender-deadline"/></div>
                <div><Label className="label-tiny">Terms</Label><Input value={form.terms||""} onChange={e=>setForm({...form,terms:e.target.value})} data-testid="tender-terms"/></div>
              </div>
              <div className="border border-slate-200 rounded p-3">
                <div className="flex justify-between mb-2"><div className="label-tiny">Items</div><Button size="sm" variant="outline" onClick={addItem}>+ Item</Button></div>
                {form.items.map((it,i)=>(
                  <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                    <div className="col-span-5">
                      <Select value={it.product_id} onValueChange={v=>setItem(i,"product_id",v)}>
                        <SelectTrigger data-testid={`tender-item-${i}`}><SelectValue placeholder="Product"/></SelectTrigger>
                        <SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Input type="number" placeholder="Qty" value={it.qty} onChange={e=>setItem(i,"qty",e.target.value)}/></div>
                    <div className="col-span-4"><Input placeholder="Spesifikasi" value={it.specs} onChange={e=>setItem(i,"specs",e.target.value)}/></div>
                    <div className="col-span-1 text-right pb-1"><button onClick={()=>rmItem(i)}><Trash2 size={14} className="text-red-500"/></button></div>
                  </div>
                ))}
              </div>
              <div>
                <Label className="label-tiny">Vendor Diundang (kosong = OPEN TENDER)</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-200 rounded p-2">
                  {vendors.map(v=>(
                    <label key={v.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={form.invited_vendor_ids.includes(v.id)} onChange={(e)=>{
                        const arr = e.target.checked ? [...form.invited_vendor_ids, v.id] : form.invited_vendor_ids.filter(x=>x!==v.id);
                        setForm({...form, invited_vendor_ids: arr});
                      }} data-testid={`tender-invite-${v.id}`}/>
                      {v.company_name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-start gap-2 text-xs cursor-pointer bg-slate-50 border border-slate-200 rounded p-2" data-testid="tender-bonded-toggle">
                  <input type="checkbox" className="mt-0.5" checked={!!form.is_bonded} onChange={e=>setForm({...form, is_bonded:e.target.checked})}/>
                  <div>
                    <div className="font-semibold text-sm">Bonded Tender</div>
                    <div className="text-slate-500">Untuk kawasan berikat / impor (BC 2.0, 2.3)</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer bg-purple-50 border border-purple-200 rounded p-2" data-testid="tender-sealed-toggle">
                  <input type="checkbox" className="mt-0.5" checked={!!form.is_sealed} onChange={e=>setForm({...form, is_sealed:e.target.checked})}/>
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-1"><Lock size={12}/> Sealed Bid Tender</div>
                    <div className="text-slate-500">Harga vendor tersembunyi hingga "Buka Amplop"</div>
                  </div>
                </label>
              </div>
              {/* Attachments */}
              <div className="border border-dashed border-slate-300 rounded p-3 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <Label className="label-tiny flex items-center gap-1"><Paperclip size={12}/> Dokumen Pendukung (TOR, spec, BOQ, RAB)</Label>
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" data-testid="tender-file-input" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={e=>{const f=e.target.files?.[0]; if(f){uploadDoc(f); e.target.value="";}}} disabled={uploading}/>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${uploading?"bg-slate-200 text-slate-500":"bg-blue-600 text-white hover:bg-blue-700"}`} data-testid="tender-upload-btn">
                      <Upload size={12}/>{uploading?"Mengunggah...":"Tambah File"}
                    </span>
                  </label>
                </div>
                {(form.attachments||[]).length === 0 ? (
                  <div className="text-xs text-slate-400 italic">Belum ada dokumen. PDF/JPG/DOCX/XLSX maks 10MB.</div>
                ) : (
                  <ul className="space-y-1" data-testid="tender-attach-list">
                    {form.attachments.map((a,i)=>(
                      <li key={i} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1">
                        <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate max-w-md">{a.filename}</a>
                        <button onClick={()=>rmDoc(i)} className="text-slate-400 hover:text-red-600" data-testid={`tender-attach-rm-${i}`}><X size={14}/></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="tender-save">Simpan (Draft)</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
          <Input placeholder="Cari nomor / judul / deskripsi..." value={search} onChange={e=>{setPage(1); setSearch(e.target.value);}} className="pl-8 max-w-xs" data-testid="tender-search"/>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-slate-600">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs" data-testid="tender-status-filter"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="awarded">Awarded</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-slate-600">Group by:</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-32 text-xs" data-testid="tender-groupby"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Tanpa —</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="type">Tipe (Sealed/Bonded)</SelectItem>
              <SelectItem value="month">Bulan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ExportCsvButton rows={rows} filename="tenders" columns={[
          {key:"tender_number",label:"No Tender"},{key:"title",label:"Judul"},{key:"deadline",label:"Deadline"},{key:"status",label:"Status"},
          {label:"Bids",get:t=>t.bids?.filter(b=>b.status==="submitted").length||0},
        ]}/>
        <div className="text-xs text-slate-500 ml-auto">{total} tender</div>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>No Tender</th><th>Judul</th><th>Deadline</th><th>Undangan</th><th>Bids</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {total===0 ? <tr><td colSpan={7} className="text-center py-6 text-slate-400">Belum ada tender</td></tr> : groupBy === "none" ? paged.map(t => (
              <tr key={t.id} data-testid={`tender-row-${t.id}`}>
                <td className="font-mono text-xs" data-label="No Tender">{t.tender_number}</td>
                <td data-label="Judul">{t.title} {(t.attachments||[]).length > 0 && <span className="ml-1 text-[10px] text-slate-500" title={`${t.attachments.length} dokumen pendukung`}><Paperclip size={10} className="inline"/> {t.attachments.length}</span>}</td>
                <td className="text-xs" data-label="Deadline">{t.deadline}</td>
                <td className="text-xs" data-label="Undangan">{t.invited_vendor_ids?.length ? `${t.invited_vendor_ids.length} vendor` : "OPEN"}</td>
                <td data-label="Bids">{t.bids?.filter(b=>b.status==="submitted").length || 0}</td>
                <td data-label="Status"><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[t.status]||"bg-slate-100"}`}>{t.status}</span></td>
                <td className="text-right whitespace-nowrap" data-label="Aksi">
                  <button onClick={()=>setDetail(t)} className="p-1 hover:bg-slate-100 rounded" data-testid={`tender-view-${t.id}`}><Eye size={14}/></button>
                  {t.is_sealed && <Lock size={12} className={`inline ml-1 ${t.sealed_revealed_at?"text-emerald-500":"text-purple-500"}`}/>}
                  {t.status==="draft" && <button onClick={()=>openT(t.id)} className="p-1" data-testid={`tender-open-${t.id}`}><PlayCircle size={14} className="text-emerald-600"/></button>}
                  {t.status==="open" && <button onClick={()=>closeT(t.id)} className="p-1" data-testid={`tender-close-${t.id}`}><StopCircle size={14} className="text-amber-600"/></button>}
                </td>
              </tr>
            )) : Object.entries(grouped).map(([gk, ts]) => (
              <Fragment key={`grp-${gk}`}>
                <tr className="bg-slate-100" data-testid={`tender-group-${gk}`}>
                  <td colSpan={7} className="font-semibold text-xs px-2 py-1 uppercase text-slate-700">{gk} <span className="text-slate-400 font-normal">({ts.length})</span></td>
                </tr>
                {ts.map(t => (
                  <tr key={t.id} data-testid={`tender-row-${t.id}`}>
                    <td className="font-mono text-xs">{t.tender_number}</td>
                    <td>{t.title} {(t.attachments||[]).length > 0 && <span className="ml-1 text-[10px] text-slate-500"><Paperclip size={10} className="inline"/> {t.attachments.length}</span>}</td>
                    <td className="text-xs">{t.deadline}</td>
                    <td className="text-xs">{t.invited_vendor_ids?.length ? `${t.invited_vendor_ids.length} vendor` : "OPEN"}</td>
                    <td>{t.bids?.filter(b=>b.status==="submitted").length || 0}</td>
                    <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[t.status]||"bg-slate-100"}`}>{t.status}</span></td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={()=>setDetail(t)} className="p-1 hover:bg-slate-100 rounded"><Eye size={14}/></button>
                      {t.is_sealed && <Lock size={12} className={`inline ml-1 ${t.sealed_revealed_at?"text-emerald-500":"text-purple-500"}`}/>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pages={pages} total={total} onChange={setPage} perPage={perPage}/>
      </div>

      <Sheet open={!!detail} onOpenChange={(v)=>!v && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
          {detail && (
            <>
              <SheetHeader><SheetTitle>{detail.tender_number} — {detail.title}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-600">{detail.description}</p>
                {detail.is_sealed && (
                  <div className={`p-3 border rounded text-xs flex items-center justify-between ${detail.sealed_revealed_at ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-purple-50 border-purple-200 text-purple-700"}`} data-testid="tender-sealed-block">
                    <span className="flex items-center gap-2">
                      {detail.sealed_revealed_at ? <Unlock size={14}/> : <Lock size={14}/>}
                      <b>Sealed Bid</b> — {detail.sealed_revealed_at ? `Dibuka ${new Date(detail.sealed_revealed_at).toLocaleString("id-ID")}` : "Harga tersembunyi hingga Buka Amplop"}
                    </span>
                    {!detail.sealed_revealed_at && detail.status !== "draft" && (
                      <Button size="sm" onClick={()=>reveal(detail.id)} data-testid="tender-reveal-btn"><Unlock size={12}/> Buka Amplop</Button>
                    )}
                  </div>
                )}
                {(detail.attachments||[]).length > 0 && (
                  <div data-testid="tender-detail-attachments">
                    <div className="label-tiny mb-2 flex items-center gap-1"><Paperclip size={12}/> Dokumen Pendukung ({detail.attachments.length})</div>
                    <ul className="space-y-1">
                      {detail.attachments.map((a,i)=>(
                        <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1">
                          <Paperclip size={12} className="text-slate-500"/>
                          <a href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 truncate flex-1" download={a.filename} data-testid={`tender-doc-${i}`}>{a.filename}</a>
                          <span className="text-slate-400">{a.size ? `${(a.size/1024).toFixed(1)} KB` : ""}</span>
                          <a href={a.url} target="_blank" rel="noreferrer" download={a.filename} className="text-blue-700 hover:text-blue-900" title="Unduh"><Download size={12}/></a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="label-tiny mb-2">Items</div>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Specs</th></tr></thead>
                    <tbody>{detail.items.map((it,i)=>(<tr key={i}><td>{it.product_name}</td><td>{it.qty}</td><td className="text-xs">{it.specs}</td></tr>))}</tbody>
                  </table>
                </div>
                <div>
                  <div className="label-tiny mb-2">Bids {detail.is_sealed && !detail.sealed_revealed_at && <span className="text-purple-600 font-normal">(harga di-mask)</span>}</div>
                  {detail.bids?.length ? (
                    <div className="space-y-2">
                      {detail.bids.map((b,i)=>(
                        <div key={i} className="border border-slate-200 rounded p-2" data-testid={`tender-bid-row-${b.vendor_id}`}>
                          <div className="flex items-center justify-between text-sm">
                            <div>
                              <b>{b.vendor_name}</b>
                              <span className="ml-2 text-[10px] uppercase font-semibold text-slate-500">{b.status}</span>
                              {(b.history||[]).length > 0 && <span className="ml-2 text-[10px] text-blue-600"><History size={10} className="inline"/> {b.history.length} revisi</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-semibold">{b._sealed ? <span className="text-purple-600">🔒 sealed</span> : (b.price ? fmtIDR(b.price) : "-")}</span>
                              <span className="text-xs text-slate-500">{b._sealed ? "-" : (b.delivery_days ? `${b.delivery_days} hari` : "-")}</span>
                              {detail.status==="closed" && b.status==="submitted" && <button onClick={()=>award(detail.id, b.vendor_id)} className="p-1" data-testid={`tender-award-${b.vendor_id}`}><Award size={14} className="text-blue-600"/></button>}
                            </div>
                          </div>
                          {(b.history||[]).length > 0 && !b._sealed && (
                            <ol className="relative border-l-2 border-blue-200 ml-1 mt-2 space-y-1.5 pl-3">
                              {b.history.map((h,j)=>(
                                <li key={j} className="text-[11px]" data-testid={`tender-hist-${b.vendor_id}-${j}`}>
                                  <span className="font-mono">{fmtIDR(h.price||0)}</span> · {h.delivery_days||"?"} hari · <span className="uppercase text-slate-500">{h.status}</span>
                                  <span className="text-slate-400 ml-2">{h.submitted_at ? new Date(h.submitted_at).toLocaleString("id-ID") : ""}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                          {(b.attachments||[]).length > 0 && !b._sealed && (
                            <div className="mt-1 text-[11px]">Lampiran: {b.attachments.map((a,k)=>(
                              <a key={k} href={a.url} target="_blank" rel="noreferrer" className="underline text-blue-700 mr-2">{a.filename}</a>
                            ))}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-xs text-slate-500">Belum ada bid</div>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
