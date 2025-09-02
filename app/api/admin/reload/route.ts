import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as unknown));
    const geminiApiKey = body?.geminiApiKey as string | undefined;

    // Dynamic import to avoid circular dependency at build time
    const mod = await import('@/app/api/generate-question/route') as { reloadServices: (apiKey?: string) => Promise<{ ok: true }> };
    if (typeof mod.reloadServices !== 'function') {
      return NextResponse.json({ error: 'reload_not_available' }, { status: 500 });
    }

    await mod.reloadServices(geminiApiKey);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('POST /api/admin/reload error:', err);
    return NextResponse.json({ error: 'reload_failed', message: String(err) }, { status: 500 });
  }
}