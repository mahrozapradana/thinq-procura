import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const ROLES = ["admin","procurement","requester","approver","warehouse","finance"];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [depts, setDepts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ role: "requester", approval_limit: 0 });

  const load = () => api.get("/users").then(r => setUsers(r.data));
  useEffect(() => { load(); api.get("/departments").then(r=>setDepts(r.data)); }, []);

  const submit = async () => {
    try {
      await api.post("/users", form);
      toast.success("User dibuat");
      setOpen(false); setForm({ role: "requester", approval_limit: 0 }); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal"); }
  };
  const remove = async (id) => {
    if (!confirm("Hapus user ini?")) return;
    await api.delete(`/users/${id}`); load();
  };

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex justify-between items-end">
        <div>
          <div className="label-tiny">Access Control</div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Users</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button data-testid="user-add-btn"><Plus size={14}/> Tambah User</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah User Internal</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Nama</Label><Input value={form.name||""} onChange={e=>setForm({...form,name:e.target.value})} data-testid="user-name"/></div>
              <div><Label className="label-tiny">Email</Label><Input type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} data-testid="user-email"/></div>
              <div><Label className="label-tiny">Password</Label><Input type="password" value={form.password||""} onChange={e=>setForm({...form,password:e.target.value})} data-testid="user-password"/></div>
              <div><Label className="label-tiny">Role</Label>
                <Select value={form.role} onValueChange={v=>setForm({...form,role:v})}>
                  <SelectTrigger data-testid="user-role"><SelectValue/></SelectTrigger>
                  <SelectContent>{ROLES.map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Department</Label>
                <Select value={form.department_id||""} onValueChange={v=>setForm({...form,department_id:v})}>
                  <SelectTrigger data-testid="user-dept"><SelectValue placeholder="-"/></SelectTrigger>
                  <SelectContent>{depts.map(d=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="label-tiny">Approval Limit (IDR)</Label><Input type="number" value={form.approval_limit||0} onChange={e=>setForm({...form,approval_limit:parseFloat(e.target.value||0)})} data-testid="user-limit"/></div>
            </div>
            <DialogFooter><Button onClick={submit} data-testid="user-save">Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Department</th><th>Approval Limit</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} data-testid={`user-row-${u.id}`}>
                <td>{u.name}</td><td>{u.email}</td><td><span className="uppercase text-[10px] tracking-wider font-semibold px-2 py-0.5 rounded bg-slate-100">{u.role}</span></td>
                <td>{depts.find(d=>d.id===u.department_id)?.name || "-"}</td>
                <td className="font-mono">Rp {(u.approval_limit||0).toLocaleString("id-ID")}</td>
                <td className="text-right">{u.role !== "admin" && <button onClick={()=>remove(u.id)}><Trash2 size={14} className="text-slate-400 hover:text-red-500"/></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
