import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const KEY = "epr-theme";
const KEY_INIT = "epr-theme-inited";

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    let stored = localStorage.getItem(KEY);
    if (!stored) {
      // First-time visit → auto-detect from OS
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      stored = prefersDark ? "dark" : "light";
      localStorage.setItem(KEY, stored);
      localStorage.setItem(KEY_INIT, "1");
    }
    return stored;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Sync from server on mount (server pref overrides after login)
  useEffect(() => {
    api.get("/users/me/preferences").then(r => {
      const server = r.data?.theme;
      if (server && server !== theme) setTheme(server);
    }).catch(()=>{});
  }, []);

  // Also listen to OS theme changes when user hasn't manually toggled
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (!mq) return;
    const handler = (e) => {
      // Only auto-follow if user has never manually toggled after init
      if (localStorage.getItem(KEY_INIT) === "1") setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const toggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    localStorage.removeItem(KEY_INIT); // user chose manually — stop OS auto-follow
    try {
      await api.put("/users/me/preferences", { theme: next });
      toast.success(`Tema: ${next === "dark" ? "Gelap" : "Terang"}`);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      title={`Ganti ke ${theme === "dark" ? "Light" : "Dark"} mode`}
      data-testid="theme-toggle"
    >
      {theme === "dark" ? <Sun size={18} className="text-amber-400"/> : <Moon size={18} className="text-slate-600"/>}
    </button>
  );
}
