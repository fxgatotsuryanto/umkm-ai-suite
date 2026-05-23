'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, MessageSquare, Sparkles, Settings, Coins, Zap } from 'lucide-react';
import { api, type Balance, type Profile } from '@/lib/api';

const navItems = [
  { href: '/',           label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/wa',         label: 'WA Auto-Reply',     icon: MessageSquare },
  { href: '/konten',     label: 'Konten Marketing',  icon: Sparkles },
  { href: '/pengaturan', label: 'Pengaturan',        icon: Settings },
];

const PACKAGE_MAX: Record<string, number> = { starter: 500, growth: 1500, pro: 99999 };

export default function Sidebar() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [storeName, setStoreName] = useState('Toko Saya');

  useEffect(() => {
    api.getBalance().then(setBalance).catch(() => {});
    api.getProfile().then(d => {
      if ('name' in d && d.name) setStoreName(d.name);
    }).catch(() => {});
  }, []);

  const max = PACKAGE_MAX[balance?.package ?? 'starter'] ?? 500;
  const pct = balance ? Math.min(100, (balance.balance / max) * 100) : 0;
  const low = balance ? balance.balance < 50 : false;

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 text-white flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 bg-slate-800 border-b border-slate-700/60">
        <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm text-white leading-tight">UMKM AI Suite</p>
          <p className="text-xs text-slate-400 truncate">{storeName}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Menu</p>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Token Footer */}
      <div className="px-3 py-4 border-t border-slate-700/60">
        <div className="bg-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Coins size={12} /> Saldo Token
            </span>
            <span className={`text-xs font-bold ${low ? 'text-red-400' : 'text-indigo-300'}`}>
              {balance?.balance.toLocaleString() ?? '—'}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all ${low ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-slate-500 capitalize">{balance?.package ?? 'starter'}</span>
            {low && <span className="text-xs text-red-400">Token hampir habis</span>}
          </div>
        </div>
      </div>
    </aside>
  );
}
