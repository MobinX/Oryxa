/**
 * The re-brand, spoken to Vercel rather than to Postgres.
 *
 * `COMPANY_NAME` and `PARENT_COMPANY_NAME` are build-time inlined (`env` in apps/web/next.config.ts),
 * so a new value only reaches a customer once the web deployment has been built again — writing the
 * variables and leaving the deployment alone would change nothing a visitor could see. This module
 * therefore always does both halves: patch the two variables, then redeploy.
 *
 * The two names move together rather than independently, because they are one decision. "OnlyOrders"
 * is the same shop wearing its own name as the entity on the Terms page; "Oryxa" is a product of
 * RR Computer. A swap that changed one and not the other would leave the navbar naming a product
 * that the legal footer says belongs to somebody else.
 *
 * Nothing here is stored: the token is read from `VERCEL_PERSONA_KEY` per call, so a long-lived
 * credential never outlives the request that needed it.
 */

const VERCEL_API = 'https://api.vercel.com';

/** The variable a customer-facing name lives in, and the legal entity beside it. */
export type BrandEnvKey = 'COMPANY_NAME' | 'PARENT_COMPANY_NAME';

/** What a brand is called, in the two places a name is printed. */
export type BrandNames = Record<BrandEnvKey, string>;

/**
 * Where each product name sends both variables. Keyed by the name the web app is answering with
 * now, so the swap is a lookup rather than a chain of conditionals that has to stay in step with
 * itself in two directions.
 */
export const BRAND_SWAPS: Record<string, BrandNames> = {
  Oryxa: { COMPANY_NAME: 'OnlyOrders', PARENT_COMPANY_NAME: 'OnlyOrders' },
  OnlyOrders: { COMPANY_NAME: 'Oryxa', PARENT_COMPANY_NAME: 'RR Computer' },
};

/** The project the console re-brands when nothing names another. */
export const DEFAULT_BRAND_PROJECT = 'oryxa-web';

export class VercelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

/**
 * The env values a swap needs, with the Vercel id of the row each one is written to. `target` is
 * kept for the error text: a variable scoped to preview only would be patched happily and still
 * show the old name in production, which is the one outcome an operator would call a bug.
 */
export interface BrandEnvRows {
  companyId: string;
  parentId: string;
  from: BrandNames;
  targets: Record<BrandEnvKey, string[]>;
}

export interface BrandSwapResult {
  project: string;
  projectId: string;
  from: BrandNames;
  to: BrandNames;
  redeployedFrom: string;
  deploymentId: string;
  /** A real swap names the build it started; a rehearsal names the production build it would replace. */
  deploymentUrl: string;
  readyState: string;
  /** True when the variables were not written and no build was started, because the caller asked for a rehearsal. */
  dryRun: boolean;
}

export interface BrandSwapOptions {
  token: string;
  projectName?: string;
  /** Reports what would change and stops, which is the only safe way to point this at a live project. */
  dryRun?: boolean;
}

function brandProjectName(): string {
  return process.env.VERCEL_WEB_PROJECT?.trim() || DEFAULT_BRAND_PROJECT;
}

/** The token, or nothing. Every caller is a route a person pressed, so a missing key is a setup gap and must say so. */
export function vercelPersonaKey(): string | undefined {
  return process.env.VERCEL_PERSONA_KEY?.trim() || undefined;
}

async function vercel<T = Record<string, unknown>>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${VERCEL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (body.error ?? {}) as { code?: string; message?: string };
    throw new VercelApiError(
      `Vercel ${res.status} on ${init.method ?? 'GET'} ${path.split('?')[0]}: ${err.message ?? err.code ?? 'unknown error'}`,
      res.status,
    );
  }
  return body as T;
}

/**
 * Looks the project up by name. The direct read is the common path; the list is the fallback for a
 * token whose team is not its default, where Vercel resolves a slug only inside a team scope.
 */
export async function findBrandProject(
  token: string,
  projectName: string,
): Promise<{ id: string; name: string }> {
  const direct = await vercel<{ id?: string; name?: string }>(
    token,
    `/v9/projects/${encodeURIComponent(projectName)}`,
  ).catch(() => null);
  if (direct?.id) return { id: direct.id, name: direct.name ?? projectName };

  const listed = await vercel<{ projects?: { id: string; name: string }[] }>(
    token,
    '/v9/projects?limit=100',
  );
  const found = (listed.projects ?? []).find((p) => p.name === projectName);
  if (!found) throw new VercelApiError(`No Vercel project named "${projectName}"`, 404);
  return found;
}

/**
 * Reads the two brand variables. A missing row is an error rather than a licence to create one:
 * `COMPANY_NAME` absent means the deployment is answering with the fallback in lib/brand.ts, and
 * silently adding the variable would change the name on the next build of every environment.
 */
export async function readBrandEnv(token: string, projectId: string): Promise<BrandEnvRows> {
  const rows = await vercel<{
    envs?: { id: string; key: string; value?: string; type?: string; target?: string[] }[];
  }>(token, `/v9/projects/${projectId}/env?decrypt=true`);

  const byKey = new Map((rows.envs ?? []).map((e) => [e.key, e]));
  const company = byKey.get('COMPANY_NAME');
  const parent = byKey.get('PARENT_COMPANY_NAME');
  if (!company?.id || !parent?.id) {
    const absent = [!company?.id && 'COMPANY_NAME', !parent?.id && 'PARENT_COMPANY_NAME'].filter(Boolean);
    throw new VercelApiError(`The Vercel project has no ${absent.join(' or ')} variable`, 404);
  }
  // A `sensitive` row never returns its value, so the current name is unknown and the direction of
  // the swap cannot be chosen. Converting the row is the operator's call, not a guess made here.
  if (typeof company.value !== 'string' || typeof parent.value !== 'string') {
    throw new VercelApiError('The brand variables are stored as secrets, so their current values cannot be read', 409);
  }

  return {
    companyId: company.id,
    parentId: parent.id,
    from: { COMPANY_NAME: company.value, PARENT_COMPANY_NAME: parent.value },
    targets: { COMPANY_NAME: company.target ?? [], PARENT_COMPANY_NAME: parent.target ?? [] },
  };
}

/**
 * Writes one variable. Only `production` is sent in the swap when the row is not scoped to it —
 * `target` is a replacement, not an addition, so a row that lives on preview and production must
 * not come back preview-only after the write.
 */
async function writeBrandEnv(
  token: string,
  projectId: string,
  envId: string,
  value: string,
  target: string[],
): Promise<void> {
  await vercel(token, `/v9/projects/${projectId}/env/${envId}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, target }),
  });
}

/** The deployment a redeploy copies its settings from — the one customers are on. */
export async function latestProductionDeployment(
  token: string,
  projectId: string,
): Promise<{ uid: string; url: string }> {
  const list = await vercel<{
    deployments?: { uid: string; url: string; target?: string; readyState?: string }[];
  }>(token, `/v6/deployments?projectId=${projectId}&target=production&limit=1`);

  const found = (list.deployments ?? [])[0];
  if (!found?.uid) throw new VercelApiError('The project has no production deployment to redeploy', 404);
  return { uid: found.uid, url: found.url };
}

/**
 * Starts a fresh production build from the same deployment. `forceNew` matters: a redeploy of an
 * unchanged git revision is exactly what Vercel's deduplication recognises, and a 200 that joins an
 * existing build would leave the old name serving traffic while this route reports success.
 */
export async function redeployProduction(
  token: string,
  projectName: string,
  deploymentId: string,
): Promise<{ id: string; url: string; readyState: string }> {
  const created = await vercel<{ id?: string; uid?: string; url?: string; readyState?: string }>(
    token,
    '/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1',
    {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        project: projectName,
        deploymentId,
        target: 'production',
      }),
    },
  );

  const id = created.id ?? created.uid;
  if (!id) throw new VercelApiError('Vercel accepted the redeploy but returned no deployment id', 502);
  return { id, url: created.url ?? '', readyState: created.readyState ?? 'QUEUED' };
}

/** The name a swap starts from, or the error that says what the project is actually called. */
export function brandSwapTarget(from: BrandNames): BrandNames {
  const next = BRAND_SWAPS[from.COMPANY_NAME];
  if (!next) {
    throw new VercelApiError(
      `COMPANY_NAME is "${from.COMPANY_NAME}", which is not a brand this swap knows how to leave`,
      409,
    );
  }
  return next;
}

/**
 * Reads the live brand, writes the other one, and rebuilds what serves it. Everything before the
 * first write is read-only, so a rehearsal and a real swap share the whole path up to the point
 * where a person decided to press the button.
 */
export async function swapBrand(options: BrandSwapOptions): Promise<BrandSwapResult> {
  const projectName = options.projectName?.trim() || brandProjectName();
  const token = options.token;

  const project = await findBrandProject(token, projectName);
  const env = await readBrandEnv(token, project.id);
  const to = brandSwapTarget(env.from);
  const source = await latestProductionDeployment(token, project.id);

  if (options.dryRun) {
    return {
      project: project.name,
      projectId: project.id,
      from: env.from,
      to,
      redeployedFrom: source.uid,
      deploymentId: '(not created — dry run)',
      deploymentUrl: source.url,
      readyState: 'DRY_RUN',
      dryRun: true,
    };
  }

  await writeBrandEnv(token, project.id, env.companyId, to.COMPANY_NAME, env.targets.COMPANY_NAME);
  await writeBrandEnv(token, project.id, env.parentId, to.PARENT_COMPANY_NAME, env.targets.PARENT_COMPANY_NAME);

  const created = await redeployProduction(token, project.name, source.uid);

  return {
    project: project.name,
    projectId: project.id,
    from: env.from,
    to,
    redeployedFrom: source.uid,
    deploymentId: created.id,
    deploymentUrl: created.url,
    readyState: created.readyState,
    dryRun: false,
  };
}
