import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast, Toaster } from "sonner";

export default function VendorRegister() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    company_name: "", name: "", email: "", phone: "", address: "",
    npwp: "", is_importer: false, bank_account: "", description: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/vendor/register", form);
      toast.success("Pendaftaran diterima. Menunggu approval procurement.");
      setTimeout(() => nav("/login"), 1500);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2" data-testid="vendor-register-page">
      <div className="hidden md:block relative">
        <img src="https://images.unsplash.com/photo-1494412519320-aa613dfb7738?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwyfHx3YXJlaG91c2UlMjBsb2dpc3RpY3MlMjBzaGlwcGluZyUyMGNvbnRhaW5lcnN8ZW58MHx8fHwxNzg3MDEwNjQwfDA&ixlib=rb-4.1.0&q=85" alt="" className="w-full h-full object-cover"/>
        <div className="absolute inset-0 bg-slate-900/50"/>
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <div className="label-tiny text-white/80">Vendor Portal</div>
          <div className="font-heading text-3xl font-bold mt-2">Bergabung ke jaringan supplier kami.</div>
        </div>
      </div>
      <div className="px-8 md:px-14 py-12 bg-white overflow-y-auto">
        <div className="max-w-lg">
          <Link to="/login" className="label-tiny text-slate-500" data-testid="link-back-login">← Kembali ke Login</Link>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight mt-4">Daftar Vendor Baru</h1>
          <p className="text-sm text-slate-600 mt-2">Lengkapi data perusahaan Anda. Tim procurement akan meninjau dalam 1-3 hari kerja.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="label-tiny">Nama Perusahaan *</Label><Input required value={form.company_name} onChange={(e)=>set("company_name", e.target.value)} data-testid="vr-company"/></div>
              <div><Label className="label-tiny">Kontak Person *</Label><Input required value={form.name} onChange={(e)=>set("name", e.target.value)} data-testid="vr-contact"/></div>
              <div><Label className="label-tiny">Email *</Label><Input type="email" required value={form.email} onChange={(e)=>set("email", e.target.value)} data-testid="vr-email"/></div>
              <div><Label className="label-tiny">Telepon</Label><Input value={form.phone} onChange={(e)=>set("phone", e.target.value)} data-testid="vr-phone"/></div>
              <div><Label className="label-tiny">NPWP</Label><Input value={form.npwp} onChange={(e)=>set("npwp", e.target.value)} data-testid="vr-npwp"/></div>
              <div><Label className="label-tiny">Bank Account</Label><Input value={form.bank_account} onChange={(e)=>set("bank_account", e.target.value)} data-testid="vr-bank"/></div>
            </div>
            <div><Label className="label-tiny">Alamat</Label><Textarea value={form.address} onChange={(e)=>set("address", e.target.value)} data-testid="vr-address"/></div>
            <div><Label className="label-tiny">Deskripsi</Label><Textarea value={form.description} onChange={(e)=>set("description", e.target.value)} data-testid="vr-desc"/></div>
            <div className="flex items-center justify-between border border-slate-200 rounded p-3">
              <div>
                <div className="text-sm font-semibold">Vendor Importir (Kawasan Berikat)</div>
                <div className="text-xs text-slate-500">Aktifkan jika perusahaan Anda melakukan impor / berhak submit dokumen LS.</div>
              </div>
              <Switch checked={form.is_importer} onCheckedChange={(v)=>set("is_importer", v)} data-testid="vr-importer"/>
            </div>
            <Button disabled={loading} type="submit" className="w-full h-11 bg-slate-900 hover:bg-slate-800" data-testid="vr-submit">
              {loading ? "Mendaftar..." : "Daftar Vendor"}
            </Button>
          </form>
        </div>
      </div>
      <Toaster richColors position="top-right"/>
    </div>
  );
}
