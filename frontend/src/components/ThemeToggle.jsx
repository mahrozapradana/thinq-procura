import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const KEY = "epr-theme";

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    const local = localStorage.getItem(KEY);
    return local || "light";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // Sync from server on mount
  useEffect(() => {
    api.get("/users/me/preferences").then(r => {
      const server = r.data?.theme;
      if (server && server !== theme) {
        setTheme(server);
      }
    }).catch(()=>{});
  }, []);

  const toggle = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
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
