'use client';

import React, { useEffect, useState } from 'react';

type Settings = {
  litUrl: string;
  litToken: string;
  litProxyUrl: string;
  huggingfaceApiKey: string;
  openRouterApiKey: string;
  llamaModelId: string;
  refinementProvider: 'openrouter';
  useOwnerCredits: boolean;
};

export default function SettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>({
    litUrl: '',
    litToken: '',
    litProxyUrl: '',
    huggingfaceApiKey: '',
    openRouterApiKey: '',
    llamaModelId: '',
    refinementProvider: 'openrouter',
    useOwnerCredits: true
  });

  // Keep the raw "masked" values returned by GET so we can detect changes to token fields.
  const [originalMasked, setOriginalMasked] = useState<Partial<Settings>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        setSettings({
          litUrl: data.litUrl || '',
          litToken: data.litToken || '',
          litProxyUrl: data.litProxyUrl || '',
          huggingfaceApiKey: data.huggingfaceApiKey || '',
          openRouterApiKey: data.openRouterApiKey || '',
          llamaModelId: data.llamaModelId || '',
          refinementProvider: data.refinementProvider || 'openrouter',
          useOwnerCredits: !!data.useOwnerCredits
        });
        setOriginalMasked({
          litToken: data.litToken || '',
          huggingfaceApiKey: data.huggingfaceApiKey || '',
          openRouterApiKey: data.openRouterApiKey || ''
        });
      } catch (err) {
        console.error('Failed to load settings', err);
        setMessage('Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Removed unused 'changed' function - functionality handled in tokenWasChanged

  function tokenWasChanged(field: keyof Settings) {
    // If originalMasked has a masked value (starts with ****) and the current settings value equals that mask,
    // treat it as unchanged.
    const orig = (originalMasked as Record<string, unknown>)[field];
    const cur = (settings as Record<string, unknown>)[field];

    if (!orig) {
      // no original masked -> include only if user provided a value
      return cur !== '' && cur !== null && typeof cur !== 'undefined';
    }

    if (typeof orig === 'string' && orig.startsWith('****')) {
      // user kept the masked string (didn't replace), so unchanged
      return cur !== orig;
    }

    // otherwise compare directly
    return cur !== orig;
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);

    try {
      const payload: Partial<Settings> = {};

      // Always include non-secret fields if changed
      if (settings.litUrl) payload.litUrl = settings.litUrl;
      else payload.litUrl = '';

      if (settings.litProxyUrl) payload.litProxyUrl = settings.litProxyUrl;
      else payload.litProxyUrl = '';

      if (settings.llamaModelId) payload.llamaModelId = settings.llamaModelId;
      else payload.llamaModelId = '';

      payload.useOwnerCredits = !!settings.useOwnerCredits;

      // For secret/token fields, only include them if the user changed them from the masked value.
      if (tokenWasChanged('litToken')) {
        payload.litToken = settings.litToken;
      }
      if (tokenWasChanged('huggingfaceApiKey')) {
        payload.huggingfaceApiKey = settings.huggingfaceApiKey;
      }
      if (tokenWasChanged('openRouterApiKey')) {
        payload.openRouterApiKey = settings.openRouterApiKey;
      }

      // Always include refinement provider
      payload.refinementProvider = settings.refinementProvider;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(err?.message || 'Failed to save settings');
      }

      // Refresh masked representation from GET
      const refreshed = await fetch('/api/settings').then(r => r.json());
      setSettings({
        litUrl: refreshed.litUrl || '',
        litToken: refreshed.litToken || '',
        litProxyUrl: refreshed.litProxyUrl || '',
        huggingfaceApiKey: refreshed.huggingfaceApiKey || '',
        openRouterApiKey: refreshed.openRouterApiKey || '',
        llamaModelId: refreshed.llamaModelId || '',
        refinementProvider: refreshed.refinementProvider || 'openrouter',
        useOwnerCredits: !!refreshed.useOwnerCredits
      });
      setOriginalMasked({
        litToken: refreshed.litToken || '',
        huggingfaceApiKey: refreshed.huggingfaceApiKey || '',
        openRouterApiKey: refreshed.openRouterApiKey || ''
      });

      setMessage('Settings saved successfully.');
    } catch (err: unknown) {
      console.error(err);
      setMessage('Failed to save settings: ' + ((err as Error)?.message || String(err)));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-4">Loading settings…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-4">Advanced API & Model Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Lightning (LIT) API URL</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.litUrl}
            onChange={(e) => setSettings({ ...settings, litUrl: e.target.value })}
            placeholder="https://.../predict"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Lightning (LIT) API Token</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.litToken}
            onChange={(e) => setSettings({ ...settings, litToken: e.target.value })}
            placeholder="Enter token (leave masked to keep current)"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Tokens are masked when displayed. To keep the current token, leave this field unchanged.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium">LIT Proxy URL (optional)</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.litProxyUrl}
            onChange={(e) => setSettings({ ...settings, litProxyUrl: e.target.value })}
            placeholder="http://localhost:3000/api/predict-proxy"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Hugging Face API Key (optional)</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.huggingfaceApiKey}
            onChange={(e) => setSettings({ ...settings, huggingfaceApiKey: e.target.value })}
            placeholder="hf_xxx (leave masked to keep current)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">OpenRouter API Key</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.openRouterApiKey}
            onChange={(e) => setSettings({ ...settings, openRouterApiKey: e.target.value })}
            placeholder="Enter OpenRouter API key (leave masked to keep current)"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Get a free API key at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">openrouter.ai</a>. 
            Tokens are masked when displayed. To keep the current token, leave this field unchanged.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium">Refinement Provider</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={settings.refinementProvider}
            onChange={(e) => setSettings({ ...settings, refinementProvider: e.target.value as 'openrouter' })}
          >
            <option value="openrouter">OpenRouter (DeepSeek Chat v3.1 Free)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            <strong>Default:</strong> OpenRouter with DeepSeek provides excellent quality for free.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium">LLama Model ID</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={settings.llamaModelId}
            onChange={(e) => setSettings({ ...settings, llamaModelId: e.target.value })}
            placeholder="d4ydy/ib-physics-question-generator"
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            id="useOwnerCredits"
            type="checkbox"
            checked={settings.useOwnerCredits}
            onChange={(e) => setSettings({ ...settings, useOwnerCredits: e.target.checked })}
          />
          <label htmlFor="useOwnerCredits" className="text-sm">
            Allow using owner&apos;s credits when the user doesn&apos;t provide API keys (useOwnerCredits)
          </label>
        </div>

        <div className="flex items-center space-x-2 mt-4">
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>

          <button
            onClick={async () => {
              setLoading(true);
              try {
                const r = await fetch('/api/settings');
                const d = await r.json();
                setSettings({
                  litUrl: d.litUrl || '',
                  litToken: d.litToken || '',
                  litProxyUrl: d.litProxyUrl || '',
                  huggingfaceApiKey: d.huggingfaceApiKey || '',
                  openRouterApiKey: d.openRouterApiKey || '',
                  llamaModelId: d.llamaModelId || '',
                  refinementProvider: d.refinementProvider || 'openrouter',
                  useOwnerCredits: !!d.useOwnerCredits
                });
                setOriginalMasked({
                  litToken: d.litToken || '',
                  huggingfaceApiKey: d.huggingfaceApiKey || '',
                  openRouterApiKey: d.openRouterApiKey || ''
                });
                setMessage('Settings reloaded.');
              } catch {
                setMessage('Failed to reload settings.');
              } finally {
                setLoading(false);
              }
            }}
            className="px-4 py-2 border rounded"
          >
            Reset
          </button>
        </div>

        {message && <div className="mt-3 text-sm">{message}</div>}

        <div className="mt-4 text-xs text-muted-foreground">
          Note: If no API keys are provided, the server will use owner credentials (if enabled) from its settings or the values in <code>.env.example</code>. Owner credentials are intended for first-deployment free access and will be rotated for production.
        </div>
      </div>
    </div>
  );
}