import { useState, useMemo, useEffect } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown, Bookmark, Save, Trash2, X } from "lucide-react";

/**
 * useDataTable — sort + filter + bulk selection + saved views.
 * Usage:
 *   const dt = useDataTable(rows, { storageKey: "vendor-pos", defaultSort: {key:"created_at", dir:"desc"} });
 *   dt.sortedRows, dt.filteredRows, dt.selectedIds, dt.SortHeader, dt.FilterInput, dt.BulkToolbar, dt.SavedViewsBar
 */
export function useDataTable(rows, { storageKey, defaultSort } = {}) {
  const [sort, setSort] = useState(defaultSort || { key: null, dir: "asc" });
  const [filters, setFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [views, setViews] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`dt:${storageKey}`) || "[]"); } catch { return []; }
  });

  useEffect(() => { setSelectedIds([]); }, [rows?.length]);

  const filteredRows = useMemo(() => {
    return (rows || []).filter(r => {
      return Object.entries(filters).every(([k, v]) => {
        if (v === "" || v == null) return true;
        // Range filter: { min, max }
        if (typeof v === "object" && (v.min != null || v.max != null)) {
          const num = parseFloat(r[k]);
          if (!isNaN(num)) {
            if (v.min !== "" && v.min != null && num < parseFloat(v.min)) return false;
            if (v.max !== "" && v.max != null && num > parseFloat(v.max)) return false;
            return true;
          }
          // Date string range
          const val = String(r[k] || "");
          if (v.min && val < String(v.min)) return false;
          if (v.max && val > String(v.max)) return false;
          return true;
        }
        // Dropdown: exact match
        if (typeof v === "object" && v.eq != null) return String(r[k] ?? "") === String(v.eq);
        // Text: substring
        const cell = String(r[k] ?? "").toLowerCase();
        return cell.includes(String(v).toLowerCase());
      });
    });
  }, [rows, filters]);

  const sortedRows = useMemo(() => {
    if (!sort.key) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [filteredRows, sort]);

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({});

  const toggleId = (id) => setSelectedIds(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const toggleAll = () => setSelectedIds(sel => sel.length === sortedRows.length ? [] : sortedRows.map(r => r.id));
  const clearSelection = () => setSelectedIds([]);

  const saveView = () => {
    const name = prompt("Nama View (mis: 'PO Bonded Menunggu'):");
    if (!name) return;
    const next = [...views.filter(v => v.name !== name), { name, sort, filters }];
    setViews(next);
    localStorage.setItem(`dt:${storageKey}`, JSON.stringify(next));
  };
  const applyView = (v) => { setSort(v.sort); setFilters(v.filters); };
  const deleteView = (name) => {
    const next = views.filter(v => v.name !== name);
    setViews(next);
    localStorage.setItem(`dt:${storageKey}`, JSON.stringify(next));
  };

  const SortHeader = ({ k, children }) => (
    <th onClick={() => toggleSort(k)} className="cursor-pointer select-none hover:bg-slate-200/60" data-testid={`sort-${k}`}>
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {sort.key === k ? (sort.dir === "asc" ? <ArrowUp size={11}/> : <ArrowDown size={11}/>) : <ChevronsUpDown size={11} className="opacity-30"/>}
      </div>
    </th>
  );

  const FilterInput = ({ k, placeholder = "", type = "text", options }) => {
    if (type === "dropdown" && options) {
      const cur = filters[k]?.eq ?? "";
      return (
        <select value={cur} onChange={e => setFilter(k, e.target.value ? { eq: e.target.value } : "")}
          className="w-full text-[11px] px-1 py-1 border border-slate-200 rounded bg-white" data-testid={`filter-${k}`}>
          <option value="">Semua</option>
          {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      );
    }
    if (type === "range" || type === "range-date") {
      const cur = filters[k] || {};
      const inputType = type === "range-date" ? "date" : "number";
      return (
        <div className="flex gap-0.5">
          <input type={inputType} value={cur.min || ""} onChange={e => setFilter(k, { ...cur, min: e.target.value })} placeholder="min" className="w-1/2 text-[10px] px-1 py-1 border border-slate-200 rounded" data-testid={`filter-${k}-min`}/>
          <input type={inputType} value={cur.max || ""} onChange={e => setFilter(k, { ...cur, max: e.target.value })} placeholder="max" className="w-1/2 text-[10px] px-1 py-1 border border-slate-200 rounded" data-testid={`filter-${k}-max`}/>
        </div>
      );
    }
    return (
      <input value={filters[k] || ""} onChange={e => setFilter(k, e.target.value)}
        placeholder={placeholder || "Filter..."} className="w-full text-[11px] px-1.5 py-1 border border-slate-200 rounded"
        data-testid={`filter-${k}`}/>
    );
  };

  const FilterRow = ({ cols }) => (
    <tr className="bg-slate-50 border-t border-slate-200">
      {cols.map((c, i) => (
        <th key={i} className="px-2 py-1 font-normal">
          {c.filter !== false ? <FilterInput k={c.key || i} placeholder={c.label} type={c.filter} options={c.options}/> : null}
        </th>
      ))}
    </tr>
  );

  const SelectAllCheckbox = () => (
    <input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === sortedRows.length} onChange={toggleAll} data-testid="bulk-select-all"/>
  );
  const RowCheckbox = ({ id }) => (
    <input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleId(id)} data-testid={`bulk-select-${id}`}/>
  );

  const BulkToolbar = ({ actions = [] }) => selectedIds.length > 0 ? (
    <div className="flex items-center gap-2 bg-slate-900 text-white p-2 rounded" data-testid="bulk-toolbar">
      <span className="text-xs font-semibold ml-2">{selectedIds.length} terpilih</span>
      <div className="flex-1"/>
      {actions.map((a, i) => (
        <button key={i} onClick={() => a.onClick(selectedIds, clearSelection)} className={`text-xs px-3 py-1 rounded font-semibold ${a.className || "bg-white text-slate-900 hover:bg-slate-100"}`} data-testid={`bulk-action-${a.key}`}>
          {a.label}
        </button>
      ))}
      <button onClick={clearSelection} className="text-white/70 hover:text-white" data-testid="bulk-clear"><X size={14}/></button>
    </div>
  ) : null;

  const SavedViewsBar = () => (
    <div className="flex items-center gap-1 flex-wrap" data-testid="saved-views-bar">
      <Bookmark size={13} className="text-slate-500"/>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Views:</span>
      {views.length === 0 && <span className="text-xs text-slate-400 italic">belum ada preset</span>}
      {views.map(v => (
        <span key={v.name} className="inline-flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 rounded px-2 py-0.5 cursor-pointer" data-testid={`view-${v.name}`}>
          <span onClick={() => applyView(v)}>{v.name}</span>
          <button onClick={() => deleteView(v.name)} className="text-slate-400 hover:text-red-500"><Trash2 size={10}/></button>
        </span>
      ))}
      <button onClick={saveView} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 hover:bg-slate-100 inline-flex items-center gap-1" data-testid="view-save">
        <Save size={10}/> Simpan
      </button>
      {(Object.keys(filters).length > 0 || sort.key) && (
        <button onClick={()=>{clearFilters(); setSort({key:null,dir:"asc"});}} className="text-[10px] text-red-600 hover:underline" data-testid="view-clear">Reset filter</button>
      )}
    </div>
  );

  return { sort, filters, sortedRows, filteredRows, selectedIds, toggleId, toggleAll, clearSelection,
    SortHeader, FilterInput, FilterRow, SelectAllCheckbox, RowCheckbox, BulkToolbar, SavedViewsBar };
}
