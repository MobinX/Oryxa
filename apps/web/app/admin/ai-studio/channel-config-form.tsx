'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { saveAdminAiChannelConfig, type AdminAiChannelRow } from '@/lib/api';

const TONES = ['friendly', 'professional', 'concise', 'energetic', 'custom'] as const;
const LANGUAGES = ['auto', 'en', 'bn', 'zh', 'es', 'fr', 'de'] as const;

type ConfigState = {
  aiEnabled: boolean;
  aiCommentsEnabled: boolean;
  autoReply: boolean;
  confidenceThreshold: string;
  maxReplyLength: string;
  tone: string;
  language: string;
  perChannelInstructions: string;
  leadQuestionsText: string;
};

export function ChannelConfigForm({
  bearer,
  channelId,
  config,
}: {
  bearer: string;
  channelId: string;
  config: AdminAiChannelRow | null;
}) {
  const [state, setState] = useState<ConfigState>({
    aiEnabled: config?.aiEnabled ?? true,
    aiCommentsEnabled: config?.aiCommentsEnabled ?? true,
    autoReply: config?.autoReply ?? true,
    confidenceThreshold: config?.confidenceThreshold ?? '0.60',
    maxReplyLength: String(config?.maxReplyLength ?? 1000),
    tone: config?.tone ?? 'friendly',
    language: config?.language ?? 'auto',
    perChannelInstructions: config?.perChannelInstructions ?? '',
    leadQuestionsText: (config?.leadQuestions ?? []).join('\n'),
  });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const leadQuestions = state.leadQuestionsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await saveAdminAiChannelConfig(bearer, channelId, {
        aiEnabled: state.aiEnabled,
        aiCommentsEnabled: state.aiCommentsEnabled,
        autoReply: state.autoReply,
        confidenceThreshold: Number(state.confidenceThreshold),
        maxReplyLength: Number(state.maxReplyLength),
        tone: state.tone,
        language: state.language,
        perChannelInstructions: state.perChannelInstructions || null,
        leadQuestions,
      });
      setStatus('Saved — the next reply uses it.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'space-y-1 text-sm';

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={state.aiEnabled} onChange={(e) => setState((s) => ({ ...s, aiEnabled: e.target.checked }))} className="h-4 w-4" />
          AI replies (DMs)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={state.aiCommentsEnabled} onChange={(e) => setState((s) => ({ ...s, aiCommentsEnabled: e.target.checked }))} className="h-4 w-4" />
          AI replies to comments
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={state.autoReply} onChange={(e) => setState((s) => ({ ...s, autoReply: e.target.checked }))} className="h-4 w-4" />
          Auto-reply on new messages
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          <span>Confidence threshold (0–1)</span>
          <Input value={state.confidenceThreshold} onChange={(e) => setState((s) => ({ ...s, confidenceThreshold: e.target.value }))} />
        </label>
        <label className={label}>
          <span>Max reply length</span>
          <Input type="number" value={state.maxReplyLength} onChange={(e) => setState((s) => ({ ...s, maxReplyLength: e.target.value }))} />
        </label>
        <label className={label}>
          <span>Tone</span>
          <select value={state.tone} onChange={(e) => setState((s) => ({ ...s, tone: e.target.value }))} className="w-full rounded-md border border-border bg-card px-3 py-2">
            {TONES.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
          </select>
        </label>
      </div>

      <label className={label}>
        <span>Language</span>
        <select value={state.language} onChange={(e) => setState((s) => ({ ...s, language: e.target.value }))} className="w-full rounded-md border border-border bg-card px-3 py-2">
          {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span>Per-channel instructions (added verbatim to the system prompt)</span>
        <Textarea
          rows={4}
          value={state.perChannelInstructions}
          onChange={(e) => setState((s) => ({ ...s, perChannelInstructions: e.target.value }))}
          placeholder="Never quote prices without checking the catalog first. Drop shipping fee disputes to a human."
        />
      </label>

      <label className="space-y-1 text-sm">
        <span>Lead-qualification questions (one per line)</span>
        <Textarea
          rows={4}
          value={state.leadQuestionsText}
          onChange={(e) => setState((s) => ({ ...s, leadQuestionsText: e.target.value }))}
          placeholder={"What kind of project is it?\nWhat is your timeline?\nDo you want contact over phone or WhatsApp?"}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save channel config'}
        </Button>
        {status && <span className="text-sm text-muted-foreground">{status}</span>}
      </div>
    </Card>
  );
}
