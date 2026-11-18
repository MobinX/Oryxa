'use client';

import { useState, useTransition } from 'react';
import { Bot, FlaskConical, RotateCcw, Play, Braces } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { saveSubagentPromptAction } from '@/app/actions/subagent';
import { runProductInfoPreview, type ProductInfoPreview, type Subagent } from '@/lib/api';

/** `updateSubagentPromptInputSchema`'s cap, spelled here so a long paste fails in the browser, not as a 400. */
const PROMPT_LIMIT = 20_000;

type PreviewProduct = { id: string; name: string; sku: string };

/**
 * The prompt editor and its playground.
 *
 * The editor writes the row; the playground runs the draft that is currently in the box, saved or not.
 * That is deliberate: the useful question before a save is "what would this text answer?", and a
 * preview that could only run saved text would make every iteration two round trips.
 */
export function SubagentEditor({
  subagent,
  token,
  businessId,
  products,
}: {
  subagent: Subagent;
  token: string | null;
  businessId: string | null;
  products: PreviewProduct[];
}) {
  const [prompt, setPrompt] = useState(subagent.systemPrompt);
  const [savedPrompt, setSavedPrompt] = useState(subagent.systemPrompt);
  const [isSaving, startSaving] = useTransition();
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [question, setQuestion] = useState('Is this available, and how much is it?');
  const [isRunning, setIsRunning] = useState(false);
  const [preview, setPreview] = useState<ProductInfoPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const dirty = prompt.trim() !== savedPrompt.trim();

  function save() {
    const formData = new FormData();
    formData.set('key', subagent.key);
    formData.set('systemPrompt', prompt);
    startSaving(async () => {
      const result = await saveSubagentPromptAction(formData);
      if (result.ok) {
        setSavedPrompt(prompt);
        setNotice({ tone: 'ok', text: 'Saved. The next customer turn runs with this text.' });
      } else {
        setNotice({ tone: 'bad', text: result.error });
      }
    });
  }

  async function run() {
    if (!token || !businessId || !productId) return;
    setIsRunning(true);
    setPreviewError(null);
    try {
      const result = await runProductInfoPreview(token, businessId, {
        productId,
        userQuery: question,
        // An empty box is not a prompt; letting the API fall back to the stored text keeps the
        // preview honest instead of failing on a field the operator is mid-edit in.
        systemPrompt: prompt.trim() ? prompt : undefined,
      });
      setPreview(result);
    } catch (err) {
      setPreview(null);
      setPreviewError(err instanceof Error ? err.message : 'The preview failed.');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{subagent.name}</p>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{subagent.description}</p>
          </div>
          <span
            className={
              subagent.isDefault
                ? 'rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground'
                : 'rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary'
            }
          >
            {subagent.isDefault ? 'Reviewed default' : 'Customised'}
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="systemPrompt">
            System prompt
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Read from the <code>subagents</code> table on every tool call. Changing it here does not
            touch the sales agent’s prompt or any store’s.
          </p>
        </div>
        <Textarea
          id="systemPrompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={20}
          maxLength={PROMPT_LIMIT}
          spellCheck={false}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-[11px] text-muted-foreground">
          {prompt.length.toLocaleString()} characters, limit {PROMPT_LIMIT.toLocaleString()}
          {dirty ? ' · unsaved changes' : ''}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={isSaving || !prompt.trim()}>
            {isSaving ? 'Saving…' : 'Save prompt'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPrompt(subagent.defaultPrompt);
              setNotice(null);
            }}
            disabled={isSaving}
          >
            <RotateCcw className="mr-1.5 h-4 w-4" /> Restore reviewed default
          </Button>
          {notice ? (
            <p
              role={notice.tone === 'ok' ? 'status' : 'alert'}
              className={
                notice.tone === 'ok'
                  ? 'text-sm text-emerald-600 dark:text-emerald-400'
                  : 'text-sm text-destructive'
              }
            >
              {notice.text}
            </p>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Restoring only loads the reviewed text into the box; it is saved when you press Save prompt.
        </p>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40"
          >
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <p className="text-sm font-semibold">Test the prompt</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Runs the same writer the tool runs, against a real product in the sandbox store. It
              uses the text currently in the box, so an unsaved draft can be tried first. Previews
              are not written to the token ledger or the production log lane.
            </p>
          </div>
        </div>

        {!token || !businessId || products.length === 0 ? (
          <p className="rounded-element border border-dashed border-border/70 px-3 py-2.5 text-xs text-muted-foreground">
            {!token
              ? 'No operator account token in this session, so the sandbox cannot be reached.'
              : !businessId
                ? 'The operator’s sandbox store was not found, so there is no catalog to test against.'
                : 'The sandbox store has no products yet, so there is nothing to ask about.'}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" htmlFor="previewProduct">
                  Product
                </label>
                <Select
                  id="previewProduct"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {product.sku}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium" htmlFor="previewQuestion">
                  Customer question
                </label>
                <Input
                  id="previewQuestion"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  maxLength={1000}
                  placeholder="Is the red one cotton?"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={run}
                disabled={isRunning || !question.trim() || !productId}
              >
                <Play className="mr-1.5 h-4 w-4" />
                {isRunning ? 'Running…' : 'Run preview'}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Runs against <code>{dirty ? 'the text in the box (unsaved)' : 'the saved prompt'}</code>.
              </p>
            </div>

            {previewError ? (
              <p role="alert" className="text-sm text-destructive">
                {previewError}
              </p>
            ) : null}

            {preview ? (
              <div className="space-y-2 rounded-element border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Bot className="h-3.5 w-3.5" />
                  <span>{preview.provider}/{preview.model}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preview.totalTokens} tokens</span>
                  <span aria-hidden="true">·</span>
                  <span>~${preview.estimatedCostUsd}</span>
                  <span aria-hidden="true">·</span>
                  <span>{preview.latencyMs} ms</span>
                  <span aria-hidden="true">·</span>
                  <span>{preview.usedStoredPrompt || !dirty ? 'saved prompt' : 'draft prompt'}</span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
                  {preview.answer}
                </pre>
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Braces className="mt-0.5 h-3 w-3 shrink-0" />
                  This is exactly the text the sales agent relays, after the same plain-text cleanup.
                </p>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
