import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, PlugZap, Send } from "lucide-react";

export default function SettingsPage() {
  const [c, setC] = useState(null);
  const [o, setO] = useState(null);
  const [n, setN] = useState(null);
  const [testEmail, setTestEmail] = useState("");

  const load = () => {
    api.get("/settings/company").then(r=>setC(r.data));
    api.get("/settings/odoo").then(r=>setO(r.data));
    api.get("/settings/notifications").then(r=>setN(r.data)).catch(()=>setN({}));
  };
  useEffect(()=>{ load(); },[]);

  const saveC = async () => { try{ await api.put("/settings/company", c); toast.success("Company settings updated"); }catch(e){toast.error(e.response?.data?.detail);} };
  const saveO = async () => { try{ await api.put("/settings/odoo", o); toast.success("Odoo settings updated"); }catch(e){toast.error(e.response?.data?.detail);} };
  const saveN = async () => { try{ await api.put("/settings/notifications", n); toast.success("SMTP settings updated"); }catch(e){toast.error(e.response?.data?.detail);} };
  const syncOdoo = async (endpoint) => {
    try {
      const r = await api.post(`/odoo/sync/${endpoint}`);
      const flag = r.data.mocked ? "(MOCKED)" : "(LIVE)";
      toast.success(`${r.data.message} ${flag}`);
      load();
    } catch(e){ toast.error(e.response?.data?.detail); }
  };
  const testOdoo = async () => {
    try { const r = await api.post("/odoo/test"); r.data.ok ? toast.success(`Konek! uid=${r.data.uid}, db=${r.data.db}`) : toast.error(r.data.message); }
    catch(e){ toast.error(e.response?.data?.detail); }
  };
  const sendTest = async () => {
    if (!testEmail) return toast.error("Isi email tujuan");
    try { const r = await api.post("/settings/notifications/test", { to: testEmail }); r.data.ok ? toast.success(r.data.message) : toast.error(r.data.message); }
    catch(e){ toast.error(e.response?.data?.detail); }
  };

  if (!c || !o || !n) return <div className="text-sm text-slate-500">Memuat...</div>;

  return (
    <div className="space-y-4" data-testid="settings-page">
      <div>
        <div className="label-tiny">Configuration</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      <Tabs defaultValue="company">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="company" data-testid="tab-company">Company</TabsTrigger>
          <TabsTrigger value="odoo" data-testid="tab-odoo">Odoo XML-RPC</TabsTrigger>
          <TabsTrigger value="notif" data-testid="tab-notif">Email SMTP</TabsTrigger>
          <TabsTrigger value="prefs" data-testid="tab-prefs">Preferensi Notif</TabsTrigger>
          <TabsTrigger value="delegation" data-testid="tab-delegation">Delegation</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Nama Perusahaan</Label><Input value={c.name||""} onChange={e=>setC({...c,name:e.target.value})} data-testid="cs-name"/></div>
              <div><Label className="label-tiny">NPWP</Label><Input value={c.npwp||""} onChange={e=>setC({...c,npwp:e.target.value})} data-testid="cs-npwp"/></div>
              <div><Label className="label-tiny">Email</Label><Input value={c.email||""} onChange={e=>setC({...c,email:e.target.value})} data-testid="cs-email"/></div>
              <div><Label className="label-tiny">Currency</Label><Input value={c.currency||"IDR"} onChange={e=>setC({...c,currency:e.target.value})} data-testid="cs-currency"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label-tiny">Threshold Re-Approval Harga Vendor (%)</Label>
                <Input type="number" step="0.5" value={c.reapproval_threshold_pct ?? 5} onChange={e=>setC({...c, reapproval_threshold_pct: parseFloat(e.target.value||0)})} data-testid="cs-threshold"/>
                <div className="text-[10px] text-slate-500 mt-1">Bila vendor ubah harga di RFQ Reply &gt; nilai ini, approval otomatis diulang.</div>
              </div>
              <div>
                <Label className="label-tiny">Kurs ke IDR (multi-currency PO)</Label>
                <div className="grid grid-cols-3 gap-1">
                  {["USD","SGD","JPY"].map(cur=>(
                    <div key={cur} className="flex items-center gap-1">
                      <span className="text-xs font-mono w-8">{cur}</span>
                      <Input type="number" value={c.exchange_rates?.[cur]||""} onChange={e=>setC({...c, exchange_rates:{...(c.exchange_rates||{}), [cur]: parseFloat(e.target.value||0)}})} data-testid={`cs-rate-${cur}`} className="h-8 text-xs"/>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[10px] text-slate-500">
                    {c.exchange_rates_fetched_at ? `Update: ${new Date(c.exchange_rates_fetched_at).toLocaleString("id-ID")}` : "Contoh: USD = 15800"}
                  </div>
                  <button type="button" onClick={async ()=>{
                    try { const r = await api.post("/settings/fetch-fx-rates"); toast.success(`Kurs terupdate: USD=${r.data.rates.USD}, SGD=${r.data.rates.SGD}, JPY=${r.data.rates.JPY}`); setC({...c, exchange_rates: r.data.rates, exchange_rates_fetched_at: r.data.fetched_at}); }
                    catch(e){ toast.error(e.response?.data?.detail); }
                  }} className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold" data-testid="cs-fetch-fx">Auto BI</button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label-tiny">Warna Brand Utama (Accent)</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={c.brand_color||"#2563EB"} onChange={e=>{ setC({...c, brand_color: e.target.value}); import("@/lib/brand").then(m=>m.applyBrandColor(e.target.value)); }} className="w-16 h-10 rounded cursor-pointer border border-slate-200" data-testid="cs-brand-color"/>
                  <Input value={c.brand_color||"#2563EB"} onChange={e=>{ setC({...c, brand_color: e.target.value}); if(/^#[0-9a-f]{6}$/i.test(e.target.value)) import("@/lib/brand").then(m=>m.applyBrandColor(e.target.value)); }} placeholder="#2563EB" data-testid="cs-brand-hex" className="font-mono"/>
                </div>
              </div>
              <div>
                <Label className="label-tiny">Logo Brand (untuk sidebar & topbar)</Label>
                <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={async(e)=>{
                  const f=e.target.files?.[0]; if(!f) return;
                  const fd=new FormData(); fd.append("file",f);
                  const t=localStorage.getItem("access_token");
                  const r=await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`,{method:"POST",credentials:"include",headers:t?{Authorization:`Bearer ${t}`}:{},body:fd});
                  const d=await r.json();
                  if(!r.ok) return toast.error(d.detail);
                  setC({...c, brand_logo_url: d.url});
                  toast.success("Logo brand terupload — jangan lupa Simpan Perusahaan");
                }} data-testid="cs-brand-logo-upload" className="mt-1 block text-xs"/>
                {c.brand_logo_url && <img src={c.brand_logo_url} alt="brand" className="mt-2 h-8 rounded border border-slate-200"/>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="label-tiny">Warna Warning (Palette Sekunder)</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={c.brand_warning_color||"#F59E0B"} onChange={e=>{ setC({...c, brand_warning_color: e.target.value}); import("@/lib/brand").then(m=>m.applyBrandPalette({warning: e.target.value})); }} className="w-14 h-9 rounded cursor-pointer border border-slate-200" data-testid="cs-brand-warning"/>
                  <span className="font-mono text-xs">{c.brand_warning_color||"#F59E0B"}</span>
                </div>
              </div>
              <div>
                <Label className="label-tiny">Warna Success</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={c.brand_success_color||"#10B981"} onChange={e=>{ setC({...c, brand_success_color: e.target.value}); import("@/lib/brand").then(m=>m.applyBrandPalette({success: e.target.value})); }} className="w-14 h-9 rounded cursor-pointer border border-slate-200" data-testid="cs-brand-success"/>
                  <span className="font-mono text-xs">{c.brand_success_color||"#10B981"}</span>
                </div>
              </div>
              <div>
                <Label className="label-tiny">Custom Domain (subdomain tenant)</Label>
                <Input value={c.custom_domain||""} onChange={e=>setC({...c, custom_domain: e.target.value})} placeholder="procura.perusahaan.com" data-testid="cs-custom-domain" className="font-mono text-xs"/>
                <div className="text-[10px] text-slate-500 mt-1">Setup DNS CNAME — lihat <code>CUSTOM_DOMAIN.md</code></div>
              </div>
            </div>
            <div><Label className="label-tiny">Alamat</Label><Textarea value={c.address||""} onChange={e=>setC({...c,address:e.target.value})} data-testid="cs-address"/></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label-tiny">Logo Perusahaan (untuk PDF PO)</Label>
                <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={async(e)=>{
                  const f = e.target.files?.[0]; if(!f) return;
                  const fd = new FormData(); fd.append("file", f);
                  const t = localStorage.getItem("access_token");
                  const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
                  const d = await r.json();
                  if(!r.ok) return toast.error(d.detail);
                  setC({...c, logo_url: d.url});
                  await api.put("/settings/branding", { logo_url: d.url });
                  toast.success("Logo diupload");
                }} data-testid="cs-logo-input" className="mt-1 block text-xs"/>
                {c.logo_url && <img src={c.logo_url} alt="logo" className="mt-2 h-16 border rounded"/>}
              </div>
              <div>
                <Label className="label-tiny">Tanda Tangan Digital</Label>
                <input type="file" accept=".png,.jpg,.jpeg" onChange={async(e)=>{
                  const f = e.target.files?.[0]; if(!f) return;
                  const fd = new FormData(); fd.append("file", f);
                  const t = localStorage.getItem("access_token");
                  const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/uploads/attachment`, { method:"POST", credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}, body: fd });
                  const d = await r.json();
                  if(!r.ok) return toast.error(d.detail);
                  setC({...c, signature_url: d.url});
                  await api.put("/settings/branding", { signature_url: d.url });
                  toast.success("Signature diupload");
                }} data-testid="cs-sig-input" className="mt-1 block text-xs"/>
                {c.signature_url && <img src={c.signature_url} alt="sig" className="mt-2 h-16 border rounded"/>}
                <Input placeholder="Nama penandatangan" value={c.signature_name||""} onChange={async(e)=>{setC({...c,signature_name:e.target.value});}} onBlur={async(e)=>{ if(e.target.value) await api.put("/settings/branding", { signature_name: e.target.value }); }} className="mt-2 text-xs" data-testid="cs-sig-name"/>
              </div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div>
                <div className="text-sm font-semibold">Kawasan Berikat (Bonded Zone)</div>
                <div className="text-xs text-slate-500">Aktifkan fitur PO Bonded, LS documents, HS code untuk kepabeanan.</div>
              </div>
              <Switch checked={!!c.is_bonded_zone} onCheckedChange={v=>setC({...c,is_bonded_zone:v})} data-testid="cs-bonded"/>
            </div>
            <Button onClick={saveC} data-testid="cs-save">Simpan</Button>
          </div>
        </TabsContent>
        <TabsContent value="odoo" className="mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4">
            <div className={`p-3 border rounded text-xs ${o.enabled?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-amber-200 bg-amber-50 text-amber-800"}`}>
              <strong>{o.enabled?"LIVE MODE":"MOCK MODE"}:</strong> {o.enabled ? "Sync akan panggil Odoo XML-RPC sesungguhnya." : "Isi kredensial lalu aktifkan 'Enable Integration' untuk sync live."}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Odoo URL</Label><Input value={o.odoo_url||""} onChange={e=>setO({...o,odoo_url:e.target.value})} placeholder="https://xxx.odoo.com" data-testid="odoo-url"/></div>
              <div><Label className="label-tiny">Database</Label><Input value={o.odoo_db||""} onChange={e=>setO({...o,odoo_db:e.target.value})} data-testid="odoo-db"/></div>
              <div><Label className="label-tiny">Username</Label><Input value={o.odoo_username||""} onChange={e=>setO({...o,odoo_username:e.target.value})} data-testid="odoo-user"/></div>
              <div><Label className="label-tiny">API Key</Label><Input type="password" value={o.odoo_api_key||""} onChange={e=>setO({...o,odoo_api_key:e.target.value})} data-testid="odoo-key"/></div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div className="text-sm font-semibold">Enable Integration (Live XML-RPC)</div>
              <Switch checked={!!o.enabled} onCheckedChange={v=>setO({...o,enabled:v})} data-testid="odoo-enabled"/>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={saveO} data-testid="odoo-save">Simpan Konfigurasi</Button>
              <Button variant="outline" onClick={testOdoo} data-testid="odoo-test"><PlugZap size={14}/> Test Koneksi</Button>
              <Button variant="outline" onClick={()=>syncOdoo("products")} data-testid="odoo-sync-products"><RefreshCw size={14}/> Sync Products</Button>
              <Button variant="outline" onClick={()=>syncOdoo("vendors")} data-testid="odoo-sync-vendors"><RefreshCw size={14}/> Sync Vendors</Button>
              <Button variant="outline" onClick={()=>syncOdoo("pos")} data-testid="odoo-sync-pos"><RefreshCw size={14}/> Sync POs</Button>
            </div>
            {o.last_sync && <div className="text-xs text-slate-500">Last sync: {new Date(o.last_sync).toLocaleString("id-ID")}</div>}
          </div>
        </TabsContent>
        <TabsContent value="notif" className="mt-4">
          <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4">
            <div className={`p-3 border rounded text-xs ${n.enabled?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-slate-200 bg-slate-50 text-slate-700"}`}>
              <strong>Email Notifikasi:</strong> Kirim notifikasi ke approver otomatis saat ada PR/PO/Budget menunggu approval. {!n.enabled && "Isi SMTP lalu enable."}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">SMTP Host</Label><Input value={n.smtp_host||""} onChange={e=>setN({...n,smtp_host:e.target.value})} placeholder="smtp.gmail.com" data-testid="smtp-host"/></div>
              <div><Label className="label-tiny">SMTP Port</Label><Input type="number" value={n.smtp_port||587} onChange={e=>setN({...n,smtp_port:parseInt(e.target.value||587)})} data-testid="smtp-port"/></div>
              <div><Label className="label-tiny">Username</Label><Input value={n.smtp_username||""} onChange={e=>setN({...n,smtp_username:e.target.value})} data-testid="smtp-user"/></div>
              <div><Label className="label-tiny">Password / App Password</Label><Input type="password" value={n.smtp_password||""} onChange={e=>setN({...n,smtp_password:e.target.value})} data-testid="smtp-pass"/></div>
              <div><Label className="label-tiny">From Email</Label><Input value={n.from_email||""} onChange={e=>setN({...n,from_email:e.target.value})} placeholder="noreply@company.com" data-testid="smtp-from"/></div>
              <div className="flex items-center gap-3 pt-6"><Switch checked={!!n.use_tls} onCheckedChange={v=>setN({...n,use_tls:v})} data-testid="smtp-tls"/><span className="text-xs">Gunakan STARTTLS (port 587)</span></div>
            </div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div className="text-sm font-semibold">Enable Email Notifications</div>
              <Switch checked={!!n.enabled} onCheckedChange={v=>setN({...n,enabled:v})} data-testid="smtp-enabled"/>
            </div>
            <div className="flex gap-2 flex-wrap items-end">
              <Button onClick={saveN} data-testid="smtp-save">Simpan SMTP</Button>
              <div className="flex-1 min-w-[200px]"><Label className="label-tiny">Test Email ke</Label><Input value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="you@example.com" data-testid="smtp-test-to"/></div>
              <Button variant="outline" onClick={sendTest} data-testid="smtp-test-send"><Send size={14}/> Kirim Test</Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="prefs" className="mt-4">
          <NotifPrefsPanel/>
        </TabsContent>
        <TabsContent value="delegation" className="mt-4">
          <DelegationPanel/>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotifPrefsPanel() {
  const TYPES = [
    { key: "rfq_reply", label: "Balasan RFQ Vendor" },
    { key: "approval", label: "Approval PR/PO/Budget" },
    { key: "rating", label: "Permintaan Rating Vendor" },
    { key: "po_new", label: "PO Baru (vendor)" },
    { key: "general", label: "Notifikasi Umum" },
  ];
  const [p, setP] = useState({ email: {}, bell: {} });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.get("/users/me/notification-prefs").then(r => {
      const d = r.data || {};
      // Normalize legacy boolean to per-type map
      const norm = (v) => typeof v === "object" && v !== null ? v : TYPES.reduce((a,t)=>({...a,[t.key]: v!==false}), {});
      setP({ email: norm(d.email), bell: norm(d.bell) });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);
  const toggle = (channel, key) => setP(prev => ({ ...prev, [channel]: {...prev[channel], [key]: !prev[channel][key]} }));
  const save = async () => {
    try { await api.put("/users/me/notification-prefs", p); toast.success("Preferensi tersimpan"); }
    catch(e){ toast.error(e.response?.data?.detail); }
  };
  if (!loaded) return <div className="text-sm text-slate-500">Memuat...</div>;
  return (
    <div className="bg-white border border-slate-200 rounded-md p-6 max-w-2xl space-y-4" data-testid="notif-prefs-panel">
      <div className="p-3 border border-blue-200 bg-blue-50 rounded text-xs text-blue-800">Atur per-tipe: mana yang mau via email, mana cukup bell in-app. Approver biasanya butuh email untuk approval. Vendor cukup bell + PO baru.</div>
      <table className="data-table">
        <thead><tr><th>Jenis Notifikasi</th><th className="text-center">Email (SMTP)</th><th className="text-center">Bell (SSE)</th></tr></thead>
        <tbody>
          {TYPES.map(t => (
            <tr key={t.key} data-testid={`prefs-row-${t.key}`}>
              <td>{t.label}</td>
              <td className="text-center"><Switch checked={!!p.email[t.key]} onCheckedChange={()=>toggle("email", t.key)} data-testid={`prefs-email-${t.key}`}/></td>
              <td className="text-center"><Switch checked={!!p.bell[t.key]} onCheckedChange={()=>toggle("bell", t.key)} data-testid={`prefs-bell-${t.key}`}/></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button onClick={save} data-testid="prefs-save">Simpan Preferensi</Button>
    </div>
  );
}

function DelegationPanel() {
  const [d, setD] = useState({ delegated_to: "", delegated_until: "" });
  const [users, setUsers] = useState([]);
  useEffect(()=>{
    api.get("/users/me/delegation").then(r=>setD({ delegated_to: r.data.delegated_to || "", delegated_until: r.data.delegated_until || "" })).catch(()=>{});
    api.get("/users").then(r=>setUsers(r.data)).catch(()=>setUsers([]));
  },[]);
  const save = async () => {
    try {
      const me = await api.get("/auth/me");
      await api.put(`/users/${me.data.id}/delegation`, { delegated_to: d.delegated_to || null, delegated_until: d.delegated_until || null });
      toast.success("Delegation tersimpan");
    } catch(e) { toast.error(e.response?.data?.detail); }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-md p-6 max-w-xl space-y-4">
      <div className="p-3 border border-blue-200 bg-blue-50 rounded text-xs text-blue-800">Saat Anda cuti/tidak tersedia, delegate akan tampil di UI sebagai approver alternatif untuk PR/PO Anda.</div>
      <div>
        <Label className="label-tiny">Delegate To (User)</Label>
        <select value={d.delegated_to||""} onChange={e=>setD({...d, delegated_to: e.target.value})} className="w-full h-10 border border-slate-200 rounded px-2 text-sm" data-testid="deleg-user">
          <option value="">— tidak ada delegasi —</option>
          {users.map(u=><option key={u.id} value={u.id}>{u.name} · {u.role} · {u.email}</option>)}
        </select>
      </div>
      <div><Label className="label-tiny">Berlaku Sampai</Label><Input type="date" value={d.delegated_until||""} onChange={e=>setD({...d,delegated_until:e.target.value})} data-testid="deleg-until"/></div>
      <Button onClick={save} data-testid="deleg-save">Simpan Delegation</Button>
    </div>
  );
}
