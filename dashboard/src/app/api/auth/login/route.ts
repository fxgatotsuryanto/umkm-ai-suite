import { NextRequest, NextResponse } from 'next/server';

const CLOUD_URL =
  process.env.CLOUD_API_URL ??
  'https://umkm-backend.aimarketingstrategic.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey: string = (body.license_key ?? '').trim();

    if (!licenseKey) {
      return NextResponse.json({ detail: 'License key tidak boleh kosong' }, { status: 400 });
    }

    console.log(`[Login] Validating license via ${CLOUD_URL}/license/validate`);

    let cloudRes: Response;
    try {
      cloudRes = await fetch(`${CLOUD_URL}/license/validate`, {
        method: 'GET',
        headers: { 'X-API-Key': licenseKey },
      });
    } catch (fetchErr) {
      console.error('[Login] Cloud server unreachable:', fetchErr);
      return NextResponse.json(
        { detail: `Tidak dapat terhubung ke server (${CLOUD_URL}). Periksa koneksi internet Anda.` },
        { status: 502 }
      );
    }

    const rawBody = await cloudRes.text();
    console.log(`[Login] Cloud status: ${cloudRes.status}, body: ${rawBody}`);

    if (cloudRes.ok) {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawBody); } catch { /* ignore */ }
      if (!data.valid && !data.success) {
        return NextResponse.json({ detail: 'License key tidak valid atau expired' }, { status: 401 });
      }
      return NextResponse.json({
        success: true,
        business_name: data.business_name ?? '',
        package: data.package ?? '',
        expires_at: data.expires_at ?? null,
      });
    }

    let detail = '';
    try { detail = (JSON.parse(rawBody) as { detail?: string }).detail ?? rawBody; } catch { detail = rawBody; }
    return NextResponse.json(
      { detail: detail || `License key tidak valid (${cloudRes.status})` },
      { status: cloudRes.status }
    );

  } catch (err) {
    console.error('[Login] Unexpected error:', err);
    return NextResponse.json(
      { detail: `Error pada server: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 500 }
    );
  }
}
