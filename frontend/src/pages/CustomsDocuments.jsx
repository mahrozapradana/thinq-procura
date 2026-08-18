import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Cog, Plus, Trash2, Eye, Send } from "lucide-react";

const BC = [
  { key: "BC 2.0", label: "BC 2.0", color: "bg-yellow-500" },
  { key: "BC 2.3", label: "BC 2.3", color: "bg-yellow-500" },
  { key: "BC 2.6.2", label: "BC 2.6.2", color: "bg-yellow-500" },
  { key: "BC 2.7", label: "BC 2.7", color: "bg-yellow-500" },
  { key: "BC 4.0", label: "BC 4.0", color: "bg-yellow-500" },
];

export default function CustomsDocuments() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const bcFilter = params.get("bc") || "";
  const editId = params.get("edit");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("header");

  const load = () => api.get(`/customs-docs?page=${page}&page_size=15&q=${encodeURIComponent(q)}${bcFilter?`&bc_type=${encodeURIComponent(bcFilter)}`:""}`).then(r=>{ setRows(r.data.items); setTotal(r.data.total); });
  useEffect(()=>{ load(); },[page, q, bcFilter]);
  useEffect(()=>{ if(editId) api.get(`/customs-docs/${editId}`).then(r=>{ setDetail(r.data); setTab("header"); }); },[editId]);

  const newDoc = (bc) => {
    api.post("/customs-docs", { bc_type: bc }).then(r => { setDetail(r.data); setTab("header"); load(); });
  };
  const save = async () => {
    try { await api.put(`/customs-docs/${detail.id}`, detail); toast.success("Tersimpan"); load(); }
    catch(e) { toast.error(e.response?.data?.detail); }
  };
  const submit = async () => {
    try { await api.post(`/customs-docs/${detail.id}/submit`); toast.success("Submitted"); setDetail(null); load(); }
    catch(e) { toast.error(e.response?.data?.detail); }
  };

  return (
    <div className="space-y-4" data-testid="customs-page">
      <div>
        <div className="label-tiny">Warehouse / Kepabeanan</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Dokumen Impor (BC)</h1>
        <p className="text-sm text-slate-600 mt-1">Kelola dokumen kepabeanan BC 2.0, 2.3, 2.6.2, 2.7, 4.0 untuk PO Bonded / Kawasan Berikat.</p>
      </div>

      {/* BC tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BC.map(b => (
          <button key={b.key} onClick={()=>newDoc(b.key)} data-testid={`bc-tile-${b.key.replace(/\s|\./g,'')}`}
            className={`relative h-24 ${b.color} hover:brightness-110 rounded shadow-sm text-slate-900 flex flex-col`}>
            <span className="absolute top-2 left-3 text-xs font-semibold">{b.label}</span>
            <Cog size={40} className="m-auto"/>
            <span className="absolute bottom-2 right-3 text-xs font-semibold">{b.label}</span>
          </button>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Input placeholder="Cari register no / BL / CAR…" value={q} onChange={e=>{setPage(1); setQ(e.target.value);}} className="max-w-md" data-testid="customs-search"/>
        <Select value={bcFilter} onValueChange={v=>setParams(v?{bc:v}:{})}>
          <SelectTrigger className="max-w-xs" data-testid="customs-bc-filter"><SelectValue placeholder="Semua BC Type"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Semua BC Type</SelectItem>
            {BC.map(b=><SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-slate-500 ml-auto">{total} dokumen</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-md overflow-x-auto">
        <table className="data-table" style={{ minWidth: 900 }}>
          <thead><tr><th>No Dokumen</th><th>BC Type</th><th>Register No</th><th>BL No</th><th>Supplier</th><th>Value</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">Belum ada dokumen</td></tr>}
            {rows.map(r=>(
              <tr key={r.id} data-testid={`customs-row-${r.id}`}>
                <td className="font-mono text-xs">{r.doc_number}</td>
                <td><span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">{r.bc_type}</span></td>
                <td className="font-mono text-xs">{r.register_no||"-"}</td>
                <td className="text-xs">{r.bl_no||"-"}</td>
                <td className="text-xs">{r.supplier||"-"}</td>
                <td className="font-mono text-xs">{r.currency} {(r.value||0).toLocaleString("id-ID")}</td>
                <td><span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${r.status==="submitted"?"bg-emerald-100 text-emerald-700":"bg-slate-100"}`}>{r.status}</span></td>
                <td className="text-right"><button onClick={()=>{ setDetail(r); setTab("header"); }} className="p-1 hover:bg-slate-100 rounded" data-testid={`customs-edit-${r.id}`}><Eye size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit dialog with 4 tabs */}
      <Dialog open={!!detail} onOpenChange={v=>!v && setDetail(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader><DialogTitle>Edit {detail.bc_type} — <span className="font-mono">{detail.doc_number}</span></DialogTitle></DialogHeader>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="bg-slate-100">
                  <TabsTrigger value="header" data-testid="ct-tab-header">Header</TabsTrigger>
                  <TabsTrigger value="detail" data-testid="ct-tab-detail">Detail</TabsTrigger>
                  <TabsTrigger value="document" data-testid="ct-tab-document">Document</TabsTrigger>
                  <TabsTrigger value="petikemas" data-testid="ct-tab-petikemas">Petikemas</TabsTrigger>
                  <TabsTrigger value="audit" data-testid="ct-tab-audit">Audit Trail</TabsTrigger>
                </TabsList>

                <TabsContent value="header">
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      ["car","CAR"], ["register_no","Register No"], ["register_date","Register Date",true],
                      ["kantor_pengawas","Kantor Pabean Pengawas"], ["kantor_bongkar","Kantor Pabean Bongkar"],
                      ["bl_no","BL No"], ["bl_date","BL Date",true],
                      ["pel_bongkar","Pel. Bongkar"], ["pel_muat","Pel Muat"], ["pel_transit","Pel Transit"],
                      ["tujuan_tpb","Tujuan TPB"], ["tempat_penimbunan","Tempat Penimbunan"],
                      ["from_kb_pjt","From KB / PJT"], ["cara_pengangkutan","Cara Pengangkutan"],
                      ["sarana_pengangkut","Sarana Pengangkut"], ["voy_flight","VOY / Flight"],
                      ["kode_bendera","Kode Bendera"], ["tanggal_tiba","Tanggal Tiba",true],
                      ["tutup_pu","Tutup PU"], ["nomor_bc11","Nomor BC 1.1"], ["tanggal_bc11","Tanggal BC 1.1",true],
                      ["nomor_pos","Nomor POS"], ["sub_pos","Sub POS"],
                      ["supplier","Supplier"], ["shipper","Shipper"], ["owner","Owner"],
                      ["currency","Currency"], ["rate","Rate","num"], ["price_type","Price Type"],
                      ["value","Value","num"], ["value_added","Value Added","num"], ["discount","Discount","num"],
                      ["freight","Freight","num"], ["insurance_type","Insurance Type"], ["insurance_value","Insurance Value","num"],
                      ["kena_pajak","Kena Pajak"], ["bruto","Bruto","num"],
                      ["nama_penanda_tangan","Nama Penanda Tangan"], ["jabatan_penanda_tangan","Jabatan Penanda Tangan"],
                    ].map(([k,label,type])=>(
                      <div key={k}>
                        <Label className="label-tiny">{label}</Label>
                        <Input type={type===true?"date":(type==="num"?"number":"text")} value={detail[k]||""} onChange={e=>setDetail({...detail, [k]: type==="num"?parseFloat(e.target.value||0):e.target.value})} data-testid={`ct-h-${k}`}/>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="detail">
                  <DetailTab detail={detail} setDetail={setDetail}/>
                </TabsContent>

                <TabsContent value="document">
                  <ListEditor rows={detail.documents||[]} onChange={arr=>setDetail({...detail, documents: arr})}
                    fields={[
                      {k:"tipe_dok", label:"Tipe Dok"},
                      {k:"uraian_fasilitas", label:"Uraian Fasilitas"},
                      {k:"uraian_dokumen", label:"Uraian Dokumen"},
                      {k:"nomor_dokumen", label:"Nomor Dokumen"},
                      {k:"tanggal_dokumen", label:"Tanggal", type:"date"},
                      {k:"memo", label:"Memo"},
                    ]} testid="ct-doc"/>
                </TabsContent>

                <TabsContent value="petikemas">
                  <ListEditor rows={detail.petikemas||[]} onChange={arr=>setDetail({...detail, petikemas: arr})}
                    fields={[
                      {k:"seri", label:"Seri", type:"number"},
                      {k:"jenis_kontainer", label:"Jenis"},
                      {k:"tipe_kontainer", label:"Tipe"},
                      {k:"ukuran_kontainer", label:"Ukuran"},
                      {k:"nomor_kontainer", label:"Nomor"},
                      {k:"note", label:"Note"},
                    ]} testid="ct-pk"/>
                </TabsContent>

                <TabsContent value="audit">
                  <AuditTrail docId={detail.id}/>
                </TabsContent>
              </Tabs>
                <DialogFooter>
                <Button variant="outline" onClick={async ()=>{
                  const t = localStorage.getItem("access_token");
                  const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/customs-docs/${detail.id}/print.pdf`, { credentials:"include", headers: t?{Authorization:`Bearer ${t}`}:{}});
                  const b = await r.blob(); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=`${detail.bc_type}_${detail.doc_number}.pdf`; a.click(); URL.revokeObjectURL(u);
                }} data-testid="customs-print">Print PDF</Button>
                <Button variant="outline" onClick={async ()=>{
                  try { const r = await api.post(`/customs-docs/${detail.id}/sync-odoo`);
                    r.data.mocked ? toast.info(r.data.message) : toast.success(`Odoo landed cost dibuat (ID ${r.data.landed_cost_id})`);
                  } catch(e){ toast.error(e.response?.data?.detail); }
                }} data-testid="customs-odoo-sync">Sync ke Odoo</Button>
                <Button variant="outline" onClick={save} data-testid="customs-save">Simpan</Button>
                <Button onClick={submit} data-testid="customs-submit"><Send size={14}/> Submit</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailTab({ detail, setDetail }) {
  const [hs, setHs] = useState([]);
  const [products, setProducts] = useState([]);
  useEffect(()=>{ api.get("/hs-codes").then(r=>setHs(r.data)); api.get("/products").then(r=>setProducts(r.data)); },[]);
  const items = detail.items || [];
  const setItems = arr => setDetail({...detail, items: arr});
  const addBlank = () => setItems([...items, { seri: items.length+1 }]);
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {["seri","kode_barang","deskripsi","merk","tipe","ukuran","volume","spf_lain","hs_code","kategori","qty","unit","conversion","qty_package","package","amount","unit_price","negara_asal","freight","asuransi","tarif_fasilitas_pdri","bmt","subcon_price","pph","ppn","tarif_fasilitas","bm_tarif","note","bruto","netto"].map(f=>(
          <div key={f}>
            <Label className="label-tiny">{f.replace(/_/g," ")}</Label>
            <Input value={detail[`_new_${f}`]||""} onChange={e=>setDetail({...detail, [`_new_${f}`]: e.target.value})} data-testid={`ct-item-${f}`}/>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={()=>{
        const newItem = {};
        Object.keys(detail).filter(k=>k.startsWith("_new_")).forEach(k=>{ newItem[k.slice(5)] = detail[k]; });
        newItem.seri = items.length + 1;
        setItems([...items, newItem]);
        const cleared = {...detail}; Object.keys(cleared).filter(k=>k.startsWith("_new_")).forEach(k=>delete cleared[k]);
        setDetail(cleared);
      }} data-testid="ct-detail-add"><Plus size={14}/> ADD</Button>
      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="data-table" style={{ minWidth: 1400 }}>
          <thead><tr><th>Seri</th><th>Item Code</th><th>Item Name</th><th>HS Code</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Amount</th><th>Netto</th><th>Bruto</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {items.length===0 && <tr><td colSpan={12} className="text-center py-4 text-slate-400">Belum ada item</td></tr>}
            {items.map((it,i)=>(
              <tr key={i} data-testid={`ct-item-row-${i}`}>
                <td>{it.seri}</td><td className="font-mono text-xs">{it.kode_barang}</td>
                <td className="text-xs">{it.deskripsi}</td><td>{it.hs_code}</td>
                <td>{it.qty}</td><td>{it.unit}</td>
                <td className="font-mono text-xs">{it.unit_price}</td><td className="font-mono text-xs">{it.amount}</td>
                <td>{it.netto}</td><td>{it.bruto}</td><td className="text-xs">{it.note}</td>
                <td className="text-right"><button onClick={()=>setItems(items.filter((_,idx)=>idx!==i))}><Trash2 size={12} className="text-red-500"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListEditor({ rows, onChange, fields, testid }) {
  const [form, setForm] = useState({});
  const add = () => { onChange([...rows, form]); setForm({}); };
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {fields.map(f=>(
          <div key={f.k}><Label className="label-tiny">{f.label}</Label>
            <Input type={f.type||"text"} value={form[f.k]||""} onChange={e=>setForm({...form,[f.k]:e.target.value})} data-testid={`${testid}-${f.k}`}/>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={add} data-testid={`${testid}-add`}><Plus size={14}/> ADD</Button>
      <div className="border border-slate-200 rounded overflow-x-auto">
        <table className="data-table" style={{ minWidth: 700 }}>
          <thead><tr>{fields.map(f=><th key={f.k}>{f.label}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.length===0 && <tr><td colSpan={fields.length+1} className="text-center py-4 text-slate-400">-</td></tr>}
            {rows.map((r,i)=>(
              <tr key={i}>
                {fields.map(f=><td key={f.k} className="text-xs">{r[f.k]}</td>)}
                <td className="text-right"><button onClick={()=>onChange(rows.filter((_,idx)=>idx!==i))}><Trash2 size={12} className="text-red-500"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function AuditTrail({ docId }) {
  const [rows, setRows] = useState([]);
  useEffect(()=>{ api.get(`/customs-docs/${docId}/history`).then(r=>setRows(r.data)); }, [docId]);
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs text-slate-500">Riwayat perubahan dokumen (siap audit Bea Cukai).</div>
      {rows.length===0 && <div className="text-center text-slate-400 py-8 text-xs">Belum ada perubahan tercatat.</div>}
      {rows.map((r,i)=>(
        <div key={i} className="border border-slate-200 rounded p-3 bg-slate-50" data-testid={`audit-row-${i}`}>
          <div className="flex justify-between text-xs">
            <div><b>{r.by_name}</b> · <span className="uppercase tracking-wider text-slate-500">{r.action}</span></div>
            <div className="font-mono text-slate-500">{new Date(r.at).toLocaleString("id-ID")}</div>
          </div>
          <div className="mt-2 text-xs space-y-1">
            {Object.entries(r.changes || {}).map(([k, chg])=>(
              <div key={k} className="grid grid-cols-4 gap-2 border-b border-slate-100 py-1">
                <div className="font-semibold text-slate-700">{k}</div>
                <div className="text-red-600 line-through break-all">{String(chg.before ?? "-")}</div>
                <div className="text-slate-400">→</div>
                <div className="text-emerald-700 font-semibold break-all">{String(chg.after ?? "-")}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

