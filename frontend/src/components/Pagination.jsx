import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Client-side pagination footer.
 * Usage: <Pagination page={page} pages={Math.ceil(total/perPage)} total={total} onChange={setPage}/>
 */
export default function Pagination({ page, pages, total, onChange, perPage = 10 }) {
  if (!pages || pages <= 1) return (
    <div className="flex items-center justify-between text-xs text-slate-500 px-3 py-2 border-t border-slate-200 bg-slate-50">
      <span data-testid="pag-total">{total || 0} baris</span>
    </div>
  );
  const go = (n) => onChange(Math.min(Math.max(1, n), pages));
  const nums = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i++) nums.push(i);
  return (
    <div className="flex items-center justify-between text-xs text-slate-600 px-3 py-2 border-t border-slate-200 bg-slate-50" data-testid="pagination">
      <div><span className="font-mono">{total || 0}</span> baris · Halaman <b>{page}</b> dari <b>{pages}</b></div>
      <div className="flex items-center gap-1">
        <button onClick={()=>go(page-1)} disabled={page<=1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" data-testid="pag-prev"><ChevronLeft size={14}/></button>
        {start > 1 && <span className="px-1">…</span>}
        {nums.map(n => (
          <button key={n} onClick={()=>go(n)} className={`px-2 py-0.5 rounded font-mono ${n===page?"bg-slate-900 text-white":"hover:bg-slate-200"}`} data-testid={`pag-${n}`}>{n}</button>
        ))}
        {end < pages && <span className="px-1">…</span>}
        <button onClick={()=>go(page+1)} disabled={page>=pages} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30" data-testid="pag-next"><ChevronRight size={14}/></button>
      </div>
    </div>
  );
}

/** usePagedRows(rows, perPage) → { paged, page, setPage, pages, total } */
export function usePaged(rows, perPage = 10) {
  const total = rows?.length || 0;
  const pages = Math.max(1, Math.ceil(total / perPage));
  let page = 1;
  const [p, setP] = require("react").useState(1);
  page = Math.min(p, pages);
  const paged = (rows || []).slice((page - 1) * perPage, page * perPage);
  return { paged, page, setPage: setP, pages, total };
}
