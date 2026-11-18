import Link from 'next/link';
import { Bot, FlaskConical, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { AdminPageHeader } from '@/components/admin-page-header';
import { requireConsoleBearer, operatorToken } from '@/lib/admin-access';
import { adminGetSubagent, listProducts, type ProductListItem } from '@/lib/api';
import { cachedBusinesses } from '@/app/_cache/queries';
import { SubagentEditor } from './subagent-editor';

/**
 * Mirrors `ADMIN_SANDBOX_SLUG` in `packages/db/crud/business.ts`, same as the agent playground: a page
 * does not pull the database package in for one string.
 */
const SANDBOX_SLUG = 'oryxa-sandbox';

/** The helper this page owns. One key today; the list API already takes a key so a second costs nothing. */
const SUBAGENT_KEY = 'product_info';

export const metadata = {
  title: 'Admin — subagent prompts',
  description: 'Edit the hidden helper agents’ instructions and test the product-answer writer.',
};

/** The prompt an operator just saved must never be shown from a stale render. */
export const instant = false;

export default async function AdminSubagentPage() {
  const bearer = await requireConsoleBearer();

  // The editor is the page's subject; the playground is a convenience. They are read independently so
  // a sandbox problem cannot take the prompt editor away, and vice versa.
  const [subagent, token] = await Promise.all([
    adminGetSubagent(bearer, SUBAGENT_KEY).then(
      (row) => row,
      () => null,
    ),
    operatorToken().catch(() => null),
  ]);

  let businessId: string | null = null;
  let products: ProductListItem[] = [];
  if (token) {
    const { businesses } = await cachedBusinesses(token);
    const sandbox = businesses.find((business) => business.slug === SANDBOX_SLUG);
    if (sandbox) {
      businessId = sandbox.id;
      products = await listProducts(token, sandbox.id, { limit: 100 }).then(
        (result) => result.products,
        () => [],
      );
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Bot}
        title="Subagent prompts"
        description="The helper agents a tool runs mid-turn. Their text is stored in the database and read on every call, so an edit reaches the next customer message without a deploy."
      />

      {!subagent ? (
        <Card className="border-amber-500/40">
          <p role="alert" className="text-sm text-muted-foreground">
            The API would not return the prompt, so nothing on this page is what customers are being
            answered with. Try again in a moment.
          </p>
        </Card>
      ) : (
        <SubagentEditor
          subagent={subagent}
          token={token}
          businessId={businessId}
          products={products.map((product) => ({ id: product.id, name: product.name, sku: product.sku }))}
        />
      )}

      {subagent && !businessId ? (
        <Card className="border-amber-500/40">
          <p role="note" className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            The playground needs the operator’s sandbox store
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Testing runs against real catalog rows in <code>{SANDBOX_SLUG}</code>, owned by the
            operator account. The editor above still saves without it. Seed the sandbox with{' '}
            <code>seed-admin-sandbox.ts</code> and hand it to the operator with{' '}
            <code>create-operator.ts</code> to enable the test pane.
          </p>
          <Link
            href="/admin/agent-playground"
            className="mt-3 inline-flex items-center gap-1.5 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Open the agent playground
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
