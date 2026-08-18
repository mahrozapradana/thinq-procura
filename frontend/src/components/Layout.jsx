import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import {
  LayoutDashboard, Package, Building2, Tag, Users, FileText,
  ClipboardList, Gavel, Warehouse, Wallet, Settings, LogOut,
  Ship, Receipt, ScrollText, ShieldCheck, Handshake,
} from "lucide-react";

const INTERNAL_ROLES = ["admin", "procurement", "requester", "approver", "warehouse", "finance"];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isVendor = user?.role === "vendor";

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-50" data-testid="app-shell">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-slate-900 text-white flex flex-col" data-testid="sidebar">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-heading text-lg font-bold tracking-tight">PROCURA<span className="text-blue-400">.</span></div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 mt-1">E-Procurement Suite</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {isVendor ? (
            <>
              <div className="side-group-label">Vendor Portal</div>
              <NavLink to="/vendor" end className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-home">
                <LayoutDashboard size={16}/> Dashboard
              </NavLink>
              <NavLink to="/vendor/tenders" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-tenders">
                <Gavel size={16}/> Tender Terbuka
              </NavLink>
              <NavLink to="/vendor/rfqs" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-rfqs">
                <ClipboardList size={16}/> RFQ / PO Menunggu
              </NavLink>
              <NavLink to="/vendor/pos" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-pos">
                <FileText size={16}/> Purchase Orders
              </NavLink>
              <NavLink to="/vendor/shipments" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-shipments">
                <Ship size={16}/> Pengiriman
              </NavLink>
              <NavLink to="/vendor/invoices" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-invoices">
                <Receipt size={16}/> Invoice / Penagihan
              </NavLink>
              <NavLink to="/vendor/ls" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-ls">
                <ScrollText size={16}/> Dokumen LS
              </NavLink>
              <NavLink to="/vendor/profile" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-profile">
                <Building2 size={16}/> Profil Perusahaan
              </NavLink>
            </>
          ) : (
            <>
              <div className="side-group-label">Overview</div>
              <NavLink to="/" end className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-dashboard">
                <LayoutDashboard size={16}/> Dashboard
              </NavLink>
              <div className="side-group-label">Procurement</div>
              <NavLink to="/pr" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-pr">
                <ClipboardList size={16}/> Purchase Requests
              </NavLink>
              <NavLink to="/po" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-po">
                <FileText size={16}/> Purchase Orders
              </NavLink>
              <NavLink to="/tenders" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-tenders">
                <Gavel size={16}/> Tender
              </NavLink>
              <NavLink to="/vendors-mgmt" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendors">
                <Handshake size={16}/> Vendors
              </NavLink>
              <div className="side-group-label">Warehouse</div>
              <NavLink to="/inventory" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-inventory">
                <Warehouse size={16}/> Penerimaan & Retur
              </NavLink>
              <NavLink to="/customs" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-customs">
                <ScrollText size={16}/> Dokumen Impor (BC)
              </NavLink>
              <NavLink to="/stock" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-stock">
                <Package size={16}/> Stok per Lokasi
              </NavLink>
              <NavLink to="/invoices" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-invoices">
                <Receipt size={16}/> Invoice Finance
              </NavLink>
              <NavLink to="/tax-reports" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-tax-reports">
                <ScrollText size={16}/> Laporan Pajak
              </NavLink>
              <div className="side-group-label">Master Data</div>
              <NavLink to="/masters" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-masters">
                <Package size={16}/> Master Data
              </NavLink>
              <NavLink to="/budgets" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-budgets">
                <Wallet size={16}/> Budgets
              </NavLink>
              <NavLink to="/approvals" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-approvals">
                <ShieldCheck size={16}/> Approval Workflow
              </NavLink>
              <div className="side-group-label">Admin</div>
              <NavLink to="/users" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-users">
                <Users size={16}/> Users
              </NavLink>
              <NavLink to="/settings" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-settings">
                <Settings size={16}/> Settings
              </NavLink>
            </>
          )}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-xs font-bold uppercase">
              {user?.name?.[0] || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-3 py-2 rounded"
            data-testid="logout-btn"
          >
            <LogOut size={14}/> Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 sticky top-0 z-20" data-testid="topbar">
          <div className="text-sm text-slate-600">
            <span className="label-tiny mr-2">Company</span>
            <span className="font-heading font-semibold text-slate-900">Kawasan Berikat Aktif</span>
          </div>
          <div className="text-xs text-slate-500 font-mono">{new Date().toLocaleString("id-ID")}</div>
        </header>
        <div className="p-6 flex-1 min-w-0 fade-up">{children}</div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
