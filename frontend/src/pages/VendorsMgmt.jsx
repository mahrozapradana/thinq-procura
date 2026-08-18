import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Check, X, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS = {
  approved:"bg-emerald-100 text-emerald-700",
  pending_approval:"bg-amber-100 text-amber-700",
  rejected:"bg-red-100 text-red-700",
};

export default function VendorsMgmt() {
  const [rows, setRows] = useState([]);
  const [approving, setApproving] = useState(null);
  const [pw, setPw] = useState("vendor123");

  const load = () => api.get("/vendors").then(r=>setRows(r.data));
  useEffect(()=>{ load(); },[]);

  const approve = async () => {
    try {
      const r = await api.post(`/vendors/${approving.id}/approve`, { default_password: pw });
      toast.success(`Vendor disetujui. Password default: ${r.data.default_password || "(sudah ada)"}`);
      setApproving(null); load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const reject = async (id) => { await api.post(`/vendors/${id}/reject`); toast.success("Vendor ditolak"); load(); };

  return (
    <div className="space-y-4" data-testid="vendors-mgmt-page">
      <div>
        <div className="label-tiny">Partners</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Vendor Management</h1>
        <p className="text-sm text-slate-600 mt-1">Review pendaftar baru, approve untuk buat akun vendor portal.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Perusahaan</th><th>Kontak</th><th>Email</th><th>NPWP</th><th>Importir</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={7} className="text-center py-6 text-slate-400">Belum ada vendor</td></tr>}
            {rows.map(v=>(
              <tr key={v.id} data-testid={`vendor-row-${v.id}`}>
                <td className="font-semibold">{v.company_name}</td>
                <td>{v.name}</td>
                <td className="text-xs">{v.email}</td>
                <td className="text-xs font-mono">{v.npwp||"-"}</td>
                <td>{v.is_importer ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold uppercase">Importir</span> : "-"}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${STATUS[v.status]}`}>{v.status}</span></td>
                <td className="text-right whitespace-nowrap">
                  {v.status==="pending_approval" && <>
                    <button onClick={()=>{setApproving(v); setPw("vendor123");}} className="p-1 hover:bg-emerald-50 rounded" data-testid={`vendor-approve-${v.id}`}><Check size={14} className="text-emerald-600"/></button>
                    <button onClick={()=>reject(v.id)} className="p-1 hover:bg-red-50 rounded" data-testid={`vendor-reject-${v.id}`}><X size={14} className="text-red-600"/></button>
                  </>}
                  {v.status==="approved" && <UserCheck size={14} className="text-emerald-600 inline"/>}
                </td>
              </tr>
            ))}
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
    </div>
  );
}
