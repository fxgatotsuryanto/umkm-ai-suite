'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Package, HelpCircle, Store, Check, Trash2 } from 'lucide-react';
import { api, type Product, type FAQ, type Profile } from '@/lib/api';

const TABS = [
  { id: 'produk', label: 'Produk',        icon: Package   },
  { id: 'faq',    label: 'FAQ',           icon: HelpCircle },
  { id: 'profil', label: 'Profil Bisnis', icon: Store     },
];

function SaveButton({ saving, saved, disabled, onClick, label = 'Simpan' }: {
  saving: boolean; saved: boolean; disabled?: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button onClick={onClick} disabled={saving || disabled} className="btn-primary flex items-center gap-2">
      {saved
        ? <><Check size={15} className="text-green-300" /> Tersimpan!</>
        : saving ? 'Menyimpan...'
        : <><Plus size={15} /> {label}</>
      }
    </button>
  );
}

function PengaturanContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') ?? 'produk');

  // ── Products ──
  const [products, setProducts]       = useState<Product[]>([]);
  const [np, setNp]                   = useState({ name: '', price: '', stock: '', description: '', category: '' });
  const [savingProd, setSavingProd]   = useState(false);
  const [savedProd, setSavedProd]     = useState(false);

  // ── FAQs ──
  const [faqs, setFaqs]               = useState<FAQ[]>([]);
  const [nf, setNf]                   = useState({ question: '', answer: '', category: 'umum' });
  const [savingFAQ, setSavingFAQ]     = useState(false);
  const [savedFAQ, setSavedFAQ]       = useState(false);

  // ── Profile ──
  const [profile, setProfile]         = useState<Profile>({});
  const [savingProf, setSavingProf]   = useState(false);
  const [savedProf, setSavedProf]     = useState(false);

  useEffect(() => {
    api.getProducts().then(setProducts).catch(() => {});
    api.getFAQs().then(setFaqs).catch(() => {});
    api.getProfile().then(d => { if ('name' in d) setProfile(d as Profile); }).catch(() => {});
  }, []);

  const addProduct = async () => {
    if (!np.name || !np.price) return;
    setSavingProd(true);
    try {
      await api.createProduct({ name: np.name, price: parseFloat(np.price), stock: parseInt(np.stock) || 0, description: np.description, category: np.category });
      setNp({ name: '', price: '', stock: '', description: '', category: '' });
      setProducts(await api.getProducts());
      setSavedProd(true); setTimeout(() => setSavedProd(false), 2000);
    } catch {} finally { setSavingProd(false); }
  };

  const deleteProduct = async (id: number) => {
    try { await api.deleteProduct(id); setProducts(await api.getProducts()); } catch {}
  };

  const addFAQ = async () => {
    if (!nf.question || !nf.answer) return;
    setSavingFAQ(true);
    try {
      await api.createFAQ(nf);
      setNf({ question: '', answer: '', category: 'umum' });
      setFaqs(await api.getFAQs());
      setSavedFAQ(true); setTimeout(() => setSavedFAQ(false), 2000);
    } catch {} finally { setSavingFAQ(false); }
  };

  const deleteFAQ = async (id: number) => {
    try { await api.deleteFAQ(id); setFaqs(await api.getFAQs()); } catch {}
  };

  const saveProfile = async () => {
    setSavingProf(true);
    try {
      await api.updateProfile(profile);
      setSavedProf(true); setTimeout(() => setSavedProf(false), 2500);
    } catch {} finally { setSavingProf(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Pengaturan</h1>
        <p className="text-sm text-slate-500 mt-0.5">Kelola produk, FAQ, dan profil bisnis kamu</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: PRODUK ───────────────────────────────────── */}
      {tab === 'produk' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 card p-5 h-fit">
            <h2 className="font-semibold text-slate-800 mb-4">Tambah Produk</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Nama Produk *</label>
                <input className="input" placeholder="cth: Baju Batik Pria" value={np.name} onChange={e => setNp(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Harga (Rp) *</label>
                  <input type="number" className="input" placeholder="150000" value={np.price} onChange={e => setNp(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Stok</label>
                  <input type="number" className="input" placeholder="0" value={np.stock} onChange={e => setNp(p => ({ ...p, stock: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Kategori</label>
                <input className="input" placeholder="cth: Pakaian, Makanan..." value={np.category} onChange={e => setNp(p => ({ ...p, category: e.target.value }))} />
              </div>
              <div>
                <label className="label">Deskripsi</label>
                <textarea className="input resize-none" rows={3} placeholder="Deskripsi singkat produk..." value={np.description} onChange={e => setNp(p => ({ ...p, description: e.target.value }))} />
              </div>
              <SaveButton saving={savingProd} saved={savedProd} disabled={!np.name || !np.price} onClick={addProduct} label="Tambah Produk" />
            </div>
          </div>

          {/* List */}
          <div className="lg:col-span-3 card p-5">
            <h2 className="font-semibold text-slate-800 mb-4">
              {products.length} Produk <span className="text-slate-400 font-normal text-sm">tersimpan</span>
            </h2>
            {products.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Package size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">Belum ada produk</p>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">Rp{p.price.toLocaleString('id-ID')}</span>
                        {' · '}Stok: {p.stock}
                        {p.category && <> · <span className="text-teal-600">{p.category}</span></>}
                      </p>
                      {p.description && <p className="text-xs text-slate-400 truncate mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Aktif</span>
                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-slate-300 hover:text-red-500"
                        title="Hapus produk"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: FAQ ─────────────────────────────────────── */}
      {tab === 'faq' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 card p-5 h-fit">
            <h2 className="font-semibold text-slate-800 mb-1">Tambah FAQ</h2>
            <p className="text-xs text-slate-500 mb-4">FAQ digunakan AI untuk menjawab pertanyaan WA</p>
            <div className="space-y-3">
              <div>
                <label className="label">Pertanyaan *</label>
                <input className="input" placeholder="cth: Berapa lama pengiriman?" value={nf.question} onChange={e => setNf(f => ({ ...f, question: e.target.value }))} />
              </div>
              <div>
                <label className="label">Jawaban *</label>
                <textarea className="input resize-none" rows={4} placeholder="Jawaban lengkap yang akan digunakan AI..." value={nf.answer} onChange={e => setNf(f => ({ ...f, answer: e.target.value }))} />
              </div>
              <div>
                <label className="label">Kategori</label>
                <select className="input" value={nf.category} onChange={e => setNf(f => ({ ...f, category: e.target.value }))}>
                  {['umum', 'pengiriman', 'pembayaran', 'produk', 'retur'].map(c => (
                    <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <SaveButton saving={savingFAQ} saved={savedFAQ} disabled={!nf.question || !nf.answer} onClick={addFAQ} label="Tambah FAQ" />
            </div>
          </div>

          <div className="lg:col-span-3 card p-5">
            <h2 className="font-semibold text-slate-800 mb-4">
              {faqs.length} FAQ <span className="text-slate-400 font-normal text-sm">tersimpan</span>
            </h2>
            {faqs.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <HelpCircle size={36} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">Belum ada FAQ</p>
                <p className="text-xs mt-1">Tambahkan FAQ agar AI lebih akurat</p>
              </div>
            ) : (
              <div className="space-y-3">
                {faqs.map(f => (
                  <div key={f.id} className="p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">❓ {f.question}</p>
                      <button
                        onClick={() => deleteFAQ(f.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-slate-300 hover:text-red-500 flex-shrink-0"
                        title="Hapus FAQ"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">💬 {f.answer}</p>
                    <span className="inline-block mt-2 text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full capitalize">{f.category}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PROFIL ──────────────────────────────────── */}
      {tab === 'profil' && (
        <div className="max-w-2xl">
          <div className="card p-6">
            <h2 className="font-semibold text-slate-800 mb-1">Profil Bisnis</h2>
            <p className="text-xs text-slate-500 mb-5">Informasi ini digunakan AI untuk menjawab pertanyaan pelanggan WA</p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Nama Toko</label>
                  <input className="input" placeholder="Toko Batik Nusantara" value={profile.name ?? ''} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Jenis Bisnis</label>
                  <select className="input" value={profile.type ?? ''} onChange={e => setProfile(p => ({ ...p, type: e.target.value }))}>
                    {[
                      ['retail',     'Retail / Toko Fisik'],
                      ['kuliner',    'Kuliner / F&B'],
                      ['jasa',       'Jasa / Service'],
                      ['fashion',    'Fashion & Clothing'],
                      ['elektronik', 'Elektronik'],
                      ['lainnya',    'Lainnya'],
                    ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Nomor WhatsApp Toko</label>
                <input className="input" placeholder="628123456789 (format internasional)" value={profile.phone ?? ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
              </div>

              <div>
                <label className="label">Deskripsi Toko</label>
                <textarea className="input resize-none" rows={3} placeholder="Ceritakan singkat tentang toko kamu, produk utama, dan keunikannya..." value={profile.description ?? ''} onChange={e => setProfile(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div>
                <label className="label">Alamat</label>
                <input className="input" placeholder="Jl. Contoh No. 1, Kota, Provinsi" value={profile.address ?? ''} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} />
              </div>

              <div>
                <label className="label">Pesan Sambutan AI (WA Greeting)</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Halo! Selamat datang di Toko Kami 😊 Ada yang bisa kami bantu?"
                  value={profile.wa_greeting ?? ''}
                  onChange={e => setProfile(p => ({ ...p, wa_greeting: e.target.value }))}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Pesan ini menjadi konteks AI saat menyambut pelanggan baru
                </p>
              </div>

              <div className="pt-2">
                <button onClick={saveProfile} disabled={savingProf} className="btn-primary flex items-center gap-2">
                  {savedProf
                    ? <><Check size={15} className="text-green-300" /> Profil tersimpan!</>
                    : savingProf ? 'Menyimpan...'
                    : 'Simpan Profil'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PengaturanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm">Memuat...</div>}>
      <PengaturanContent />
    </Suspense>
  );
}
