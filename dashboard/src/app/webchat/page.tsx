'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Globe, Download, Users, MessageSquare, TrendingUp,
  RefreshCw, Check, Save, Copy, ChevronRight,
} from 'lucide-react';
import { api, type WebChatLead, type WebChatMsg, type WebChatConfig, BACKEND_URL } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-500"
    >
      {copied ? <><Check size={11} className="text-green-500" /> Tersalin</> : <><Copy size={11} /> Copy</>}
    </button>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────────────────────

function LeadsTab() {
  const [leads, setLeads]         = useState<WebChatLead[]>([]);
  const [selected, setSelected]   = useState<WebChatLead | null>(null);
  const [history, setHistory]     = useState<WebChatMsg[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadingHist, setLoadHist] = useState(false);
  const [allSessions, setAll]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getWebChatLeads({ captured_only: !allSessions, limit: 100 });
      setLeads(data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [allSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectLead = async (lead: WebChatLead) => {
    setSelected(lead);
    setLoadHist(true);
    try {
      const h = await api.getWebChatHistory(lead.session_id);
      setHistory(h);
    } catch { setHistory([]); }
    finally { setLoadHist(false); }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  return (
    <div className="flex h-[calc(100vh-160px)] gap-0 overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-white">
      {/* Left: Lead list */}
      <div className="w-80 flex flex-col border-r border-gray-100 flex-shrink-0">
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">{leads.length} {allSessions ? 'sesi' : 'leads'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAll(v => !v)}
                className="text-xs text-teal-600 font-medium hover:underline"
              >
                {allSessions ? 'Leads only' : 'Semua sesi'}
              </button>
              <button onClick={load} className="p-1 hover:bg-gray-100 rounded-lg">
                <RefreshCw size={13} className="text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
              <Users size={36} className="mb-2 opacity-20" />
              <p className="text-sm text-center font-medium">Belum ada leads</p>
              <p className="text-xs text-center mt-1 opacity-70">
                Leads muncul saat AI berhasil mengumpulkan nama + WA pengunjung
              </p>
            </div>
          ) : (
            leads.map(lead => {
              const isSelected = selected?.session_id === lead.session_id;
              return (
                <button
                  key={lead.session_id}
                  onClick={() => selectLead(lead)}
                  className={`w-full text-left p-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-green-50 border-l-[3px] border-l-green-500' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5">
                      {(lead.visitor_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {lead.visitor_name || 'Pengunjung'}
                        </p>
                        {lead.lead_captured && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500" title="Lead captured" />
                        )}
                      </div>
                      {lead.visitor_wa && (
                        <p className="text-xs text-gray-500 mt-0.5">📱 {lead.visitor_wa}</p>
                      )}
                      {lead.kebutuhan && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{lead.kebutuhan}</p>
                      )}
                      <p className="text-xs text-gray-300 mt-1">
                        {new Date(lead.last_active).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Conversation */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <MessageSquare size={28} className="opacity-30" />
              </div>
              <p className="font-semibold text-gray-500">Pilih lead</p>
              <p className="text-sm mt-1 opacity-60">Klik nama di sebelah kiri untuk melihat percakapan</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-5 py-3.5 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                    {(selected.visitor_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">
                      {selected.visitor_name || 'Pengunjung'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {selected.visitor_wa && <span>📱 {selected.visitor_wa} · </span>}
                      {fmt(selected.last_active)}
                    </p>
                  </div>
                </div>
                {selected.lead_captured && (
                  <span className="inline-flex items-center gap-1.5 text-xs bg-green-100 text-green-700 font-semibold px-2.5 py-1 rounded-full">
                    <Check size={11} /> Lead Captured
                  </span>
                )}
              </div>
              {(selected.kebutuhan || selected.solusi) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.kebutuhan && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                      🎯 {selected.kebutuhan}
                    </span>
                  )}
                  {selected.solusi && (
                    <span className="text-xs bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full">
                      💡 {selected.solusi}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
              {loadingHist ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-200 rounded-xl animate-pulse" />)}
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-center text-gray-400 py-8">Belum ada percakapan tersimpan</p>
              ) : (
                history.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-teal-600 text-white rounded-tr-md'
                        : 'bg-white border border-gray-100 text-gray-700 rounded-tl-md shadow-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Widget Config Tab ─────────────────────────────────────────────────────────

function ConfigTab() {
  const [cfg, setCfg]     = useState<WebChatConfig | null>(null);
  const [form, setForm]   = useState<Partial<WebChatConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWebChatConfig()
      .then(c => { setCfg(c); setForm(c); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateWebChatConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    finally { setSaving(false); }
  };

  const embedCode = `<!-- Tempel sebelum </body> di website klien -->
<div id="umkm-chat-widget"></div>
<script>
  var BACKEND_URL  = "${BACKEND_URL}";   // ← ganti dengan URL backend publik
  var THEME_COLOR  = "${form.theme_color ?? '#16a34a'}";
  var AGENT_NAME   = "${form.agent_name ?? 'AI Assistant'}";
  var GREETING     = "${(form.greeting ?? 'Halo!').replace(/"/g, '\\"')}";
  var AUTO_OPEN    = ${form.auto_open ?? false};
</script>
<!-- Copy seluruh widget dari: webchat-widget/widget.html -->`;

  const iframeCode = `<!-- Embed n8n chat widget (jika pakai n8n workflow) -->
<iframe
  src="https://n8n-anda.com/webhook/WEBHOOK_ID/chat"
  style="width:100%; height:600px; border:none; border-radius:12px;"
  allow="microphone"
></iframe>`;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Config Form */}
      <div className="lg:col-span-3 space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Konfigurasi Widget</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nama Agen</label>
                <input
                  className="input"
                  value={form.agent_name ?? ''}
                  onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))}
                  placeholder="AI Assistant"
                />
              </div>
              <div>
                <label className="label">Warna Tema</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.theme_color ?? '#16a34a'}
                    onChange={e => setForm(f => ({ ...f, theme_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <input
                    className="input flex-1"
                    value={form.theme_color ?? ''}
                    onChange={e => setForm(f => ({ ...f, theme_color: e.target.value }))}
                    placeholder="#16a34a"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="label">Pesan Sambutan</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={form.greeting ?? ''}
                onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))}
                placeholder="Halo! Ada yang bisa saya bantu? 😊"
              />
            </div>

            <div>
              <label className="label">Instruksi Tambahan AI</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={form.system_prompt_extra ?? ''}
                onChange={e => setForm(f => ({ ...f, system_prompt_extra: e.target.value }))}
                placeholder="Contoh: Fokus pada produk batik. Jika tanya pengiriman, sebutkan ekspedisi JNE & J&T..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Instruksi ini ditambahkan ke sistem prompt AI (opsional)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">No. WA CTA</label>
                <input
                  className="input"
                  value={form.cta_wa_number ?? ''}
                  onChange={e => setForm(f => ({ ...f, cta_wa_number: e.target.value }))}
                  placeholder="6281234567890"
                />
                <p className="text-xs text-gray-400 mt-1">Format internasional tanpa +</p>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_open ?? false}
                    onChange={e => setForm(f => ({ ...f, auto_open: e.target.checked }))}
                    className="w-4 h-4 rounded text-teal-600"
                  />
                  <span className="text-sm text-gray-700">Buka otomatis saat load</span>
                </label>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Notifikasi Lead</h4>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">Telegram Chat ID</label>
                  <input
                    className="input"
                    value={form.telegram_chat_id ?? ''}
                    onChange={e => setForm(f => ({ ...f, telegram_chat_id: e.target.value }))}
                    placeholder="249940246"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Set TELEGRAM_BOT_TOKEN di .env backend. Chat ID bisa dari @userinfobot.
                  </p>
                </div>
                <div>
                  <label className="label">Webhook URL (opsional)</label>
                  <input
                    className="input"
                    value={form.webhook_url ?? ''}
                    onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))}
                    placeholder="https://n8n.anda.com/webhook/lead-masuk"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saved
                ? <><Check size={15} className="text-green-300" /> Tersimpan!</>
                : saving ? 'Menyimpan...'
                : <><Save size={15} /> Simpan Konfigurasi</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Embed Code */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-1">Pasang di Website Client</h3>
          <p className="text-xs text-gray-400 mb-4">
            Pilih salah satu metode pemasangan di bawah
          </p>

          <div className="space-y-4">
            {/* Backend Widget */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Metode 1 — Backend Widget
                </p>
                <CopyBtn text={embedCode} />
              </div>
              <pre className="bg-gray-900 text-gray-300 text-xs p-3.5 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                {embedCode}
              </pre>
              <p className="text-xs text-gray-400 mt-1.5">
                Copy kode lengkap dari file <code className="bg-gray-100 px-1 rounded">webchat-widget/widget.html</code>
              </p>
            </div>

            {/* n8n iframe */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Metode 2 — n8n iframe
                </p>
                <CopyBtn text={iframeCode} />
              </div>
              <pre className="bg-gray-900 text-gray-300 text-xs p-3.5 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                {iframeCode}
              </pre>
              <p className="text-xs text-gray-400 mt-1.5">
                Ganti URL dengan webhook dari workflow <code className="bg-gray-100 px-1 rounded">webchat.json</code>
              </p>
            </div>
          </div>
        </div>

        {/* Preview */}
        {form.theme_color && (
          <div className="card p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Preview Tombol Widget</h3>
            <div className="flex items-end gap-3">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
                style={{ background: form.theme_color }}
              >
                <MessageSquare size={24} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: form.theme_color }}>
                  {form.agent_name || 'AI Assistant'}
                </p>
                <p className="text-xs text-gray-400">Tombol chat yang muncul di website</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function WebChatContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'config' ? 'config' : 'leads');
  const [stats, setStats] = useState<{ sessions: number; leads: number; rate: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.getWebChatLeads({ captured_only: false, limit: 500 }),
      api.getWebChatLeads({ captured_only: true,  limit: 500 }),
    ]).then(([all, captured]) => {
      const rate = all.length > 0
        ? ((captured.length / all.length) * 100).toFixed(1)
        : '0.0';
      setStats({ sessions: all.length, leads: captured.length, rate: `${rate}%` });
    }).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe size={22} className="text-green-500" /> Web Chat
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola leads, percakapan, dan konfigurasi widget chat
          </p>
        </div>
        <button
          onClick={() => window.open(api.exportLeadsUrl(), '_blank')}
          className="btn-secondary flex items-center gap-2"
        >
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Sesi',       value: stats?.sessions ?? '—', icon: <MessageSquare size={16} className="text-blue-500" />,  bg: 'bg-blue-50' },
          { label: 'Leads Captured',   value: stats?.leads ?? '—',    icon: <Users size={16} className="text-green-500" />,         bg: 'bg-green-50' },
          { label: 'Tingkat Konversi', value: stats?.rate ?? '—',     icon: <TrendingUp size={16} className="text-purple-500" />,   bg: 'bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'leads',  label: 'Leads & Percakapan' },
          { id: 'config', label: 'Konfigurasi Widget'  },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'leads'  && <LeadsTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}

export default function WebChatPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Memuat...</div>}>
      <WebChatContent />
    </Suspense>
  );
}
