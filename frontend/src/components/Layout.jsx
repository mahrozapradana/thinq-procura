import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import NotificationsBell from "@/components/NotificationsBell";
import ThemeToggle from "@/components/ThemeToggle";
import api from "@/lib/api";
import { applyBrandPalette } from "@/lib/brand";
import {
  LayoutDashboard, Package, Building2, Tag, Users, FileText,
  ClipboardList, Gavel, Warehouse, Wallet, Settings, LogOut,
  Ship, Receipt, ScrollText, ShieldCheck, Handshake, Menu, X, ChevronsLeft, ChevronsRight,
} from "lucide-react";

const INTERNAL_ROLES = ["admin", "procurement", "requester", "approver", "warehouse", "finance"];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isVendor = user?.role === "vendor";
  const [counts, setCounts] = useState({ rfq: 0, po: 0, invoice: 0, tender: 0, pr: 0, vendors: 0, invoices: 0, customs: 0, receipts: 0 });

  useEffect(() => {
    const endpoint = isVendor ? "/vendor-portal/unread-counts" : "/internal/unread-counts";
    const load = () => api.get(endpoint).then(r => setCounts(prev => ({...prev, ...r.data}))).catch(()=>{});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [isVendor]);

  const [brand, setBrand] = useState({});
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("epr-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("epr-sidebar", next ? "collapsed" : "expanded");
  };

  // Apply tenant brand palette + logo from company settings
  useEffect(() => {
    api.get("/settings/company").then(r => {
      const d = r.data || {};
      setBrand({ logo: d.brand_logo_url, name: d.name });
      applyBrandPalette({ primary: d.brand_color, warning: d.brand_warning_color, success: d.brand_success_color });
    }).catch(()=>{});
  }, []);

  const Badge = ({ n }) => n > 0 ? <span className="ml-auto text-[10px] min-w-[16px] h-4 px-1 bg-red-500 text-white font-bold rounded-full flex items-center justify-center" data-testid="side-badge">{n > 99 ? "99+" : n}</span> : null;

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-50" data-testid="app-shell">
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={()=>setMobileOpen(false)}/>}
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white flex-shrink-0 flex flex-col transition-all duration-200 z-40 ${collapsed ? "w-16" : "w-64"} ${mobileOpen ? "fixed inset-y-0 left-0" : "hidden lg:flex"}`} data-testid="sidebar">
        <div className="px-3 py-4 border-b border-white/10 flex items-center justify-between">
          {!collapsed && (brand.logo ? (
            <img src={brand.logo} alt={brand.name || "logo"} className="max-h-10 max-w-[150px] object-contain"/>
          ) : (
            <div>
              <div className="font-heading text-lg font-bold tracking-tight">PROCURA<span className="text-blue-400">.</span></div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 mt-1">E-Procurement</div>
            </div>
          ))}
          <button onClick={toggleSidebar} className="hidden lg:block text-slate-400 hover:text-white p-1" data-testid="sidebar-toggle" title={collapsed?"Expand":"Collapse"}>
            {collapsed ? <ChevronsRight size={16}/> : <ChevronsLeft size={16}/>}
          </button>
          <button onClick={()=>setMobileOpen(false)} className="lg:hidden text-slate-400 hover:text-white p-1" data-testid="sidebar-close-mobile">
            <X size={16}/>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
            {isVendor ? (
            <>
              <div className="side-group-label">Vendor Portal</div>
              <NavLink to="/vendor" end className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-home">
                <LayoutDashboard size={16}/> Dashboard
              </NavLink>
              <NavLink to="/vendor/tenders" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-tenders">
                <Gavel size={16}/> Tender Terbuka<Badge n={counts.tender}/>
              </NavLink>
              <NavLink to="/vendor/rfqs" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-rfqs">
                <ClipboardList size={16}/> RFQ / PO Menunggu<Badge n={counts.rfq}/>
              </NavLink>
              <NavLink to="/vendor/pos" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-pos">
                <FileText size={16}/> Purchase Orders<Badge n={counts.po}/>
              </NavLink>
              <NavLink to="/vendor/shipments" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-shipments">
                <Ship size={16}/> Pengiriman
              </NavLink>
              <NavLink to="/vendor/invoices" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-invoices">
                <Receipt size={16}/> Invoice / Penagihan<Badge n={counts.invoice}/>
              </NavLink>
              <NavLink to="/vendor/ls" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-ls">
                <ScrollText size={16}/> Dokumen LS
              </NavLink>
              <NavLink to="/vendor/pricelists" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendor-pricelists">
                <Tag size={16}/> Daftar Harga Saya
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
                <ClipboardList size={16}/> Purchase Requests<Badge n={counts.pr}/>
              </NavLink>
              <NavLink to="/po" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-po">
                <FileText size={16}/> Purchase Orders<Badge n={counts.po}/>
              </NavLink>
              <NavLink to="/tenders" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-tenders">
                <Gavel size={16}/> Tender<Badge n={counts.tender}/>
              </NavLink>
              <NavLink to="/vendors-mgmt" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-vendors">
                <Handshake size={16}/> Vendors<Badge n={counts.vendors}/>
              </NavLink>
              <div className="side-group-label">Warehouse</div>
              <NavLink to="/inventory" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-inventory">
                <Warehouse size={16}/> Penerimaan & Retur<Badge n={counts.receipts}/>
              </NavLink>
              <NavLink to="/customs" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-customs">
                <ScrollText size={16}/> Dokumen Impor (BC)<Badge n={counts.customs}/>
              </NavLink>
              <NavLink to="/stock" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-stock">
                <Package size={16}/> Stok per Lokasi
              </NavLink>
              <NavLink to="/invoices" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-invoices">
                <Receipt size={16}/> Invoice Finance<Badge n={counts.invoices}/>
              </NavLink>
              <NavLink to="/tax-reports" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-tax-reports">
                <ScrollText size={16}/> Laporan Pajak
              </NavLink>
              <NavLink to="/branch-analytics" className={({isActive}) => `side-link ${isActive?'active':''}`} data-testid="nav-branch-analytics">
                <ScrollText size={16}/> Analitik Divisi
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
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20" data-testid="topbar">
          <div className="flex items-center gap-3">
            <button onClick={()=>setMobileOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded" data-testid="hamburger">
              <Menu size={20}/>
            </button>
            <div className="text-sm text-slate-600 hidden sm:block">
              <span className="label-tiny mr-2">Company</span>
              <span className="font-heading font-semibold text-slate-900">{brand.name || "Kawasan Berikat Aktif"}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle/>
            <NotificationsBell/>
            <div className="text-xs text-slate-500 font-mono">{new Date().toLocaleString("id-ID")}</div>
          </div>
        </header>
        <div className="p-6 flex-1 min-w-0 fade-up">{children}</div>

      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
