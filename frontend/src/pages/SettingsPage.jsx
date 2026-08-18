import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const [c, setC] = useState(null);
  const [o, setO] = useState(null);

  const load = () => {
    api.get("/settings/company").then(r=>setC(r.data));
    api.get("/settings/odoo").then(r=>setO(r.data));
  };
  useEffect(()=>{ load(); },[]);

  const saveC = async () => { try{ await api.put("/settings/company", c); toast.success("Company settings updated"); }catch(e){toast.error(e.response?.data?.detail);} };
  const saveO = async () => { try{ await api.put("/settings/odoo", o); toast.success("Odoo settings updated"); }catch(e){toast.error(e.response?.data?.detail);} };
  const syncOdoo = async (endpoint, label) => {
    try {
      const r = await api.post(`/odoo/sync/${endpoint}`);
      toast.success(`${r.data.message} ${r.data.mocked ? "(MOCKED)" : ""}`);
      load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };

  if (!c || !o) return <div className="text-sm text-slate-500">Memuat...</div>;

  return (
    <div className="space-y-4" data-testid="settings-page">
      <div>
        <div className="label-tiny">Configuration</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <Tabs defaultValue="company">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="odoo" data-testid="tab-odoo">Odoo Integration</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Nama Perusahaan</Label><Input value={c.name||""} onChange={e=>setC({...c,name:e.target.value})} data-testid="cs-name"/></div>
              <div><Label className="label-tiny">NPWP</Label><Input value={c.npwp||""} onChange={e=>setC({...c,npwp:e.target.value})} data-testid="cs-npwp"/></div>
              <div><Label className="label-tiny">Email</Label><Input value={c.email||""} onChange={e=>setC({...c,email:e.target.value})} data-testid="cs-email"/></div>
              <div><Label className="label-tiny">Currency</Label><Input value={c.currency||"IDR"} onChange={e=>setC({...c,currency:e.target.value})} data-testid="cs-currency"/></div>
            </div>
            <div><Label className="label-tiny">Alamat</Label><Textarea value={c.address||""} onChange={e=>setC({...c,address:e.target.value})} data-testid="cs-address"/></div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div>
                <div className="text-sm font-semibold">Kawasan Berikat (Bonded Zone)</div>
                <div className="text-xs text-slate-500">Mengaktifkan fitur PO Bonded, LS documents, HS code untuk kepabeanan.</div>
              </div>
              <Switch checked={!!c.is_bonded_zone} onCheckedChange={v=>setC({...c,is_bonded_zone:v})} data-testid="cs-bonded"/>
            </div>
            <Button onClick={saveC} data-testid="cs-save">Simpan</Button>
          </div>
        </TabsContent>
        <TabsContent value="odoo" className="mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4">
            <div className="p-3 border border-amber-200 bg-amber-50 rounded text-xs text-amber-800">
              <strong>MOCKED:</strong> Endpoint sync ke Odoo saat ini masih simulasi. Aktifkan setelah kredensial Odoo asli diinput.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Odoo URL</Label><Input value={o.odoo_url||""} onChange={e=>setO({...o,odoo_url:e.target.value})} data-testid="odoo-url"/></div>
              <div><Label className="label-tiny">Database</Label><Input value={o.odoo_db||""} onChange={e=>setO({...o,odoo_db:e.target.value})} data-testid="odoo-db"/></div>
              <div><Label className="label-tiny">Username</Label><Input value={o.odoo_username||""} onChange={e=>setO({...o,odoo_username:e.target.value})} data-testid="odoo-user"/></div>
              <div><Label className="label-tiny">API Key</Label><Input type="password" value={o.odoo_api_key||""} onChange={e=>setO({...o,odoo_api_key:e.target.value})} data-testid="odoo-key"/></div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div className="text-sm font-semibold">Enable Integration</div>
              <Switch checked={!!o.enabled} onCheckedChange={v=>setO({...o,enabled:v})} data-testid="odoo-enabled"/>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={saveO} data-testid="odoo-save">Simpan Konfigurasi</Button>
              <Button variant="outline" onClick={()=>syncOdoo("products")} data-testid="odoo-sync-products"><RefreshCw size={14}/> Sync Products</Button>
              <Button variant="outline" onClick={()=>syncOdoo("vendors")} data-testid="odoo-sync-vendors"><RefreshCw size={14}/> Sync Vendors</Button>
              <Button variant="outline" onClick={()=>syncOdoo("pos")} data-testid="odoo-sync-pos"><RefreshCw size={14}/> Sync POs</Button>
            </div>
            {o.last_sync && <div className="text-xs text-slate-500">Last sync: {new Date(o.last_sync).toLocaleString("id-ID")}</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
