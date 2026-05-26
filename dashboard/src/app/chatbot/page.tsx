'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot, Plus, Trash2, Settings2, MessageSquare, Zap, RefreshCw,
  ChevronRight, Send, RotateCcw, Check, AlertCircle, Copy, Eye, EyeOff,
  Coins, Clock,
} from 'lucide-react';
import { api, type ChatbotConfig, type ChatbotMessage, type ChatSession } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50);
}

const TONES = [
  { id: 'ramah',       label: 'Ramah & Hangat' },
  { id: 'profesional', label: 'Profesional' },
  { id: 'casual',      label: 'Santai & Akrab' },
  { id: 'formal',      label: 'Formal & Sopan' },
];

const TABS = ['editor', 'test', 'sessions'] as const;
type Tab = typeof TABS[number];

// ── Config Form ───────────────────────────────────────────────────────────────

function ConfigForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<ChatbotConfig>;
  onSave: (data: Partial<ChatbotConfig>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<ChatbotConfig>>({
    name: '',
    slug: '',
    description: '',
    system_prompt: '',
    personality_tone: 'ramah',
    token_cost: 2,
    max_history: 10,
    webhook_secret: '',
    ...initial,
  });
  const [showSecret, setShowSecret] = useState(false);
  const isEdit = !!initial?.id;

  const set = (k: keyof ChatbotConfig, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Nama Chatbot *</label>
          <input
            className="input"
            placeholder="cth: CS Toko Batik"
            value={form.name ?? ''}
            onChange={e => {
              set('name', e.target.value);
              if (!isEdit) set('slug', slugify(e.target.value));
            }}
          />
        </div>
        <div>
          <label className="label">Slug (ID unik) *</label>
          <input
            className="input font-mono text-sm"
            placeholder="cs-toko-batik"
            value={form.slug ?? ''}
            onChange={e => set('slug', slugify(e.target.value))}
          />
          <p className="text-xs text-slate-400 mt-1">Digunakan sebagai identifier di API</p>
        </div>
      </div>

      <div>
        <label className="label">Deskripsi</label>
        <input
          className="input"
          placeholder="cth: Chatbot CS untuk WA toko batik"
          value={form.description ?? ''}
          onChange={e => set('description', e.target.value)}
        />
      </div>

      <div>
        <label className="label">Kepribadian AI</label>
        <div className="grid grid-cols-2 gap-2">
          {TONES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => set('personality_tone', t.id)}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                form.personality_tone === t.id
                  ? 'border-teal-400 bg-teal-50 text-teal-700 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">
          System Prompt Kustom{' '}
          <span className="text-slate-400 font-normal">(opsional)</span>
        </label>
        <textarea
          className="input resize-none font-mono text-sm"
          rows={6}
          placeholder={`Contoh:\nKamu adalah asisten CS untuk Toko Batik Nusantara. Kamu membantu pelanggan dengan pertanyaan tentang produk, pengiriman, dan pembayaran. Selalu jawab dalam Bahasa Indonesia yang ramah.`}
          value={form.system_prompt ?? ''}
          onChange={e => set('system_prompt', e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1">
          Jika kosong, AI akan menggunakan template default + kepribadian yang dipilih
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label flex items-center gap-1.5">
            <Coins size={13} className="text-amber-500" /> Token per Pesan
          </label>
          <input
            type="number"
            className="input"
            min={1}
            max={20}
            value={form.token_cost ?? 2}
            onChange={e => set('token_cost', parseInt(e.target.value) || 2)}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <Clock size={13} className="text-blue-500" /> Maks. Riwayat Pesan
          </label>
          <input
            type="number"
            className="input"
            min={2}
            max={50}
            value={form.max_history ?? 10}
            onChange={e => set('max_history', parseInt(e.target.value) || 10)}
          />
          <p className="text-xs text-slate-400 mt-1">Jumlah pesan sebelumnya yang diingat AI</p>
        </div>
      </div>

      <div>
        <label className="label">Webhook Secret</label>
        <div className="relative">
          <input
            className="input pr-10 font-mono text-sm"
            type={showSecret ? 'text' : 'password'}
            placeholder="Kosongkan jika tidak diperlukan"
            value={form.webhook_secret ?? ''}
            onChange={e => set('webhook_secret', e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowSecret(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Digunakan untuk mengamankan endpoint dari n8n</p>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name || !form.slug}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? 'Menyimpan...' : <><Check size={14} /> {isEdit ? 'Simpan Perubahan' : 'Buat Chatbot'}</>}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Batal
        </button>
      </div>
    </div>
  );
}

// ── Test Panel ────────────────────────────────────────────────────────────────

function TestPanel({ config }: { config: ChatbotConfig }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; tokens?: number }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(`test_${config.id}_${Date.now()}`);
  const [totalTokens, setTotalTokens] = useState(0);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await api.chatbotSend({
        message: text,
        user_identifier: 'dashboard_test',
        config_id: config.id,
        session_id: sessionId,
        user_name: 'Admin (Test)',
      });
      if (res.success) {
        setMessages(m => [...m, { role: 'assistant', content: res.reply, tokens: res.tokens_used }]);
        setTotalTokens(t => t + res.tokens_used);
      } else {
        setError(res.error ?? 'Gagal mendapatkan respons');
        setMessages(m => m.slice(0, -1));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
      setMessages(m => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[560px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
            <Bot size={16} className="text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">{config.name}</p>
            <p className="text-xs text-slate-400">{messages.length} pesan · {totalTokens} token terpakai</p>
          </div>
        </div>
        <button
          onClick={() => { setMessages([]); setTotalTokens(0); setError(''); }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-3 bg-slate-50 rounded-xl p-4 mb-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Bot size={36} className="mb-2 opacity-20" />
            <p className="text-sm">Ketik pesan untuk mulai test chatbot</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${m.role === 'user' ? 'order-2' : ''}`}>
                {m.role === 'assistant' && (
                  <p className="text-xs text-slate-400 mb-1 ml-1">🤖 AI{m.tokens ? ` · ${m.tokens} token` : ''}</p>
                )}
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-teal-600 text-white rounded-tr-md'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-tl-md shadow-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2 flex-shrink-0">
          <AlertCircle size={13} className="flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <input
          className="input flex-1"
          placeholder="Tulis pesan test..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="btn-primary px-4 flex items-center gap-2 flex-shrink-0"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Sessions Panel ────────────────────────────────────────────────────────────

function SessionsPanel({ config }: { config: ChatbotConfig }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selected, setSelected] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatbotMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try { setSessions(await api.getChatSessions(config.id)); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadSessions(); }, [config.id]);

  const selectSession = async (s: ChatSession) => {
    setSelected(s);
    setLoadingMsgs(true);
    try { setMessages(await api.getSessionMessages(s.session_id)); } catch {} finally { setLoadingMsgs(false); }
  };

  const clearSession = async (s: ChatSession) => {
    await api.clearSession(s.session_id);
    setSelected(null);
    setMessages([]);
    await loadSessions();
  };

  return (
    <div className="grid grid-cols-2 gap-4 h-[560px]">
      {/* Session list */}
      <div className="overflow-y-auto space-y-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-slate-700">{sessions.length} Sesi</p>
          <button onClick={loadSessions} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCw size={13} className="text-slate-400" />
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">Belum ada sesi</p>
          </div>
        ) : (
          sessions.map(s => (
            <button
              key={s.session_id}
              onClick={() => selectSession(s)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selected?.session_id === s.session_id
                  ? 'border-teal-300 bg-teal-50'
                  : 'border-slate-100 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {s.user_name || s.user_identifier}
                </p>
                <span className="text-xs text-slate-400 flex-shrink-0">{s.message_count} pesan</span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">{s.user_identifier}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(s.last_activity).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Messages */}
      <div className="flex flex-col overflow-hidden border border-slate-100 rounded-xl">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageSquare size={28} className="mb-2 opacity-20" />
            <p className="text-sm">Pilih sesi untuk lihat riwayat</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
              <div>
                <p className="text-sm font-semibold text-slate-800">{selected.user_name || selected.user_identifier}</p>
                <p className="text-xs text-slate-400">{selected.session_id}</p>
              </div>
              <button
                onClick={() => clearSession(selected)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
              >
                <RotateCcw size={12} /> Reset
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
              {loadingMsgs ? (
                <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-white rounded-xl animate-pulse" />)}</div>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── N8N Info Card ─────────────────────────────────────────────────────────────

function N8NCard({ config }: { config: ChatbotConfig }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const endpoint = 'http://localhost:8000/api/chatbot/chat';
  const body = JSON.stringify({
    config_id: config.id,
    message: '{{ $json.message }}',
    user_identifier: '{{ $json.wa_number }}',
    session_id: `${config.id}_{{ $json.wa_number }}`,
    user_name: '{{ $json.name }}',
    ...(config.webhook_secret ? { webhook_secret: config.webhook_secret } : {}),
  }, null, 2);

  return (
    <div className="bg-slate-800 rounded-xl p-4 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-teal-400" />
        <p className="text-sm font-semibold text-teal-300">Integrasi n8n</p>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">HTTP Request — POST ke:</p>
          <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2">
            <code className="text-xs text-green-400 flex-1 truncate">{endpoint}</code>
            <button onClick={() => copy(endpoint, 'url')} className="flex-shrink-0">
              {copied === 'url' ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-slate-400 hover:text-white" />}
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Body (JSON):</p>
          <div className="relative bg-slate-700 rounded-lg p-3">
            <pre className="text-xs text-slate-300 overflow-x-auto">{body}</pre>
            <button
              onClick={() => copy(body, 'body')}
              className="absolute top-2 right-2"
            >
              {copied === 'body' ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-slate-400 hover:text-white" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Ganti <code className="text-yellow-300">localhost:8000</code> dengan URL backend kamu.
          Response field <code className="text-yellow-300">reply</code> berisi jawaban AI yang dikirim ke WA.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatbotPage() {
  const [configs, setConfigs] = useState<ChatbotConfig[]>([]);
  const [selected, setSelected] = useState<ChatbotConfig | null>(null);
  const [tab, setTab] = useState<Tab>('editor');
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadConfigs = async () => {
    setLoading(true);
    try { setConfigs(await api.getChatbotConfigs()); } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleSave = async (data: Partial<ChatbotConfig>) => {
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        const res = await api.createChatbotConfig(data);
        await loadConfigs();
        const fresh = await api.getChatbotConfig(res.id);
        setSelected(fresh);
        setMode('view');
      } else if (selected) {
        await api.updateChatbotConfig(selected.id, data);
        await loadConfigs();
        const fresh = await api.getChatbotConfig(selected.id);
        setSelected(fresh);
        setMode('view');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (config: ChatbotConfig) => {
    if (!confirm(`Hapus chatbot "${config.name}"? Semua sesi akan ikut terhapus.`)) return;
    try {
      await api.deleteChatbotConfig(config.id);
      if (selected?.id === config.id) { setSelected(null); setMode('view'); }
      await loadConfigs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  };

  const tabLabel: Record<Tab, string> = { editor: 'Konfigurasi', test: 'Test Chat', sessions: 'Sesi' };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ── Left: Config List ────────────────────────────────── */}
      <div className="w-72 flex flex-col border-r border-slate-200 bg-white flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Bot size={16} className="text-teal-600" /> AI Chatbot
            </h2>
            <button onClick={loadConfigs} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <RefreshCw size={13} className="text-slate-400" />
            </button>
          </div>
          <p className="text-xs text-slate-400">Custom chatbot per klien UMKM</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="space-y-2 pt-1">{[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>
          ) : configs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Bot size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">Belum ada chatbot</p>
            </div>
          ) : (
            configs.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelected(c); setMode('view'); setError(''); }}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selected?.id === c.id
                    ? 'border-teal-300 bg-teal-50'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-slate-400 mt-0.5 ml-4 truncate">{c.slug}</p>
                <div className="flex items-center gap-2 mt-1.5 ml-4">
                  <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                    {c.token_cost} token/pesan
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{c.personality_tone}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => { setSelected(null); setMode('create'); setError(''); setTab('editor'); }}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Plus size={15} /> Buat Chatbot Baru
          </button>
        </div>
      </div>

      {/* ── Right: Detail Panel ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* No selection */}
        {!selected && mode !== 'create' ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Bot size={32} className="opacity-30" />
            </div>
            <p className="font-semibold text-slate-500">Pilih atau buat chatbot</p>
            <p className="text-sm mt-1 opacity-60 text-center max-w-xs">
              Setiap chatbot bisa dikustomisasi per klien UMKM — sistem prompt, kepribadian, dan biaya token berbeda-beda
            </p>
          </div>
        ) : mode === 'create' ? (
          /* Create form */
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                <Plus size={18} className="text-teal-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Buat Chatbot Baru</h1>
                <p className="text-sm text-slate-500">Konfigurasi AI chatbot untuk klien UMKM</p>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}
            <div className="card p-5">
              <ConfigForm onSave={handleSave} onCancel={() => setMode('view')} saving={saving} />
            </div>
          </div>
        ) : selected ? (
          /* Selected config detail */
          <div className="max-w-3xl">
            {/* Config header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <Bot size={20} className="text-teal-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-800">{selected.name}</h1>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      selected.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {selected.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">{selected.slug}</code>
                    {selected.description && <> · {selected.description}</>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setMode('edit'); setTab('editor'); }}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Settings2 size={14} /> Edit
                </button>
                <button
                  onClick={() => handleDelete(selected)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                <AlertCircle size={15} className="flex-shrink-0" /> {error}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { label: 'Token/Pesan', value: selected.token_cost, icon: '🪙' },
                { label: 'Maks. History', value: `${selected.max_history} pesan`, icon: '🧠' },
                { label: 'Kepribadian', value: TONES.find(t => t.id === selected.personality_tone)?.label ?? selected.personality_tone, icon: '🎭' },
              ].map(s => (
                <div key={s.label} className="card p-3 text-center">
                  <p className="text-lg mb-0.5">{s.icon}</p>
                  <p className="text-sm font-bold text-slate-800">{s.value}</p>
                  <p className="text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            {mode === 'edit' ? (
              <div className="card p-5">
                <h2 className="font-semibold text-slate-800 mb-4">Edit Konfigurasi</h2>
                <ConfigForm initial={selected} onSave={handleSave} onCancel={() => setMode('view')} saving={saving} />
              </div>
            ) : (
              <>
                <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
                  {TABS.map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        tab === t ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tabLabel[t]}
                    </button>
                  ))}
                </div>

                {tab === 'editor' && (
                  <div className="space-y-4">
                    {selected.system_prompt && (
                      <div className="card p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">System Prompt</p>
                        <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-xl p-3 border border-slate-100">
                          {selected.system_prompt}
                        </pre>
                      </div>
                    )}
                    <N8NCard config={selected} />
                  </div>
                )}

                {tab === 'test' && <div className="card p-5"><TestPanel config={selected} /></div>}
                {tab === 'sessions' && <div className="card p-5"><SessionsPanel config={selected} /></div>}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
