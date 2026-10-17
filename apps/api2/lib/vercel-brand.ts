/**
 * The re-brand, spoken to Vercel rather than to Postgres.
 *
 * `COMPANY_NAME` and `PARENT_COMPANY_NAME` are build-time inlined (`env` in apps/web/next.config.ts),
 * and `WEB_URL` names the storefront the API links back to, so a new value only reaches a customer
 * once the deployment has been built again — writing the variables and leaving the deployments alone
 * would change nothing a visitor could see. A swap therefore always does both halves: patch the
 * variables, then redeploy both projects.
 *
 * The names move together rather than independently, because they are one decision. "OnlyOrders"
 * is the same shop wearing its own name as the entity on the Terms page and its own domain; "Oryxa"
 * is a product of RR Computer on a subdomain of theirs. A swap that changed the name and not the
 * domain would leave a page calling itself OnlyOrders while linking customers to the old address.
 *
 * The direction is read from `COMPANY_NAME` on the web project, which is the one variable whose
 * value Vercel returns. `WEB_URL` is stored encrypted and cannot be read back, so it is written
 * from the map alone — which is also why the map, not the project, is the record of what a brand
 * is called.
 *
 * Nothing here is stored: the token is read from `VERCEL_PERSONA_KEY` per call, so a long-lived
 * credential never outlives the request that needed it.
 */

const VERCEL_API = 'https://api.vercel.com';

/** The variable a customer-facing name lives in, the legal entity beside it, and the domain the API links to. */
export type BrandEnvKey = 'COMPANY_NAME' | 'PARENT_COMPANY_NAME' | 'WEB_URL';

/** What a brand is called, in every place a name or an address is printed. */
export type Brand = Record<BrandEnvKey, string>;

/**
 * Where each product name sends all three variables. Keyed by the name the web app is answering
 * with now, so the swap is a lookup rather than a chain of conditionals that has to stay in step
 * with itself in two directions.
 */
export const BRAND_SWAPS: Record<string, Brand> = {
  Oryxa: {
    COMPANY_NAME: 'OnlyOrders',
    PARENT_COMPANY_NAME: 'OnlyOrders',
    WEB_URL: 'https://www.onlyorders.tech/',
  },
  OnlyOrders: {
    COMPANY_NAME: 'Oryxa',
    PARENT_COMPANY_NAME: 'RR Computer',
    WEB_URL: 'https://oryxa.rrcomputer.com.bd/',
  },
};

/** The project whose name decides the direction, and the one whose links follow it. */
export const DEFAULT_WEB_PROJECT = 'oryxa-web';
export const DEFAULT_API_PROJECT = 'oryxa-api2';

export class VercelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VercelApiError';
  }
}

/** One env row as Vercel holds it: where to write, and — for a plain row — what it says. */
export interface EnvRow {
  id: string;
  target: string[];
  /** Absent on `sensitive` and `encrypted` rows, which Vercel never returns. */
  value?: string;
}

/** The env values a swap writes, with the Vercel id of the row each one is written to. */
export type BrandEnvRows = Record<BrandEnvKey, EnvRow>;

export interface ProjectBuild {
  project: string;
  projectId: string;
  redeployedFrom: string;
  deploymentId: string;
  deploymentUrl: string;
  readyState: string;
}

export interface BrandSwapResult {
  from: Brand;
  to: Brand;
  builds: ProjectBuild[];
  /** True when the variables were not written and no build was started, because the caller asked for a rehearsal. */
  dryRun: boolean;
}

export interface BrandSwapOptions {
  token: string;
  webProjectName?: string;
  apiProjectName?: string;
  /** Reports what would change and stops, which is the only safe way to point this at a live project. */
  dryRun?: boolean;
}

function vercelWebProject(): string {
  return process.env.VERCEL_WEB_PROJECT?.trim() || DEFAULT_WEB_PROJECT;
}

function vercelApiProject(): string {
  return process.env.VERCEL_API_PROJECT?.trim() || DEFAULT_API_PROJECT;
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
 * Looks a project up by name. The direct read is the common path; the list is the fallback for a
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
 * Reads the rows a swap writes. A missing row is an error rather than a licence to create one: a
 * variable that is not there means the deployment is answering with a fallback in code, and silently
 * adding it would change a name on the next build of every environment. An unreadable value is fine
 * here — only `COMPANY_NAME` is ever read, and the caller asks for that itself.
 */
export async function readEnvRows(
  token: string,
  projectId: string,
  keys: BrandEnvKey[],
): Promise<BrandEnvRows> {
  const rows = await vercel<{
    envs?: { id: string; key: string; value?: string; target?: string[] }[];
  }>(token, `/v9/projects/${projectId}/env?decrypt=true`);

  const byKey = new Map((rows.envs ?? []).map((e) => [e.key, e]));
  const picked = {} as BrandEnvRows;
  const absent: string[] = [];

  for (const key of keys) {
    const row = byKey.get(key);
    if (!row?.id) {
      absent.push(key);
      continue;
    }
    picked[key] = { id: row.id, target: row.target ?? [], value: row.value };
  }

  if (absent.length) {
    throw new VercelApiError(`A brand project has no ${absent.join(' or ')} variable`, 404);
  }
  return picked;
}

/**
 * Writes one variable. `target` is sent back unchanged, because it is a replacement and not an
 * addition: a row scoped to preview and production must not come back preview-only after a write
 * that only meant to change a value.
 */
export async function writeEnvRow(
  token: string,
  projectId: string,
  row: EnvRow,
  value: string,
): Promise<void> {
  await vercel(token, `/v9/projects/${projectId}/env/${row.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, target: row.target }),
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

/** The brand a swap starts from, or the error that says what the project is actually called. */
export function brandSwapTarget(currentProductName: string): Brand {
  const next = BRAND_SWAPS[currentProductName];
  if (!next) {
    throw new VercelApiError(
      `COMPANY_NAME is "${currentProductName}", which is not a brand this swap knows how to leave`,
      409,
    );
  }
  return next;
}

async function redeployOne(
  token: string,
  project: { id: string; name: string },
  live: { uid: string; url: string },
): Promise<ProjectBuild> {
  const created = await redeployProduction(token, project.name, live.uid);
  return {
    project: project.name,
    projectId: project.id,
    redeployedFrom: live.uid,
    deploymentId: created.id,
    deploymentUrl: created.url,
    readyState: created.readyState,
  };
}

/**
 * Reads the live brand, writes the other one, and rebuilds both projects that serve it. Everything
 * before the first write is read-only, so a rehearsal and a real swap share the whole path up to
 * the point where a person decided to press the button.
 *
 * The two builds are started back to back, so neither project is left serving a name the other has
 * already dropped: the web project's variables are written, then the API's link, then both rebuild.
 */
export async function swapBrand(options: BrandSwapOptions): Promise<BrandSwapResult> {
  const token = options.token;
  const webName = options.webProjectName?.trim() || vercelWebProject();
  const apiName = options.apiProjectName?.trim() || vercelApiProject();

  const web = await findBrandProject(token, webName);
  const api = await findBrandProject(token, apiName);

  const webRows = await readEnvRows(token, web.id, ['COMPANY_NAME', 'PARENT_COMPANY_NAME']);
  // The one value the direction is decided by. It has to be readable: guessing a direction would
  // rename the site to what it may already be called.
  const currentName = webRows.COMPANY_NAME.value;
  if (typeof currentName !== 'string') {
    throw new VercelApiError('COMPANY_NAME is stored as a secret, so its current value cannot be read', 409);
  }
  const to = brandSwapTarget(currentName);
  // `WEB_URL` cannot be read back (encrypted), so where the swap leaves from is said by the map.
  const from: Brand = { ...BRAND_SWAPS[to.COMPANY_NAME], COMPANY_NAME: currentName };

  const apiRows = await readEnvRows(token, api.id, ['WEB_URL']);
  const webLive = await latestProductionDeployment(token, web.id);
  const apiLive = await latestProductionDeployment(token, api.id);

  if (options.dryRun) {
    return {
      from,
      to,
      builds: [
        { project: web.name, projectId: web.id, redeployedFrom: webLive.uid, deploymentId: '(not created — dry run)', deploymentUrl: webLive.url, readyState: 'DRY_RUN' },
        { project: api.name, projectId: api.id, redeployedFrom: apiLive.uid, deploymentId: '(not created — dry run)', deploymentUrl: apiLive.url, readyState: 'DRY_RUN' },
      ],
      dryRun: true,
    };
  }

  await writeEnvRow(token, web.id, webRows.COMPANY_NAME, to.COMPANY_NAME);
  await writeEnvRow(token, web.id, webRows.PARENT_COMPANY_NAME, to.PARENT_COMPANY_NAME);
  await writeEnvRow(token, api.id, apiRows.WEB_URL, to.WEB_URL);

  const builds = [
    await redeployOne(token, web, webLive),
    await redeployOne(token, api, apiLive),
  ];

  return { from, to, builds, dryRun: false };
}
