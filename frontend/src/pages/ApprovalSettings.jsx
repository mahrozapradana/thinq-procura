import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { fmtIDR } from "@/lib/api";

const ROLES = ["admin","procurement","requester","approver","warehouse","finance"];
const TYPES = ["PR","PO","BUDGET"];

export default function ApprovalSettings() {
  const [rows, setRows] = useState([]);
  const [depts, setDepts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ applies_to: "PR", levels: [{level:1,role:"approver",min_amount:0,max_amount:1000000000}] });

  const load = () => api.get("/approval-workflows").then(r=>setRows(r.data));
  useEffect(() => { load(); api.get("/departments").then(r=>setDepts(r.data)); }, []);

  const addLevel = () => setForm({...form, levels: [...form.levels, {level:form.levels.length+1, role:"approver", min_amount:0, max_amount:1000000000}]});
  const rmLevel = (i) => setForm({...form, levels: form.levels.filter((_,idx)=>idx!==i).map((l,idx)=>({...l,level:idx+1}))});
  const setLevel = (i,k,v) => setForm({...form, levels: form.levels.map((l,idx)=>idx===i?{...l,[k]:v}:l)});

  const submit = async () => {
    try {
      await api.post("/approval-workflows", form);
      toast.success("Workflow dibuat"); setOpen(false); setForm({ applies_to: "PR", levels: [{level:1,role:"approver",min_amount:0,max_amount:1000000000}] }); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const remove = async (id) => { if(!confirm("Hapus workflow?")) return; await api.delete(`/approval-workflows/${id}`); load(); };

  return (
    <div className="space-y-4" data-testid="approval-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Governance</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Approval Workflow</h1>
          <p className="text-sm text-slate-600 mt-1">Set jenjang approval fleksibel — per PR, PO, atau Budget. Setiap jenjang bisa punya limit nominal.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="wf-add-btn"><Plus size={14}/> Tambah Workflow</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Buat Approval Workflow</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="label-tiny">Nama</Label><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} data-testid="wf-name"/></div>
                <div><Label className="label-tiny">Berlaku Untuk</Label>
                  <Select value={form.applies_to} onValueChange={v=>setForm({...form,applies_to:v})}>
                    <SelectTrigger data-testid="wf-applies"><SelectValue/></SelectTrigger>
                    <SelectContent>{TYPES.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="label-tiny">Department (kosong=semua)</Label>
                  <Select value={form.department_id||""} onValueChange={v=>setForm({...form,department_id:v||null})}>
                    <SelectTrigger data-testid="wf-dept"><SelectValue placeholder="Semua dept"/></SelectTrigger>
                    <SelectContent>{depts.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border border-slate-200 rounded p-3">
                <div className="flex justify-between mb-2"><div className="label-tiny">Levels</div><Button size="sm" variant="outline" onClick={addLevel} data-testid="wf-add-level">+ Tambah Level</Button></div>
                {form.levels.map((l,i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                    <div className="col-span-1 text-center font-mono text-slate-500 pb-2">L{l.level}</div>
                    <div className="col-span-3"><Label className="label-tiny">Role</Label>
                      <Select value={l.role} onValueChange={v=>setLevel(i,"role",v)}>
                        <SelectTrigger data-testid={`wf-role-${i}`}><SelectValue/></SelectTrigger>
                        <SelectContent>{ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3"><Label className="label-tiny">Min IDR</Label><Input type="number" value={l.min_amount} onChange={e=>setLevel(i,"min_amount",parseFloat(e.target.value||0))} data-testid={`wf-min-${i}`}/></div>
                    <div className="col-span-3"><Label className="label-tiny">Max IDR</Label><Input type="number" value={l.max_amount} onChange={e=>setLevel(i,"max_amount",parseFloat(e.target.value||0))} data-testid={`wf-max-${i}`}/></div>
                    <div className="col-span-2 text-right pb-1"><button onClick={()=>rmLevel(i)}><Trash2 size={14} className="text-red-500"/></button></div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="wf-save">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map(w => (
          <div key={w.id} className="bg-white border border-slate-200 rounded-md p-4" data-testid={`wf-card-${w.id}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="label-tiny">{w.applies_to}</div>
                <div className="font-heading font-bold text-lg mt-1">{w.name}</div>
                <div className="text-xs text-slate-500">{depts.find(d=>d.id===w.department_id)?.name || "Semua Department"}</div>
              </div>
              <button onClick={()=>remove(w.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-500"/></button>
            </div>
            <div className="mt-3 space-y-1.5">
              {w.levels.map(l => (
                <div key={l.level} className="flex items-center gap-2 text-xs">
                  <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-mono text-[10px]">L{l.level}</div>
                  <div className="uppercase tracking-wider font-semibold text-slate-700">{l.role}</div>
                  <div className="text-slate-500 font-mono ml-auto">{fmtIDR(l.min_amount)} – {fmtIDR(l.max_amount)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
