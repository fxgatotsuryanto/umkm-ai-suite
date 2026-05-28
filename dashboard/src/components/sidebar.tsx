'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, MessageSquare, PenSquare, Settings, Zap, Globe, LogOut } from 'lucide-react';
import { api, type Balance } from '@/lib/api';

const navItems = [
  { href: '/',           label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/wa',         label: 'WhatsApp Auto-Reply',  icon: MessageSquare  },
  { href: '/webchat',    label: 'Web Chat',             icon: Globe          },
  { href: '/konten',     label: 'Content Marketing',    icon: PenSquare      },
  { href: '/pengaturan', label: 'Pengaturan',           icon: Settings       },
];

const PACKAGE_MAX: Record<string, number> = { starter: 500, growth: 5000, pro: 99999 };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [balance, setBalance]     = useState<Balance | null>(null);
  const [storeName, setStoreName] = useState('Toko Saya');

  function handleLogout() {
    localStorage.removeItem('umkm_license');
    localStorage.removeItem('umkm_business');
    router.replace('/login');
  }

  useEffect(() => {
    api.getBalance().then(setBalance).catch(() => {});
    api.getProfile()
      .then(d => { if ('name' in d && d.name) setStoreName(d.name); })
      .catch(() => {});
  }, []);

  const max       = PACKAGE_MAX[balance?.package ?? 'starter'] ?? 500;
  const pct       = balance ? Math.min(100, (balance.balance / max) * 100) : 0;
  const remaining = balance ? Math.max(0, max - balance.balance) : 0;

  return (
    <aside className="flex flex-col w-64 min-h-screen flex-shrink-0" style={{ backgroundColor: '#042f2e' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        <span className="font-bold text-base text-white tracking-tight">UMKM AI Suite</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-teal-700/80 text-white'
                  : 'text-teal-100/60 hover:bg-teal-800/40 hover:text-teal-100'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Token Card */}
      <div className="px-4 pb-6 pt-2">
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-teal-300">Saldo Token</span>
            <span className="text-xs font-bold text-white">{Math.round(pct)}%</span>
          </div>
          <div className="flex items-end gap-1.5 mb-2">
            <span className="text-2xl font-bold text-white leading-none">
              {balance?.balance.toLocaleString('id-ID') ?? '0'}
            </span>
            <span className="text-xs text-teal-400 mb-0.5">
              / {max === 99999 ? '∞' : max.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="w-full rounded-full h-2 mb-2" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: '#2dd4bf' }}
            />
          </div>
          <p className="text-xs text-teal-400 mb-3">
            Terpakai: {remaining.toLocaleString('id-ID')} Token
          </p>
          <Link
            href="/pengaturan"
            className="block w-full text-center bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            Isi Ulang
          </Link>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-4 py-2.5 mb-2 text-sm text-teal-400 hover:text-white hover:bg-teal-800/40 rounded-xl transition-colors"
        >
          <LogOut size={16} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
