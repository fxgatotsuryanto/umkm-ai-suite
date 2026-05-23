'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Sparkles, Search, SlidersHorizontal,
  ArrowUpRight, TrendingUp, Coins, Check,
} from 'lucide-react';
import { api, type Balance, type Chat } from '@/lib/api';

// ── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, trend, iconBg, icon, progressPct, extra }: {
  label: string; value: string; trend?: string;
  iconBg: string; icon: React.ReactNode;
  progressPct?: number; extra?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-gray-500 font-medium leading-tight">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      {trend && (
        <p className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
          <ArrowUpRight size={13} /> {trend}
        </p>
      )}
      {progressPct !== undefined && (
        <div className="mt-2">
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progressPct.toFixed(1)}%</p>
        </div>
      )}
      {extra}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [balance, setBalance]     = useState<Balance | null>(null);
  const [chats, setChats]         = useState<Chat[]>([]);
  const [loading, setLoading]     = useState(true);
  const [storeName, setStoreName] = useState('Admin');
  const [search, setSearch]       = useState('');
  const [contentCount, setContentCount] = useState(0);

  useEffect(() => {
    Promise.all([
      api.getBalance().then(setBalance).catch(() => {}),
      api.getChats(200).then(setChats).catch(() => {}),
      api.getProfile().then(d => { if ('name' in d && d.name) setStoreName(d.name); }).catch(() => {}),
      api.getContentLibrary({ limit: 100 }).then(d => setContentCount(d.length)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const today = new Date().toDateString();
  const chatsToday    = chats.filter(c => new Date(c.created_at).toDateString() === today).length;
  const tokensToday   = chats.filter(c => new Date(c.created_at).toDateString() === today)
                             .reduce((s, c) => s + c.tokens_used, 0);
  const totalTokens   = (balance?.balance ?? 0) + tokensToday;
  const tokenPct      = totalTokens > 0 ? Math.min(100, (tokensToday / totalTokens) * 100) : 0;

  // Latest unique contacts
  const grouped = chats.reduce((acc, c) => {
    if (!acc[c.wa_number]) acc[c.wa_number] = c;
    return acc;
  }, {} as Record<string, Chat>);

  const filteredContacts = Object.values(grouped)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter(c =>
      !search ||
      c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.wa_number.includes(search)
    )
    .slice(0, 6);

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Selamat Datang, {storeName} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Ringkasan bisnis kamu hari ini</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-700">{storeName}</span>
          <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {storeName[0]?.toUpperCase() ?? 'A'}
          </div>
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Chat Hari Ini"
          value={chatsToday.toString()}
          trend="+12%"
          iconBg="bg-blue-50"
          icon={<MessageSquare size={18} className="text-blue-500" />}
        />
        <MetricCard
          label="Auto-Reply Rate"
          value={chats.length > 0 ? '100%' : '—'}
          trend="+1.2%"
          iconBg="bg-teal-50"
          icon={<TrendingUp size={18} className="text-teal-500" />}
        />
        <MetricCard
          label="Token Terpakai (Hari Ini)"
          value={`${tokensToday} Token`}
          iconBg="bg-emerald-50"
          icon={<Coins size={18} className="text-emerald-500" />}
          progressPct={tokenPct}
        />
        <MetricCard
          label="Konten Dibuat"
          value={contentCount.toString()}
          iconBg="bg-purple-50"
          icon={<Sparkles size={18} className="text-purple-500" />}
          extra={
            contentCount > 0 ? (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <span>📸</span><span>🎵</span> multi-platform
              </p>
            ) : null
          }
        />
      </div>

      {/* ── Bottom Section ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Live WA Chats */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Live WhatsApp Chats</h2>
            <Link href="/wa" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">
              Lihat semua →
            </Link>
          </div>

          {/* Search + Filter */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari chat..."
                className="w-full pl-10 pr-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-colors"
              />
            </div>
            <button className="flex items-center gap-2 px-4 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium transition-colors">
              <SlidersHorizontal size={14} /> Filter
            </button>
          </div>

          {/* Chat List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">Belum ada chat masuk</p>
              <p className="text-xs mt-1 opacity-70">Pesan WA akan muncul setelah n8n terkoneksi</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredContacts.map(chat => (
                <div
                  key={chat.wa_number}
                  className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors cursor-default"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(chat.customer_name || chat.wa_number)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {chat.customer_name || chat.wa_number}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(chat.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      Last message: {chat.message_out.slice(0, 45)}
                      {chat.message_out.length > 45 ? '...' : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Check size={10} /> AI Replied
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {[
                { label: 'Buat Balasan Baru',    href: '/wa'     },
                { label: 'Jadwal Konten',         href: '/konten' },
                { label: 'Generate Ide Konten',   href: '/konten' },
              ].map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block w-full text-center bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 mb-4">Aktivitas Terbaru</h2>
            {chats.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Belum ada aktivitas</p>
            ) : (
              <div className="space-y-4">
                {chats.slice(0, 4).map(c => (
                  <div key={c.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs flex-shrink-0">
                      {(c.customer_name || c.wa_number)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 leading-snug">
                        <span className="font-semibold">{c.customer_name || c.wa_number}</span>
                        {' '}mengirim pesan baru ke toko
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
