'use client';
import { useState } from 'react';

// URL cloud dipanggil langsung dari browser (client-side) untuk menghindari
// masalah server-side fetch antar project Railway.
const CLOUD_URL = 'https://umkm-ai-cloud-production-d038.up.railway.app';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${CLOUD_URL}/license/validate`, {
        method: 'GET',
        headers: { 'x-api-key': key.trim() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Gagal validasi (${res.status})`);
      }
      const data = await res.json();
      localStorage.setItem('umkm_license', key.trim());
      localStorage.setItem('umkm_business', data.business_name ?? '');
      window.location.href = '/';
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Tidak bisa terhubung ke server. Periksa koneksi internet Anda.');
      } else {
        setError(err instanceof Error ? err.message : 'License key tidak valid');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">UMKM AI Suite</h1>
          <p className="text-sm text-slate-500 mt-1">Masuk dengan license key Anda</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              License Key
            </label>
            <input
              type="text"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="umkm-xxxxxxxxxxxx"
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          Dapatkan license key dari admin
        </p>
      </div>
    </div>
  );
}
