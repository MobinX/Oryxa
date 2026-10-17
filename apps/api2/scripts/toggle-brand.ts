/**
 * The brand swap from a terminal, for the moments before the button is trustworthy.
 *
 * Refuses to write anything unless `--apply` is present, so the default invocation rehearses: it
 * reads the live project, prints the names it found and the ones it would write, and stops. That
 * is the whole reason this exists next to the route — a swap that starts production builds of live
 * projects is not something to discover the shape of by running it.
 *
 *   bun apps/api2/scripts/toggle-brand.ts                 # what would change
 *   bun apps/api2/scripts/toggle-brand.ts --apply         # change it
 *   bun apps/api2/scripts/toggle-brand.ts --project=oryxa-web --api=oryxa-api2
 */
import { swapBrand, vercelPersonaKey, DEFAULT_WEB_PROJECT, DEFAULT_API_PROJECT } from '../lib/vercel-brand';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const named = argv.find((arg) => arg.startsWith('--project='));
const apiNamed = argv.find((arg) => arg.startsWith('--api='));

const token = vercelPersonaKey();
if (!token) {
  console.error('VERCEL_PERSONA_KEY is not set. Put it in the environment or in apps/api2/.env.');
  process.exit(1);
}

try {
  const result = await swapBrand({
    token,
    webProjectName: named?.slice('--project='.length) || process.env.VERCEL_WEB_PROJECT || DEFAULT_WEB_PROJECT,
    apiProjectName: apiNamed?.slice('--api='.length) || process.env.VERCEL_API_PROJECT || DEFAULT_API_PROJECT,
    dryRun: !apply,
  });

  console.log(
    JSON.stringify(
      {
        from: result.from,
        to: result.to,
        dryRun: result.dryRun,
        builds: result.builds.map((b) => ({
          project: b.project,
          redeployedFrom: b.redeployedFrom,
          deploymentId: b.deploymentId,
          readyState: b.readyState,
        })),
      },
      null,
      2,
    ),
  );
  if (!apply) console.log('\nNothing was written. Re-run with --apply to swap and build.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
