import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

const SETTINGS_PATH = join(process.cwd(), "data", "settings.json");

async function readSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    // If file doesn't exist or is invalid, return defaults
    return {
      litUrl: process.env.LIT_API_URL || "",
      litToken: process.env.LIT_API_TOKEN || "",
      litProxyUrl: process.env.LIT_PROXY_URL || "",
      huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY || "",
      googleApiKey: process.env.GOOGLE_API_KEY || "",
      openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
      llamaModelId: process.env.LLAMA_MODEL_ID || "d4ydy/ib-physics-question-generator",
      refinementProvider: process.env.REFINEMENT_PROVIDER || "openrouter", // Default to OpenRouter
      useOwnerCredits: true
    };
  }
}

async function writeSettings(settings: Record<string, unknown>) {
  await fs.mkdir(join(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * GET /api/settings
 * Returns the current settings (server-side JSON file or falling back to env).
 * Sensitive values are masked for front-end display (only last 4 characters shown).
 */
export async function GET() {
  try {
    const settings = await readSettings();

    const maskSecret = (val?: string) => {
      if (!val) return "";
      const s = String(val);
      if (s.length <= 4) return "****";
      return "****" + s.slice(-4);
    };

    const masked = {
      ...settings,
      litToken: maskSecret(settings.litToken),
      huggingfaceApiKey: maskSecret(settings.huggingfaceApiKey),
      googleApiKey: maskSecret(settings.googleApiKey),
      openRouterApiKey: maskSecret(settings.openRouterApiKey)
    };

    return NextResponse.json(masked);
  } catch (err: unknown) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json({ error: "failed_to_read_settings", message: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/settings
 * Accepts a JSON body with any of the supported keys and updates the server-side settings file.
 *
 * Supported keys:
 * - litUrl
 * - litToken
 * - litProxyUrl
 * - huggingfaceApiKey
 * - googleApiKey
 * - openRouterApiKey
 * - llamaModelId
 * - refinementProvider ("gemini" | "openrouter")
 * - useOwnerCredits (boolean)
 *
 * Returns the updated settings.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const allowed = new Set([
      "litUrl",
      "litToken",
      "litProxyUrl",
      "huggingfaceApiKey",
      "googleApiKey",
      "openRouterApiKey",
      "llamaModelId",
      "refinementProvider",
      "useOwnerCredits"
    ]);

    const current = await readSettings();
    for (const [k, v] of Object.entries(body)) {
      if (!allowed.has(k)) continue;
      current[k] = v;
    }

    await writeSettings(current);

    // Auto-reload backend services so settings take effect immediately (no server restart required).
    // We call the internal admin reload endpoint which will reinitialize orchestrator/services.
    try {
      const reloadUrl = new URL('/api/admin/reload', req.url).toString();
      const reloadRes = await fetch(reloadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          geminiApiKey: current.googleApiKey || undefined,
          openRouterApiKey: current.openRouterApiKey || undefined,
          refinementProvider: current.refinementProvider || undefined
        })
      });
      if (!reloadRes.ok) {
        console.warn('Auto-reload failed after settings update', await reloadRes.text().catch(() => '<no body>'));
      } else {
        console.info('Auto-reload executed successfully after settings update');
      }
    } catch (e) {
      console.warn('Auto-reload threw error:', e);
    }

    return NextResponse.json(current);
  } catch (err: unknown) {
    console.error("POST /api/settings error:", err);
    return NextResponse.json({ error: "failed_to_write_settings", message: String(err) }, { status: 500 });
  }
}