import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { fmtIDR } from "@/lib/api";

function DataSection({ title, endpoint, columns, fields, testid, extra }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const load = () => api.get(endpoint).then(r => setRows(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(endpoint, form);
      toast.success("Berhasil disimpan");
      setForm({}); setOpen(false); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal");
    } finally { setSaving(false); }
  };
  const remove = async (id) => {
    if (!confirm("Hapus item ini?")) return;
    await api.delete(`${endpoint}/${id}`);
    toast.success("Dihapus"); load();
  };

  return (
    <div className="space-y-3" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="label-tiny">{title}</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid={`${testid}-add`}><Plus size={14}/> Tambah</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah {title}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {fields.map(f => (
                <div key={f.key}>
                  <Label className="label-tiny">{f.label}</Label>
                  {f.type === "select" ? (
                    <Select value={form[f.key] || ""} onValueChange={(v)=>setForm({...form, [f.key]: v})}>
                      <SelectTrigger data-testid={`${testid}-${f.key}`}><SelectValue placeholder={f.label}/></SelectTrigger>
                      <SelectContent>
                        {f.options?.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input type={f.type || "text"} value={form[f.key] || ""} onChange={(e)=>setForm({...form, [f.key]: f.type==="number"?parseFloat(e.target.value||0):e.target.value})} data-testid={`${testid}-${f.key}`}/>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter><Button onClick={submit} disabled={saving} data-testid={`${testid}-save`}>Simpan</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {extra}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={columns.length+1} className="text-center text-slate-400 py-6">Belum ada data</td></tr>}
            {rows.map(r => (
              <tr key={r.id} data-testid={`${testid}-row-${r.id}`}>
                {columns.map(c => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}
                <td className="text-right"><button onClick={()=>remove(r.id)} data-testid={`${testid}-del-${r.id}`}><Trash2 size={14} className="text-slate-400 hover:text-red-500"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MasterData() {
  const [cats, setCats] = useState([]);
  const [hs, setHs] = useState([]);
  useEffect(() => {
    api.get("/categories").then(r => setCats(r.data));
    api.get("/hs-codes").then(r => setHs(r.data));
  }, []);

  return (
    <div className="space-y-6" data-testid="master-page">
      <div>
        <div className="label-tiny">Master Data</div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Katalog & Referensi</h1>
      </div>
      <Tabs defaultValue="products">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="products" data-testid="tab-products">Products</TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">Categories</TabsTrigger>
          <TabsTrigger value="departments" data-testid="tab-departments">Departments</TabsTrigger>
          <TabsTrigger value="hs" data-testid="tab-hs">HS Codes</TabsTrigger>
          <TabsTrigger value="warehouses" data-testid="tab-warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="locations" data-testid="tab-locations">Locations</TabsTrigger>
          <TabsTrigger value="taxes" data-testid="tab-taxes">Pajak</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4">
          <DataSection
            testid="products-section"
            title="Products"
            endpoint="/products"
            columns={[
              {key:"code", label:"Code / SKU"},
              {key:"name", label:"Name"},
              {key:"sku", label:"Alt SKU"},
              {key:"unit", label:"Unit"},
              {key:"is_lot_tracked", label:"Lot", render:r=>r.is_lot_tracked?"✓":"-"},
              {key:"variants", label:"Variants", render:r=>(r.variants||[]).length},
              {key:"default_price", label:"Price", render:r=>fmtIDR(r.default_price)},
              {key:"category_id", label:"Kategori", render:r=>cats.find(c=>c.id===r.category_id)?.name || "-"},
              {key:"hs_code_id", label:"HS Code", render:r=>hs.find(h=>h.id===r.hs_code_id)?.code || "-"},
            ]}
            fields={[
              {key:"code", label:"Code (SKU utama)"},
              {key:"sku", label:"Alt SKU (opsional)"},
              {key:"name", label:"Name"},
              {key:"unit", label:"Unit (PCS/KG/...)"},
              {key:"default_price", label:"Harga Default", type:"number"},
              {key:"is_lot_tracked", label:"Lot Tracked (1/0)", type:"number"},
              {key:"category_id", label:"Kategori", type:"select", options: cats.map(c=>({value:c.id,label:c.name}))},
              {key:"hs_code_id", label:"HS Code", type:"select", options: hs.map(h=>({value:h.id,label:`${h.code} — ${h.description}`}))},
              {key:"description", label:"Deskripsi"},
              {key:"variants", label:"Variants JSON (opsional, format: [{\"sku\":\"...\",\"name\":\"...\",\"attributes\":{...},\"price\":0}])"},
            ]}
          />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <DataSection testid="cat-section" title="Categories" endpoint="/categories"
            columns={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"description",label:"Deskripsi"}]}
            fields={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"description",label:"Deskripsi"}]}/>
        </TabsContent>
        <TabsContent value="departments" className="mt-4">
          <DataSection testid="dept-section" title="Departments" endpoint="/departments"
            columns={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"manager_name",label:"Manager"}]}
            fields={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"manager_name",label:"Manager"}]}/>
        </TabsContent>
        <TabsContent value="hs" className="mt-4">
          <DataSection testid="hs-section" title="HS Codes" endpoint="/hs-codes"
            columns={[{key:"code",label:"Code"},{key:"description",label:"Deskripsi"},{key:"duty_rate",label:"Duty %"}]}
            fields={[{key:"code",label:"Code"},{key:"description",label:"Deskripsi"},{key:"duty_rate",label:"Duty Rate (%)",type:"number"}]}/>
        </TabsContent>
        <TabsContent value="warehouses" className="mt-4">
          <DataSection testid="wh-section" title="Warehouses" endpoint="/warehouses"
            columns={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"is_bonded",label:"Bonded",render:r=>r.is_bonded?<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold uppercase">Bonded</span>:"-"},{key:"address",label:"Address"}]}
            fields={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"is_bonded",label:"Bonded (1/0)",type:"number"},{key:"address",label:"Address"}]}/>
        </TabsContent>
        <TabsContent value="locations" className="mt-4">
          <DataSection testid="loc-section" title="Locations" endpoint="/locations"
            columns={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"warehouse_id",label:"Warehouse"},{key:"is_bonded_zone",label:"Bonded Zone",render:r=>r.is_bonded_zone?<span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold uppercase">KB</span>:"-"}]}
            fields={[{key:"code",label:"Code"},{key:"name",label:"Name"},{key:"warehouse_id",label:"Warehouse ID"},{key:"is_bonded_zone",label:"Bonded Zone (1/0)",type:"number"}]}/>
        </TabsContent>
        <TabsContent value="taxes" className="mt-4">
          <DataSection testid="tax-section" title="Master Pajak (many2many pada PO)" endpoint="/taxes"
            columns={[
              {key:"code",label:"Kode"},
              {key:"name",label:"Nama"},
              {key:"rate",label:"Rate %",render:r=>`${r.rate}%`},
              {key:"tax_type",label:"Tipe",render:r=><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${r.tax_type==="withholding"?"bg-amber-100 text-amber-700":r.tax_type==="sales"?"bg-emerald-100 text-emerald-700":"bg-slate-100 text-slate-700"}`}>{r.tax_type}</span>},
              {key:"is_active",label:"Aktif",render:r=>r.is_active?"✓":"-"},
              {key:"description",label:"Deskripsi"},
            ]}
            fields={[
              {key:"code",label:"Kode (mis: PPN11, PPH23)"},
              {key:"name",label:"Nama (mis: PPN 11%)"},
              {key:"rate",label:"Rate (%)",type:"number"},
              {key:"tax_type",label:"Tipe",type:"select",options:[{value:"sales",label:"Sales (menambah total)"},{value:"withholding",label:"Withholding / PPh (mengurangi total)"},{value:"other",label:"Lainnya"}]},
              {key:"is_active",label:"Aktif (1/0)",type:"number"},
              {key:"description",label:"Deskripsi"},
            ]}/>
        </TabsContent>
      </Tabs>
    </div>
  );
}
