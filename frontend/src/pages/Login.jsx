import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("mahrozapradana46@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Login berhasil");
      nav("/");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2" data-testid="login-page">
      <div className="flex items-center px-8 md:px-16 py-16 bg-white">
        <div className="w-full max-w-md">
          <div className="font-heading text-2xl font-bold tracking-tight">PROCURA<span className="text-blue-600">.</span></div>
          <div className="label-tiny mt-2">E-Procurement Suite</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight mt-8 leading-none">Selamat<br/>datang kembali.</h1>
          <p className="text-sm text-slate-600 mt-3">Kelola PR, PO, tender, budget hingga dokumen kepabeanan dalam satu sistem terintegrasi.</p>
          <form onSubmit={submit} className="mt-10 space-y-4">
            <div>
              <Label htmlFor="email" className="label-tiny">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required data-testid="login-email" className="mt-1 h-11"/>
            </div>
            <div>
              <Label htmlFor="password" className="label-tiny">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required data-testid="login-password" className="mt-1 h-11"/>
            </div>
            <Button type="submit" disabled={loading} data-testid="login-submit" className="w-full h-11 bg-slate-900 hover:bg-slate-800 rounded-md">
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-6">Vendor baru? <Link to="/vendor-register" className="text-blue-600 font-semibold" data-testid="link-vendor-register">Daftarkan perusahaan Anda</Link></p>
        </div>
      </div>
      <div className="hidden md:block relative">
        <img src="https://images.unsplash.com/photo-1498262257252-c282316270bc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwyfHxhYnN0cmFjdCUyMGFyY2hpdGVjdHVyZSUyMG1pbmltYWx8ZW58MHx8fHwxNzg3MDEwNjM2fDA&ixlib=rb-4.1.0&q=85" alt="" className="w-full h-full object-cover"/>
        <div className="absolute inset-0 bg-slate-900/40"/>
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <div className="label-tiny text-white/80">Enterprise Procurement</div>
          <div className="font-heading text-3xl font-bold mt-2 leading-tight max-w-md">Dari purchase request<br/>sampai kepabeanan.</div>
        </div>
      </div>
      <Toaster richColors position="top-right"/>
    </div>
  );
}
