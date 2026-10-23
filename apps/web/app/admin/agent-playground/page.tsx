import Link from 'next/link';
import { requireOperatorToken } from '@/lib/admin-access';
import { cachedBusinesses } from '@/app/_cache/queries';
import { preloadPlayground } from '@/lib/playground-preload';
import { PlaygroundClient } from '@/components/playground-client';
import { operatorAccountEmail } from '@/lib/logs-session';
import { Card } from '@/components/ui/card';
import { AdminPageHeader } from '@/components/admin-page-header';
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

export const instant = false;

export default async function AdminAgentPlaygroundPage() {
  // The playground drives the merchant endpoints — sandbox channels, test conversations, the agent
  // row — so it needs an account token, not just a console session. That token is checked against
  // Google before it is used: it must belong to the operator account, because `create-operator.ts`
  // hands the sandbox store to that account and a stranger's token would answer "not seeded" while
  // quietly being a way to reach the merchant API through an admin page.
  const token = await requireOperatorToken();
  const { businesses } = await cachedBusinesses(token);
  const sandbox = businesses.find((business) => business.slug === SANDBOX_SLUG);

  if (!sandbox) {
    return (
      <div className="space-y-6">
        <AdminPageHeader icon={FlaskConical} title="Agent playground" />
        <Card className="border-amber-500/40 hover:shadow-card">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            The sandbox store is not on this account
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The playground tests prompts against a store that really exists, with the catalog
            filled in, so the agent has something to sell — <code>{SANDBOX_SLUG}</code>, owned by
            the operator account <code>{operatorAccountEmail()}</code>. Either that account does not
            own a sandbox store on this database, or you are signed in as somebody else.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Seed it with <code>seed-admin-sandbox.ts</code>, then hand it to the operator with{' '}
            <code>create-operator.ts</code>. Both only add and re-point, and both are re-runnable.
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
          Saving a prompt here changes this sandbox store's agent only — its own copy, and it stops
          following the default. The text every other store answers with is edited on{' '}
          <Link href="/admin/default-agent" className="font-medium text-primary underline-offset-4 hover:underline">
            Default agent
          </Link>
          , and it reaches them on the customer's next message.
        </p>
      </Card>

      <PlaygroundClient
        token={token}
        businessId={sandbox.id}
        // The console is the only reader of prompts, so it is the only page that asks the server to
        // read them: the prompt and both wording blocks arrive painted, not one browser call later.
        preload={await preloadPlayground(token, sandbox.id, { withAgent: true })}
        canEditPrompt
      />
    </div>
  );
}
