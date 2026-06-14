import { NextRequest, NextResponse } from 'next/server';

// Cloud backend (license & token billing) — sekarang di domain baru
const CLOUD_URL =
  process.env.CLOUD_API_URL ??
  'https://umkm-backend.aimarketingstrategic.com';

// Suite backend (AI, chat, konten, produk) — masih di Railway
const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'https://umkm-ai-suite-production.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey: string = body.license_key ?? '';

    if (!licenseKey) {
      return NextResponse.json({ detail: 'License key tidak boleh kosong' }, { status: 400 });
    }

    // Coba validasi via backend suite dulu
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
    let cloudStatus = 0;
    let cloudBody = '';
    try {
      const cloudRes = await fetch(`${CLOUD_URL}/license/validate`, {
        method: 'GET',
        headers: { 'x-api-key': licenseKey },
        signal: AbortSignal.timeout(8000),
      });
      cloudStatus = cloudRes.status;
      cloudBody = await cloudRes.text();

      if (cloudRes.ok) {
        const data = JSON.parse(cloudBody);
        return NextResponse.json({
          success: true,
          business_name: data.business_name ?? '',
          package: data.package ?? '',
          expires_at: data.expires_at ?? null,
        });
      }
    } catch (fetchErr) {
      return NextResponse.json(
        { detail: `Gagal koneksi ke cloud: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}` },
        { status: 502 }
      );
    }

    // Tampilkan error detail dari cloud untuk debugging
    let cloudDetail = '';
    try { cloudDetail = JSON.parse(cloudBody)?.detail ?? cloudBody; } catch { cloudDetail = cloudBody; }

    return NextResponse.json(
      { detail: `[Cloud ${cloudStatus}] ${cloudDetail}` },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      { detail: `Error: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 }
    );
  }
}
