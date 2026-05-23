'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Sparkles, Plus, Coins, CheckCircle, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { api, type Balance, type Chat } from '@/lib/api';

function MetricCard({ icon: Icon, label, value, sub, colorBg, colorIcon }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  colorBg: string; colorIcon: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorBg}`}>
          <Icon size={20} className={colorIcon} />
        </div>
      </div>
    </div>
  );
}

const PACKAGE_MAX: Record<string, number> = { starter: 500, growth: 1500, pro: 99999 };

export default function DashboardPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    Promise.all([
      api.getBalance().then(setBalance).catch(() => {}),
      api.getChats(50).then(setChats).catch(() => {}),
      api.getProfile().then(d => { if ('name' in d && d.name) setStoreName(d.name); }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const today = new Date().toDateString();
  const chatsToday = chats.filter(c => new Date(c.created_at).toDateString() === today).length;
  const totalTokenUsed = chats.reduce((sum, c) => sum + c.tokens_used, 0);

  const max = PACKAGE_MAX[balance?.package ?? 'starter'] ?? 500;
  const balancePct = balance ? Math.min(100, (balance.balance / max) * 100) : 0;
  const isLow = balance ? balance.balance < 50 : false;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {storeName ? `Halo, ${storeName} 👋` : 'Dashboard'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Ringkasan aktivitas toko kamu hari ini</p>
        </div>
        <Link href="/pengaturan" className="btn-primary inline-flex items-center gap-2 self-start sm:self-auto">
          <Plus size={15} /> Top-up Token
        </Link>
      </div>

      {/* Token Banner */}
      {balance && (
        <div className={`rounded-2xl p-5 mb-6 text-white ${isLow ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-indigo-600 to-indigo-700'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Coins size={20} />
              </div>
              <div>
                <p className="text-sm font-medium opacity-80">Saldo Token</p>
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-bold">{balance.balance.toLocaleString('id-ID')}</p>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full capitalize">{balance.package}</span>
                </div>
              </div>
            </div>
            <div className="sm:text-right">
              <div className="w-48 bg-white/20 rounded-full h-2 mb-1">
                <div className="bg-white h-2 rounded-full transition-all" style={{ width: `${balancePct}%` }} />
              </div>
              <p className="text-xs opacity-70">
                {balance.balance} / {max === 99999 ? '∞' : max.toLocaleString('id-ID')} token tersisa
              </p>
              {isLow && (
                <Link href="/pengaturan" className="inline-flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full mt-1 transition-colors">
                  Top-up sekarang <ArrowRight size={11} />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard icon={MessageSquare} label="Chat Hari Ini" value={chatsToday} sub="pesan masuk" colorBg="bg-blue-50" colorIcon="text-blue-600" />
        <MetricCard icon={CheckCircle} label="Auto-Reply Rate" value={chats.length > 0 ? '100%' : '—'} sub="semua dibalas AI" colorBg="bg-green-50" colorIcon="text-green-600" />
        <MetricCard icon={Coins} label="Token Terpakai" value={totalTokenUsed} sub="dari semua chat" colorBg="bg-amber-50" colorIcon="text-amber-600" />
        <MetricCard icon={TrendingUp} label="Total Chat" value={chats.length} sub="semua waktu" colorBg="bg-purple-50" colorIcon="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Chats */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">Chat Terbaru</h2>
            <Link href="/wa" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Lihat semua <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[60px] bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <MessageSquare size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm font-medium">Belum ada chat masuk</p>
              <p className="text-xs mt-1">Chat dari WA akan muncul di sini</p>
            </div>
          ) : (
            <div className="space-y-1">
              {chats.slice(0, 5).map(chat => (
                <div key={chat.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-default">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-600 font-bold text-sm">
                    {(chat.customer_name || chat.wa_number)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {chat.customer_name || chat.wa_number}
                      </p>
                      <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                        {new Date(chat.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{chat.message_in}</p>
                  </div>
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-400" title="AI Replied" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Aksi Cepat</h2>
          <div className="space-y-2.5">
            {[
              { href: '/konten', icon: Sparkles, label: 'Generate Konten', sub: 'IG · TikTok · FB · WA', bg: 'bg-indigo-600', ring: 'ring-indigo-100', accent: true },
              { href: '/pengaturan?tab=produk', icon: Plus, label: 'Tambah Produk', sub: 'Update katalog toko', bg: 'bg-slate-700', ring: 'ring-slate-100', accent: false },
              { href: '/pengaturan?tab=faq', icon: MessageSquare, label: 'Tambah FAQ', sub: 'Latih AI menjawab', bg: 'bg-slate-700', ring: 'ring-slate-100', accent: false },
              { href: '/wa', icon: Clock, label: 'Monitor WA', sub: 'Cek chat masuk', bg: 'bg-green-600', ring: 'ring-green-100', accent: false },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm ${item.accent ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100' : 'border-slate-100 hover:bg-slate-50'}`}
              >
                <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 ring-4 ${item.ring}`}>
                  <item.icon size={15} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
