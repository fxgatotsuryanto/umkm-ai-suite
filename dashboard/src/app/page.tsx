'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare, Sparkles, Globe, ArrowUpRight,
  TrendingUp, Coins, Check, Users,
} from 'lucide-react';
import { api, type Stats, type Chat } from '@/lib/api';

function MetricCard({
  label, value, sub, iconBg, icon, trend, bar,
}: {
  label: string; value: string; sub?: string;
  iconBg: string; icon: React.ReactNode;
  trend?: string; bar?: number;
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
      {sub && !trend && <p className="text-xs text-gray-400">{sub}</p>}
      {bar !== undefined && (
        <div className="mt-2">
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${bar}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{bar.toFixed(1)}% dipakai hari ini</p>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [recentChats, setChats]   = useState<Chat[]>([]);
  const [storeName, setStoreName] = useState('Admin');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      api.getStats().then(setStats).catch(() => {}),
      api.getChats(10).then(setChats).catch(() => {}),
      api.getProfile()
        .then(d => { if ('name' in d && d.name) setStoreName(d.name); })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const today       = stats?.today;
  const total       = stats?.total;
  const tokensToday = today?.tokens_used ?? 0;
  const tokenMax    = 500;
  const tokenBar    = Math.min(100, (tokensToday / tokenMax) * 100);

  const conversionRate =
    (total?.webchat_sessions ?? 0) > 0
      ? (((total?.webchat_leads ?? 0) / (total?.webchat_sessions ?? 1)) * 100).toFixed(1)
      : '—';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
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

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Chat WA Hari Ini"
          value={loading ? '—' : String(today?.wa_chats ?? 0)}
          sub={`Total: ${total?.wa_chats ?? 0} chat`}
          iconBg="bg-blue-50"
          icon={<MessageSquare size={18} className="text-blue-500" />}
          trend={today?.wa_chats ? `+${today.wa_chats} hari ini` : undefined}
        />
        <MetricCard
          label="Web Chat Leads"
          value={loading ? '—' : String(today?.webchat_leads ?? 0)}
          sub={`Total: ${total?.webchat_leads ?? 0} leads · Konversi ${conversionRate}%`}
          iconBg="bg-green-50"
          icon={<Users size={18} className="text-green-500" />}
          trend={today?.webchat_leads ? `+${today.webchat_leads} hari ini` : undefined}
        />
        <MetricCard
          label="Token Terpakai (Hari Ini)"
          value={loading ? '—' : `${tokensToday}`}
          iconBg="bg-amber-50"
          icon={<Coins size={18} className="text-amber-500" />}
          bar={loading ? 0 : tokenBar}
        />
        <MetricCard
          label="Konten Dibuat"
          value={loading ? '—' : String(today?.content_generated ?? 0)}
          sub={`Total: ${total?.content_generated ?? 0} konten`}
          iconBg="bg-purple-50"
          icon={<Sparkles size={18} className="text-purple-500" />}
        />
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent WA Chats */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Pesan WA Terakhir</h2>
            <Link href="/wa" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">
              Lihat semua →
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentChats.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <MessageSquare size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">Belum ada chat masuk</p>
              <p className="text-xs mt-1 opacity-70">Pesan WA akan muncul setelah n8n terkoneksi</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentChats.map(chat => (
                <div
                  key={chat.id}
                  className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors"
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
                        {new Date(chat.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {chat.message_out.slice(0, 55)}{chat.message_out.length > 55 ? '…' : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Check size={10} /> AI
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* WebChat mini stats */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Globe size={15} className="text-green-500" /> Web Chat
              </h2>
              <Link href="/webchat" className="text-xs text-teal-600 font-semibold">
                Lihat →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Sesi', value: total?.webchat_sessions ?? 0 },
                { label: 'Leads', value: total?.webchat_leads ?? 0 },
                { label: 'Rate', value: `${conversionRate}%` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center py-2 bg-gray-50 rounded-xl">
                  <p className="text-lg font-bold text-gray-800">{loading ? '—' : value}</p>
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>
            <Link
              href="/webchat"
              className="mt-3 flex items-center justify-center gap-2 w-full text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 py-2 rounded-xl transition-colors"
            >
              <TrendingUp size={14} /> Lihat Leads
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              {[
                { label: 'Lihat Chat WA',        href: '/wa'         },
                { label: 'Generate Konten',       href: '/konten'     },
                { label: 'Konfigurasi Widget',    href: '/webchat?tab=config' },
                { label: 'Atur Produk & FAQ',     href: '/pengaturan' },
              ].map(item => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block w-full text-center bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
