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
import { Merge, Check, X, Eye, Send, Download } from "lucide-react";

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
  const [prs, setPrs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [detail, setDetail] = useState(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [selected, setSelected] = useState({});
  const [form, setForm] = useState({ po_type: "LOCAL" });

  const load = () => {
    api.get("/pos").then(r=>setPos(r.data));
    api.get("/prs").then(r=>setPrs(r.data.filter(p=>p.status==="approved")));
    api.get("/vendors?status=approved").then(r=>setVendors(r.data));
  };
  useEffect(() => { load(); }, []);

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
              <SheetHeader><SheetTitle>{detail.po_number}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="label-tiny">Type</div><div>{detail.po_type}</div></div>
                  <div><div className="label-tiny">Vendor</div><div>{vendors.find(v=>v.id===detail.vendor_id)?.company_name}</div></div>
                  <div><div className="label-tiny">Total</div><div className="font-mono font-bold">{fmtIDR(detail.total)}</div></div>
                </div>
                <div>
                  <div className="label-tiny mb-2">Items</div>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th><th>PR</th></tr></thead>
                    <tbody>{detail.items?.map((it,i)=>(<tr key={i}><td>{it.product_name}</td><td>{it.qty}</td><td className="font-mono">{fmtIDR(it.price)}</td><td className="font-mono">{fmtIDR(it.subtotal)}</td><td className="text-xs font-mono">{it.pr_number}</td></tr>))}</tbody>
                  </table>
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
