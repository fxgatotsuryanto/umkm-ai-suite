'use client';

import { useEffect, useState } from 'react';
import { Copy, Check, Sparkles, Coins, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { api, type Content } from '@/lib/api';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'tiktok',    label: 'TikTok',    emoji: '🎵' },
  { id: 'facebook',  label: 'Facebook',  emoji: '👥' },
  { id: 'whatsapp',  label: 'WhatsApp',  emoji: '💬' },
];

const CONTENT_TYPES = [
  { id: 'promo',              label: 'Promosi Produk' },
  { id: 'tips',               label: 'Tips & Edukasi' },
  { id: 'produk',             label: 'Highlight Produk' },
  { id: 'behind_the_scenes',  label: 'Behind the Scenes' },
  { id: 'testimoni',          label: 'Template Testimoni' },
];

function CopyBtn({ text, label = 'Salin' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-slate-500 hover:text-indigo-600"
    >
      {copied ? <><Check size={12} className="text-green-500" /> Tersalin!</> : <><Copy size={12} /> {label}</>}
    </button>
  );
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'from-pink-500 to-purple-600',
  tiktok:    'from-slate-800 to-slate-900',
  facebook:  'from-blue-500 to-blue-700',
  whatsapp:  'from-green-500 to-green-600',
};

export default function KontenPage() {
  const [form, setForm] = useState({ platform: 'instagram', content_type: 'promo', topic: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(Content & { success?: boolean; error?: string }) | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Content[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    setLoadingHistory(true);
    api.getContentLibrary({ limit: 12 })
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    api.getBalance().then(d => setBalance(d.balance)).catch(() => {});
    loadHistory();
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.generateContent(form);
      if (!data.success) { setError(data.error ?? 'Gagal generate konten'); return; }
      setResult(data as unknown as Content);
      setBalance(prev => prev !== null ? prev - 5 : null);
      loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const emoji = (p: string) => PLATFORMS.find(x => x.id === p)?.emoji ?? '📝';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Konten Marketing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate konten otomatis untuk semua platform media sosial</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Generate Form ────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="card p-5 sticky top-6">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600" /> Buat Konten Baru
            </h2>

            {/* Platform selector */}
            <div className="mb-4">
              <label className="label">Platform</label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setForm(f => ({ ...f, platform: p.id }))}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.platform === p.id
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">{p.emoji}</span> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content type */}
            <div className="mb-4">
              <label className="label">Jenis Konten</label>
              <select
                value={form.content_type}
                onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}
                className="input"
              >
                {CONTENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Topic */}
            <div className="mb-5">
              <label className="label">
                Topik / Nama Produk <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                placeholder="cth: Baju batik murah, Tips hemat belanja..."
                className="input"
                onKeyDown={e => e.key === 'Enter' && !loading && handleGenerate()}
              />
            </div>

            {/* Token cost */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
              <Coins size={14} className="text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">
                Biaya: <strong>5 token</strong>
                {balance !== null && (
                  <> · Sisa kamu: <strong className={balance < 10 ? 'text-red-600' : ''}>{balance}</strong></>
                )}
              </span>
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading || (balance !== null && balance < 5)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                : <><Sparkles size={15} /> Generate Konten</>
              }
            </button>

            {error && (
              <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Result + History ─────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          {/* Generated result */}
          {result && (
            <div className="card overflow-hidden border-2 border-indigo-200">
              {/* Platform header */}
              <div className={`bg-gradient-to-r ${PLATFORM_COLORS[result.platform] ?? 'from-slate-700 to-slate-800'} px-5 py-4 text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{emoji(result.platform)}</span>
                    <div>
                      <p className="font-bold text-sm">{result.title || 'Konten Baru'}</p>
                      <p className="text-xs opacity-70 capitalize">{result.platform} · {result.content_type}</p>
                    </div>
                  </div>
                  <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full">✨ Baru dibuat</span>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Main content */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Konten</p>
                    <CopyBtn text={result.content} />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{result.content}</p>
                  </div>
                </div>

                {/* Hashtags */}
                {result.hashtags && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hashtag</p>
                      <CopyBtn text={result.hashtags} />
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                      <p className="text-sm text-indigo-700 leading-relaxed">{result.hashtags}</p>
                    </div>
                  </div>
                )}

                {/* CTA */}
                {result.cta && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Call to Action</p>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                      <p className="text-sm text-green-800 font-medium">{result.cta}</p>
                    </div>
                  </div>
                )}

                {/* Copy all */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <CopyBtn text={[result.content, result.hashtags, result.cta].filter(Boolean).join('\n\n')} label="Salin Semua" />
                  <span className="text-xs text-slate-400">{result.tokens_used} token terpakai</span>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <Clock size={15} className="text-slate-400" /> Riwayat Konten
              </h2>
              <button onClick={loadHistory} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw size={13} className="text-slate-400" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Sparkles size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">Belum ada konten yang digenerate</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <span className="text-xl flex-shrink-0 mt-0.5">{emoji(item.platform)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700 truncate">
                          {item.title || item.content.slice(0, 45) + '…'}
                        </p>
                        <CopyBtn text={[item.content, item.hashtags].filter(Boolean).join('\n\n')} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 capitalize">
                        {item.platform} · {item.content_type} · {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
