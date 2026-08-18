import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Bell, Check } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const r = await api.get("/notifications?limit=20");
      setItems(r.data.items || []);
      setUnread(r.data.unread_count || 0);
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    load();
  };
  const markAllRead = async () => {
    await api.post(`/notifications/read-all`);
    load();
  };

  return (
    <div className="relative" data-testid="notif-bell-wrap">
      <button onClick={() => setOpen(o=>!o)} className="relative p-2 hover:bg-slate-100 rounded" data-testid="notif-bell-btn">
        <Bell size={18} className="text-slate-600"/>
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center" data-testid="notif-badge">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={()=>setOpen(false)}/>
          <div className="absolute right-0 top-full mt-1 w-96 bg-white border border-slate-200 rounded-md shadow-lg z-30" data-testid="notif-panel">
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
              <div className="font-heading font-bold text-sm">Notifikasi</div>
              {unread > 0 && <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline" data-testid="notif-mark-all">Tandai semua terbaca</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Tidak ada notifikasi</div>}
              {items.map(n => (
                <div key={n.id} className={`p-3 border-b border-slate-100 hover:bg-slate-50 ${!n.is_read?"bg-blue-50/40":""}`} data-testid={`notif-item-${n.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{n.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      {n.link && <Link to={n.link} onClick={()=>{markRead(n.id); setOpen(false);}} className="text-[10px] text-blue-600 hover:underline">Buka</Link>}
                      {!n.is_read && <button onClick={()=>markRead(n.id)} className="text-slate-400 hover:text-emerald-600" title="Tandai terbaca"><Check size={12}/></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
