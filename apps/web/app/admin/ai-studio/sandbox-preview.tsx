'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { previewAdminAi, type AdminAiPreview } from '@/lib/api';

/** Spec B sandbox: show exactly what the AI would see before the channel is switched on. */
export function SandboxPreview({ bearer, channelId }: { bearer: string; channelId: string }) {
  const [preview, setPreview] = useState<AdminAiPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewAdminAi(bearer, channelId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setLoading(false);
    }
  };

  const emptySections = preview
    ? preview.block
        .split(/\n(?=## )/)
        .map((part) => {
          const lines = part.split('\n');
          return lines[0].replace(/^##\s*/, '') && lines.slice(1).every((line) => line.trim() === '')
            ? lines[0].replace(/^##\s*/, '')
            : null;
        })
        .filter((title): title is string => Boolean(title))
    : [];

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Sandbox preview</h2>
          <p className="text-sm text-muted-foreground">
            The context block the next customer message would get. Nothing is sent and no AI run
            happens — this is a dry look before going live.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Show what the AI will see'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            AI{' '}
            <span className={preview.aiEnabled ? 'text-foreground font-medium' : 'text-destructive font-medium'}>
              {preview.aiEnabled ? 'on' : 'off — nothing will answer'}
            </span>
            {', '}
            auto-reply {preview.autoReply ? 'on' : 'off'}, threshold {preview.confidenceThreshold},
            tone {preview.tone}, language {preview.language}
            {preview.lead ? `, lead in context: ${preview.lead.name ?? 'unnamed'} (${preview.lead.status})` : ''}
          </p>
          {emptySections.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Empty sections (the AI will say it does not know rather than invent):{' '}
              {emptySections.join(', ')}
            </p>
          )}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border/50 bg-muted/40 p-3 text-xs">
            {preview.block}
          </pre>
        </div>
      )}
    </Card>
  );
}
