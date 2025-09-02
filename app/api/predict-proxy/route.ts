import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Prefer environment variables, fall back to server-side settings file (data/settings.json)
    let targetUrl = process.env.LIT_API_URL;
    let apiToken = process.env.LIT_API_TOKEN;

    if (!targetUrl || !apiToken) {
      try {
        const settingsPath = join(process.cwd(), 'data', 'settings.json');
        if (existsSync(settingsPath)) {
          const raw = await fs.readFile(settingsPath, 'utf8');
          const settings = JSON.parse(raw || '{}');
          if (!targetUrl) targetUrl = settings.litUrl || settings.litProxyUrl;
          if (!apiToken) apiToken = settings.litToken;
        }
      } catch (e) {
        console.warn('predict-proxy: failed to read data/settings.json', e);
      }
    }

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'LIT_API_URL not configured. Set LIT_API_URL in your server environment or configure via /api/settings.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!apiToken) {
      return new Response(JSON.stringify({ error: 'LIT_API_TOKEN not configured. Set LIT_API_TOKEN in your server environment or configure via /api/settings.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    });

    const contentType = upstream.headers.get('content-type') ?? 'application/json';
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err: unknown) {
    console.error('predict-proxy error:', err);
    return new Response(JSON.stringify({ error: 'predict_proxy_error', message: (err as Error)?.message ?? String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}