import { Bot } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import { adminGetOverrideReport, adminGetPlatformAgent } from '@/lib/api';
import { DefaultAgentForm } from './default-agent-form';
import { DefaultAgentOverrides } from './default-agent-overrides';

/**
 * The one agent every store answers with until it writes its own.
 *
 * This page exists because a store's row used to be a COPY of a code constant, taken when the store was
 * created — so editing that constant reached the stores coming next and never the ones replying to
 * customers now. Editing here reaches both, on the customer's next message.
 *
 * Not cached: it is the console's own text, read a handful of times, and a stale copy of a prompt an
 * operator just changed is the one thing this page must never show.
 */
export const instant = false;

export default async function DefaultAgentPage() {
  const bearer = await requireConsoleBearer();

  // The second read is the fleet's state, not this page's subject: if it fails the operator still gets
  // the editor, and the absence is said out loud rather than shown as "nobody opted out".
  const [agent, report] = await Promise.all([
    adminGetPlatformAgent(bearer).then(
      (row) => row,
      () => null,
    ),
    adminGetOverrideReport(bearer).then(
      (rows) => rows,
      () => null,
    ),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Bot className="h-6 w-6 text-primary" />
          Default agent
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The prompt and wording every store follows — until a store writes its own, which turns that one
          store into an override.
        </p>
      </div>

      {!agent ? (
        <Card className="border-amber-500/40">
          <p className="text-sm text-muted-foreground">
            The API would not answer, so nothing here is what your stores are replying with. Try again in a
            moment.
          </p>
        </Card>
      ) : (
        <DefaultAgentForm agent={agent} />
      )}

      {report ? <DefaultAgentOverrides report={report} /> : null}
      {!report && agent ? (
        <p className="text-xs text-muted-foreground">
          The API would not say which stores are answering with their own words, so that list is missing —
          not empty.
        </p>
      ) : null}
    </div>
  );
}
