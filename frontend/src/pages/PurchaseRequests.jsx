import { useEffect, useMemo, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Eye, Download } from "lucide-react";

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
  converted_to_po: "bg-blue-100 text-blue-700",
};

export default function PurchaseRequests() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [depts, setDepts] = useState([]);
  const [products, setProducts] = useState([]);
  const [deptBudgets, setDeptBudgets] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ items: [], procurement_type:"DIRECT", is_bonded: false, attachments: [] });

  const load = () => api.get(`/prs?page=${page}&page_size=20&q=${encodeURIComponent(q)}`).then(r=>{ setRows(r.data.items); setTotal(r.data.total); setPages(r.data.pages); });
  useEffect(() => {
    load();
    api.get("/departments").then(r=>setDepts(r.data));
    api.get("/products").then(r=>setProducts(r.data));
  }, [page, q]);
  useEffect(() => {
    if (form.department_id) {
      api.get(`/budgets/check/${form.department_id}`).then(r => setDeptBudgets(r.data));
    } else {
      setDeptBudgets([]);
    }
  }, [form.department_id]);

  // Duplicate detection
  useEffect(() => {
    if (form.department_id && form.items.filter(i=>i.product_id).length > 0) {
      api.post("/prs/check-duplicate", { department_id: form.department_id, items: form.items }).then(r=>setDuplicates(r.data.duplicates || [])).catch(()=>setDuplicates([]));
    } else {
      setDuplicates([]);
    }
  }, [form.department_id, JSON.stringify(form.items.map(i=>i.product_id))]);

  const budgetPreview = useMemo(() => {
    const alloc = {};
    for (const it of form.items) {
      const sub = parseFloat(it.qty || 0) * parseFloat(it.price || 0);
      if (!sub) continue;
      let b = deptBudgets.find(x => x.product_id === it.product_id) || deptBudgets.find(x => x.product_id == null);
      if (!b) continue;
      alloc[b.id] = (alloc[b.id] || 0) + sub;
    }
    return alloc;
  }, [form.items, deptBudgets]);

  const addItem = () => setForm({...form, items: [...form.items, {product_id:"",qty:1,price:0}]});
  const setItem = (i,k,v) => setForm({...form, items: form.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)});
  const rmItem = (i) => setForm({...form, items: form.items.filter((_,idx)=>idx!==i)});

  const submit = async () => {
    try {
      const payload = { ...form, items: form.items.map(it => {
        const p = products.find(x=>x.id===it.product_id);
        return { ...it, qty: parseFloat(it.qty), price: parseFloat(it.price), product_name: p?.name, hs_code: p?.hs_code_id };
      }) };
      await api.post("/prs", payload);
      toast.success("PR dibuat"); setOpen(false); setForm({items:[],procurement_type:"DIRECT",is_bonded:false,attachments:[]}); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const approve = async (id) => { await api.post(`/prs/${id}/approve`); toast.success("Approved"); load(); if(detail) refresh(id); };
  const reject = async (id) => { await api.post(`/prs/${id}/reject`); toast.success("Rejected"); load(); if(detail) refresh(id); };
  const refresh = (id) => api.get(`/prs/${id}`).then(r=>setDetail(r.data));

  const total = form.items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.price||0)),0);

  return (
    <div className="space-y-4" data-testid="pr-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Procurement</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Purchase Requests</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={()=>downloadReport("/reports/prs.csv","purchase_requests.csv")} data-testid="pr-export-csv"><Download size={14}/> CSV</Button>
          <Button variant="outline" size="sm" onClick={()=>downloadReport("/reports/prs.pdf","purchase_requests.pdf")} data-testid="pr-export-pdf"><Download size={14}/> PDF</Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="pr-add-btn"><Plus size={14}/> Buat PR</Button></DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Buat Purchase Request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="label-tiny">Department *</Label>
                  <Select value={form.department_id||""} onValueChange={v=>setForm({...form,department_id:v})}>
                    <SelectTrigger data-testid="pr-dept"><SelectValue placeholder="-"/></SelectTrigger>
                    <SelectContent>{depts.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="label-tiny">Procurement Type</Label>
                  <Select value={form.procurement_type} onValueChange={v=>setForm({...form,procurement_type:v})}>
                    <SelectTrigger data-testid="pr-type"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIRECT">Penunjukan Langsung (Direct)</SelectItem>
                      <SelectItem value="TENDER">Tender</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="label-tiny">Bonded (Kawasan Berikat)</Label>
                    <div className="h-10 flex items-center"><Switch checked={form.is_bonded} onCheckedChange={v=>setForm({...form,is_bonded:v})} data-testid="pr-bonded"/></div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded p-3">
                <div className="flex justify-between mb-2"><div className="label-tiny">Items</div><Button size="sm" variant="outline" onClick={addItem} data-testid="pr-add-item">+ Item</Button></div>
                {form.items.map((it,i)=>(
                  <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                    <div className="col-span-6">
                      <Select value={it.product_id} onValueChange={v=>{
                        const p = products.find(x=>x.id===v);
                        setItem(i,"product_id",v); if(p) setItem(i,"price",p.default_price||0);
                      }}>
                        <SelectTrigger data-testid={`pr-item-prod-${i}`}><SelectValue placeholder="Pilih produk"/></SelectTrigger>
                        <SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Input type="number" placeholder="Qty" value={it.qty} onChange={e=>setItem(i,"qty",e.target.value)} data-testid={`pr-item-qty-${i}`}/></div>
                    <div className="col-span-3"><Input type="number" placeholder="Harga" value={it.price} onChange={e=>setItem(i,"price",e.target.value)} data-testid={`pr-item-price-${i}`}/></div>
                    <div className="col-span-1 text-right pb-1"><button onClick={()=>rmItem(i)}><Trash2 size={14} className="text-red-500"/></button></div>
                  </div>
                ))}
                <div className="mt-2 flex justify-end text-sm font-heading font-bold">Total: <span className="ml-2 font-mono">{fmtIDR(total)}</span></div>
              </div>

              {/* Budget preview */}
              {form.department_id && (
                <div className="border border-slate-200 rounded p-3 bg-slate-50" data-testid="pr-budget-preview">
                  <div className="label-tiny mb-2">Budget Utilization Preview</div>
                  {deptBudgets.length === 0 && <div className="text-xs text-red-600">⚠ Belum ada budget approved untuk department ini. PR akan ditolak.</div>}
                  {deptBudgets.map(b => {
                    const projected = budgetPreview[b.id] || 0;
                    const totalUsed = b.used_amount + projected;
                    const pct = b.amount ? Math.min(100, (totalUsed / b.amount) * 100) : 0;
                    const overshoot = totalUsed > b.amount;
                    const label = b.product_id ? (products.find(p=>p.id===b.product_id)?.name || "Product") : "Department (SEMUA)";
                    return (
                      <div key={b.id} className="mb-2" data-testid={`pr-budget-preview-${b.id}`}>
                        <div className="flex justify-between text-xs">
                          <div className="font-semibold">{label} <span className="font-mono text-slate-500 ml-1">{b.period}</span></div>
                          <div className={`font-mono ${overshoot ? "text-red-600 font-bold" : "text-slate-600"}`}>
                            {fmtIDR(totalUsed)} / {fmtIDR(b.amount)}
                            {projected > 0 && <span className="ml-1 text-blue-600">(+{fmtIDR(projected)})</span>}
                          </div>
                        </div>
                        <div className="mt-1 h-2 bg-slate-200 rounded-sm overflow-hidden flex">
                          <div className="bg-slate-500" style={{ width: `${b.amount ? (b.used_amount / b.amount) * 100 : 0}%` }}/>
                          <div className={overshoot ? "bg-red-500" : "bg-blue-500"} style={{ width: `${b.amount ? Math.min(100 - (b.used_amount / b.amount) * 100, (projected / b.amount) * 100) : 0}%` }}/>
                        </div>
                        {overshoot && <div className="text-[10px] text-red-600 mt-0.5">Melebihi budget sebesar {fmtIDR(totalUsed - b.amount)} — PR akan ditolak.</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Duplicate warning */}
              {duplicates.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded p-3" data-testid="pr-duplicate-warn">
                  <div className="text-xs font-semibold text-amber-800">⚠ PR mirip ditemukan dalam 30 hari terakhir:</div>
                  <ul className="mt-1 text-xs text-amber-800 space-y-0.5">
                    {duplicates.slice(0,5).map(d => (
                      <li key={d.pr_id}>• <span className="font-mono">{d.pr_number}</span> — {d.overlap_products.join(", ")} <span className="text-slate-500">({d.status}, {new Date(d.created_at).toLocaleDateString("id-ID")})</span></li>
                    ))}
                  </ul>
                </div>
              )}

              <div><Label className="label-tiny">Catatan</Label><Textarea value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} data-testid="pr-notes"/></div>

              <div>
                <Label className="label-tiny">Attachments (quote, spec, drawing) - opsional</Label>
                <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={async (e)=>{
                    const files = Array.from(e.target.files || []);
                    for (const f of files) {
                      try {
                        toast.info(`Uploading ${f.name}…`);
                        const fd = new FormData(); fd.append("file", f);
                        const t = localStorage.getItem("access_token");
                        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`, { method: "POST", credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
                        const d = await r.json();
                        if(!r.ok) throw new Error(d.detail || "Upload gagal");
                        setForm(prev => ({...prev, attachments:[...(prev.attachments||[]), { url: d.url, filename: d.filename, size: d.size, content_type: d.content_type }]}));
                      } catch(err){ toast.error(err.message); }
                    }
                    e.target.value = "";
                  }}
                  data-testid="pr-attach-input"
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-slate-900 file:text-white file:font-semibold file:cursor-pointer"/>
                {form.attachments?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {form.attachments.map((a,i)=>(
                      <li key={i} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1" data-testid={`pr-attach-item-${i}`}>
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 underline truncate">{a.filename}</a>
                        <button onClick={()=>setForm(prev=>({...prev, attachments: prev.attachments.filter((_,idx)=>idx!==i)}))} className="text-red-500 ml-2">×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={!form.items.length || !form.department_id} data-testid="pr-save">Buat PR</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input placeholder="Cari nomor PR, requester, notes…" value={q} onChange={e=>{setPage(1); setQ(e.target.value);}} className="max-w-md" data-testid="pr-search"/>
        <div className="text-xs text-slate-500 ml-auto">{total} PR · Hal {page}/{pages || 1}</div>
        <Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)} data-testid="pr-prev">‹</Button>
        <Button variant="outline" size="sm" disabled={page>=pages} onClick={()=>setPage(p=>p+1)} data-testid="pr-next">›</Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>No PR</th><th>Requester</th><th>Department</th><th>Type</th><th>Bonded</th><th>Total</th><th>Status</th><th>Warehouse</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={9} className="text-center py-6 text-slate-400">Belum ada PR</td></tr>}
            {rows.map(r => (
              <tr key={r.id} data-testid={`pr-row-${r.id}`}>
                <td className="font-mono text-xs">{r.pr_number}</td>
                <td>{r.requester_name}</td>
                <td>{depts.find(d=>d.id===r.department_id)?.name || "-"}</td>
                <td><span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100">{r.procurement_type}</span></td>
                <td>{r.is_bonded ? <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">BONDED</span> : "-"}</td>
                <td className="font-mono">{fmtIDR(r.total)}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                <td className="text-[11px] text-slate-500">{r.warehouse_status || "not_received"}</td>
                <td className="text-right whitespace-nowrap">
                  <button onClick={()=>{setDetail(r);}} className="p-1 hover:bg-slate-100 rounded" data-testid={`pr-view-${r.id}`}><Eye size={14}/></button>
                  {r.status==="pending_approval" && <>
                    <button onClick={()=>approve(r.id)} className="p-1 hover:bg-emerald-50 rounded" data-testid={`pr-approve-${r.id}`}><Check size={14} className="text-emerald-600"/></button>
                    <button onClick={()=>reject(r.id)} className="p-1 hover:bg-red-50 rounded" data-testid={`pr-reject-${r.id}`}><X size={14} className="text-red-600"/></button>
                  </>}
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
              <SheetHeader><SheetTitle>{detail.pr_number}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="label-tiny">Type</div><div>{detail.procurement_type}</div></div>
                  <div><div className="label-tiny">Bonded</div><div>{detail.is_bonded ? "Yes" : "No"}</div></div>
                  <div><div className="label-tiny">Total</div><div className="font-mono font-bold">{fmtIDR(detail.total)}</div></div>
                </div>
                <div>
                  <div className="label-tiny mb-2">Items</div>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
                    <tbody>{detail.items.map((it,i)=>(<tr key={i}><td>{it.product_name || products.find(p=>p.id===it.product_id)?.name}</td><td>{it.qty}</td><td className="font-mono">{fmtIDR(it.price)}</td><td className="font-mono">{fmtIDR(it.subtotal)}</td></tr>))}</tbody>
                  </table>
                </div>
                <div>
                  <div className="label-tiny mb-2">Approval Timeline</div>
                  <div className="space-y-2">
                    {detail.approvals?.length ? detail.approvals.map((a,i)=>(
                      <div key={i} className="flex items-center gap-3 p-2 border border-slate-200 rounded">
                        <div className={`w-7 h-7 rounded font-mono text-xs flex items-center justify-center ${a.status==="approved"?"bg-emerald-500 text-white":a.status==="rejected"?"bg-red-500 text-white":"bg-slate-200"}`}>L{a.level}</div>
                        <div className="flex-1"><div className="text-xs uppercase font-semibold">{a.role}</div><div className="text-[11px] text-slate-500">{a.at || "menunggu"}</div></div>
                        <div className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS_STYLE[a.status]||"bg-slate-100"}`}>{a.status}</div>
                      </div>
                    )) : <div className="text-xs text-slate-500">Auto-approved (tidak ada workflow)</div>}
                  </div>
                </div>
                <div>
                  <div className="label-tiny mb-2">Warehouse Tracking</div>
                  <div className="text-sm">Status: <span className="font-semibold">{detail.warehouse_status || "not_received"}</span></div>
                  <div className="text-sm">PO: <span className="font-mono">{detail.po_id || "-"}</span></div>
                </div>
                {detail.attachments?.length > 0 && (
                  <div>
                    <div className="label-tiny mb-2">Attachments</div>
                    <ul className="space-y-1">
                      {detail.attachments.map((a,i)=>(
                        <li key={i} className="text-xs"><a href={a.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{a.filename}</a> <span className="text-slate-400">{a.size ? `(${Math.round(a.size/1024)} KB)` : ""}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
