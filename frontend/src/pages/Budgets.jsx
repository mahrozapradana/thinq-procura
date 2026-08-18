import { useEffect, useState } from "react";
import api, { fmtIDR } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";

const STATUS_STYLE = {
  approved: "bg-emerald-100 text-emerald-700",
  pending_approval: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  draft: "bg-slate-100 text-slate-700",
};

export default function Budgets() {
  const [rows, setRows] = useState([]);
  const [depts, setDepts] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ period: new Date().getFullYear().toString() });

  const load = () => api.get("/budgets").then(r=>setRows(r.data));
  useEffect(() => {
    load();
    api.get("/departments").then(r=>setDepts(r.data));
    api.get("/products").then(r=>setProducts(r.data));
  }, []);

  const submit = async () => {
    try {
      await api.post("/budgets", { ...form, amount: parseFloat(form.amount||0) });
      toast.success("Budget dibuat"); setOpen(false); setForm({period: new Date().getFullYear().toString()}); load();
    } catch (e) { toast.error(e.response?.data?.detail); }
  };
  const approve = async (id) => { await api.post(`/budgets/${id}/approve`); toast.success("Approved"); load(); };
  const reject = async (id) => { await api.post(`/budgets/${id}/reject`); toast.success("Rejected"); load(); };

  return (
    <div className="space-y-4" data-testid="budgets-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Financial Control</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-sm text-slate-600 mt-1">Set anggaran per department atau per barang. PR yang melebihi budget akan ditolak otomatis.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="budget-add-btn"><Plus size={14}/> Tambah Budget</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Budget</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="label-tiny">Department *</Label>
                <Select value={form.department_id||""} onValueChange={v=>setForm({...form,department_id:v})}>
                  <SelectTrigger data-testid="budget-dept"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{depts.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Product (opsional, kosong = department-level)</Label>
                <Select value={form.product_id||""} onValueChange={v=>setForm({...form,product_id:v||null})}>
                  <SelectTrigger data-testid="budget-product"><SelectValue placeholder="Semua produk"/></SelectTrigger>
                  <SelectContent>{products.map(p=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Periode (mis. 2026 atau 2026-Q1)</Label><Input value={form.period} onChange={e=>setForm({...form,period:e.target.value})} data-testid="budget-period"/></div>
              <div><Label className="label-tiny">Amount (IDR)</Label><Input type="number" value={form.amount||""} onChange={e=>setForm({...form,amount:e.target.value})} data-testid="budget-amount"/></div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="budget-save">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Department</th><th>Produk</th><th>Periode</th><th>Amount</th><th>Terpakai</th><th>Sisa</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada budget</td></tr>}
            {rows.map(b => (
              <tr key={b.id} data-testid={`budget-row-${b.id}`}>
                <td>{depts.find(d=>d.id===b.department_id)?.name || "-"}</td>
                <td>{products.find(p=>p.id===b.product_id)?.name || "Semua"}</td>
                <td className="font-mono">{b.period}</td>
                <td className="font-mono">{fmtIDR(b.amount)}</td>
                <td className="font-mono text-slate-600">{fmtIDR(b.used_amount||0)}</td>
                <td className="font-mono font-semibold">{fmtIDR((b.amount||0)-(b.used_amount||0))}</td>
                <td><span className={`px-2 py-0.5 text-[10px] uppercase font-semibold rounded ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
                <td className="text-right whitespace-nowrap">
                  {b.status==="pending_approval" && (
                    <>
                      <button onClick={()=>approve(b.id)} className="p-1 hover:bg-emerald-50 rounded" data-testid={`budget-approve-${b.id}`}><Check size={14} className="text-emerald-600"/></button>
                      <button onClick={()=>reject(b.id)} className="p-1 hover:bg-red-50 rounded ml-1" data-testid={`budget-reject-${b.id}`}><X size={14} className="text-red-600"/></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
