import { NextRequest, NextResponse } from 'next/server';

// Validasi license key langsung ke cloud server.
// Urutan prioritas URL:
//   1. CLOUD_API_URL   — set di Railway Dashboard service env vars (runtime)
//   2. BACKEND_URL     — set di Railway Dashboard service env vars (runtime)
//   3. Default         — URL cloud default yang sudah di-deploy
const CLOUD_URL =
  process.env.CLOUD_API_URL ??
  'https://umkm-ai-cloud.up.railway.app';

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey: string = body.license_key ?? '';

    if (!licenseKey) {
      return NextResponse.json({ detail: 'License key tidak boleh kosong' }, { status: 400 });
    }

    // Coba validasi via backend suite dulu (jika BACKEND_URL di-set)
    if (BACKEND_URL) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license_key: licenseKey }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          return NextResponse.json(data);
        }
      } catch {
        // Backend tidak tersedia, lanjut ke validasi cloud langsung
      }
    }

    // Validasi langsung ke cloud server
    const cloudRes = await fetch(`${CLOUD_URL}/license/validate`, {
      method: 'GET',
      headers: { 'x-api-key': licenseKey },
      signal: AbortSignal.timeout(8000),
    });

    if (cloudRes.ok) {
      const data = await cloudRes.json();
      return NextResponse.json({
        success: true,
        business_name: data.business_name ?? '',
        package: data.package ?? '',
        expires_at: data.expires_at ?? null,
      });
    }

    return NextResponse.json(
      { detail: 'License key tidak valid atau tidak ditemukan' },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      { detail: `Tidak bisa terhubung ke server: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 502 }
    );
  }
}
