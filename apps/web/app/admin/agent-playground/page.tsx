import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { cachedBusinesses } from '@/app/_cache/queries';
import { PlaygroundClient } from '@/components/playground-client';
import { Card } from '@/components/ui/card';
import { FlaskConical, AlertTriangle } from 'lucide-react';

/**
 * Mirrors `ADMIN_SANDBOX_SLUG` in `packages/db/crud/business.ts`. Spelled out rather than
 * imported: this app's pages do not pull the database package into their bundle for a string.
 */
const SANDBOX_SLUG = 'oryxa-sandbox';

export const metadata = {
  title: 'Admin — agent playground',
  description: 'Try a system prompt against the sandbox store and watch the agent answer it.',
};

export default async function AdminAgentPlaygroundPage() {
  // The playground drives the merchant endpoints — sandbox channels, test conversations, the
  // agent row — so it needs the account's own token, not the console password. An operator who
  // only signed in at `/admin/login` is sent to sign in as the account that owns the sandbox.
  const token = await requireAuth();
  const { businesses } = await cachedBusinesses(token);
  const sandbox = businesses.find((business) => business.slug === SANDBOX_SLUG);

  if (!sandbox) {
    return (
      <div className="space-y-6">
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <FlaskConical className="h-6 w-6 text-primary" />
          Agent playground
        </h1>
        <Card className="border-amber-500/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            The sandbox store is not on this account
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The playground tests prompts against a store that really exists, with the catalog
            filled in, so the agent has something to sell — <code>{SANDBOX_SLUG}</code>, owned by
            whichever account ran <code>bun packages/db/scripts/seed-admin-sandbox.ts</code>. You
            are signed in as an account that does not own it.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with that account, or seed the sandbox: it creates the store, its default
            products and its agent, and touches nothing else.
          </p>
          <Link
            href="/admin"
            className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
          >
            ← Back to the platform dashboard
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/60 px-5 py-4 hover:shadow-card">
        <p className="text-sm font-semibold">
          Testing against <span className="font-mono text-primary">{SANDBOX_SLUG}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Saving a prompt here changes this sandbox store's agent only. The text every{' '}
          <em>new</em> store ships with lives in{' '}
          <code>packages/db/crud/default-agent.ts</code>, and editing it is a code change, not a
          keystroke — that is deliberate, because it cannot be undone for the stores already on it.
        </p>
      </Card>

      <PlaygroundClient token={token} businessId={sandbox.id} canEditPrompt />
    </div>
  );
}
