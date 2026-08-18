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
import { Plus, Trash2, Eye, PlayCircle, Award, StopCircle } from "lucide-react";

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
  const [form, setForm] = useState({ items:[], invited_vendor_ids:[], is_bonded:false });

  const load = () => api.get("/tenders").then(r=>setRows(r.data));
  useEffect(()=>{ load(); api.get("/products").then(r=>setProducts(r.data)); api.get("/vendors?status=approved&exclude_blacklisted=true").then(r=>setVendors(r.data));},[]);

  const addItem = () => setForm({...form, items:[...form.items,{product_id:"",qty:1,specs:""}]});
  const setItem = (i,k,v) => setForm({...form, items: form.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)});
  const rmItem = (i) => setForm({...form, items: form.items.filter((_,idx)=>idx!==i)});

  const submit = async () => {
    try {
      const payload = { ...form, items: form.items.map(it => ({...it, qty: parseFloat(it.qty), product_name: products.find(p=>p.id===it.product_id)?.name})) };
      await api.post("/tenders", payload);
      toast.success("Tender dibuat"); setOpen(false); setForm({items:[],invited_vendor_ids:[],is_bonded:false}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const openT = async (id) => { await api.post(`/tenders/${id}/open`); toast.success("Tender dibuka"); load(); };
  const closeT = async (id) => { await api.post(`/tenders/${id}/close`); toast.success("Tender ditutup"); load(); };
  const award = async (tid, vid) => { await api.post(`/tenders/${tid}/award/${vid}`); toast.success("Awarded"); load(); api.get("/tenders").then(r=>{ setRows(r.data); const t=r.data.find(x=>x.id===tid); setDetail(t); }); };

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
            </div>
            <DialogFooter><Button onClick={submit} data-testid="tender-save">Simpan (Draft)</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>No Tender</th><th>Judul</th><th>Deadline</th><th>Undangan</th><th>Bids</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">Belum ada tender</td></tr>}
            {rows.map(t => (
              <tr key={t.id} data-testid={`tender-row-${t.id}`}>
                <td className="font-mono text-xs">{t.tender_number}</td>
                <td>{t.title}</td>
                <td className="text-xs">{t.deadline}</td>
                <td className="text-xs">{t.invited_vendor_ids?.length ? `${t.invited_vendor_ids.length} vendor` : "OPEN"}</td>
                <td>{t.bids?.filter(b=>b.status==="submitted").length || 0}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[t.status]||"bg-slate-100"}`}>{t.status}</span></td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={()=>setDetail(t)} className="p-1 hover:bg-slate-100 rounded" data-testid={`tender-view-${t.id}`}><Eye size={14}/></button>
                  {t.status==="draft" && <button onClick={()=>openT(t.id)} className="p-1" data-testid={`tender-open-${t.id}`}><PlayCircle size={14} className="text-emerald-600"/></button>}
                  {t.status==="open" && <button onClick={()=>closeT(t.id)} className="p-1" data-testid={`tender-close-${t.id}`}><StopCircle size={14} className="text-amber-600"/></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!detail} onOpenChange={(v)=>!v && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white">
          {detail && (
            <>
              <SheetHeader><SheetTitle>{detail.tender_number} — {detail.title}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-600">{detail.description}</p>
                <div>
                  <div className="label-tiny mb-2">Items</div>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Specs</th></tr></thead>
                    <tbody>{detail.items.map((it,i)=>(<tr key={i}><td>{it.product_name}</td><td>{it.qty}</td><td className="text-xs">{it.specs}</td></tr>))}</tbody>
                  </table>
                </div>
                <div>
                  <div className="label-tiny mb-2">Bids</div>
                  {detail.bids?.length ? (
                    <table className="data-table">
                      <thead><tr><th>Vendor</th><th>Harga</th><th>Delivery</th><th>Status</th><th></th></tr></thead>
                      <tbody>{detail.bids.map((b,i)=>(
                        <tr key={i}>
                          <td>{b.vendor_name}</td>
                          <td className="font-mono">{b.price ? fmtIDR(b.price):"-"}</td>
                          <td>{b.delivery_days ? `${b.delivery_days} hari`:"-"}</td>
                          <td className="text-[10px] uppercase font-semibold">{b.status}</td>
                          <td className="text-right">
                            {detail.status==="closed" && b.status==="submitted" && <button onClick={()=>award(detail.id, b.vendor_id)} className="p-1" data-testid={`tender-award-${b.vendor_id}`}><Award size={14} className="text-blue-600"/></button>}
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
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
