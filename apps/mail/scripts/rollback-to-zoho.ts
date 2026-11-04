#!/usr/bin/env bun
/**
 * Roll back onlyorders.tech inbound mail from Cloudflare Email Routing to Zoho.
 *
 * What it does (with --apply):
 *   1. Removes routing rules and the catch-all that target the mail Worker.
 *   2. Disables Cloudflare Email Routing and unlocks its DNS records.
 *   3. Deletes any remaining route*.mx.cloudflare.net MX records.
 *   4. Restores the Zoho MX records.
 *   5. Restores the pre-cutover SPF TXT exactly when a snapshot exists; otherwise
 *      strips include:_spf.mx.cloudflare.net and keeps every other include.
 *
 * It never touches Zoho verification TXT records, Zoho DKIM, DMARC, Brevo/Sender
 * records, or unrelated DNS records.
 *
 * Usage:
 *   bun apps/mail/scripts/rollback-to-zoho.ts --capture
 *     Local-only: write apps/mail/.rollback-snapshot.json (MX, SPF, rules, settings).
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
 *     bun apps/mail/scripts/rollback-to-zoho.ts
 *     Dry-run: print the exact changes without touching Cloudflare.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... \
 *     bun apps/mail/scripts/rollback-to-zoho.ts --apply
 *     Perform the rollback.
 *
 * Optional env:
 *   ROLLBACK_SNAPSHOT=/path/to/snapshot.json
 *   MAIL_WORKER_NAME=onlyorders-mail
 *
 * No credentials are stored in this file. The API token is read from the environment.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.cloudflare.com/client/v4";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = process.env.ROLLBACK_SNAPSHOT
  ? resolve(process.env.ROLLBACK_SNAPSHOT)
  : resolve(SCRIPT_DIR, "../.rollback-snapshot.json");
const TOKEN = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
const ZONE_ID = (process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID || "").trim();
const WORKER_NAME = process.env.MAIL_WORKER_NAME || "onlyorders-mail";
const APPLY = process.argv.includes("--apply");
const CAPTURE = process.argv.includes("--capture");

const ZOHO_MX = [
  { content: "mx.zoho.com", priority: 10, ttl: 3600 },
  { content: "mx2.zoho.com", priority: 20, ttl: 3600 },
  { content: "mx3.zoho.com", priority: 50, ttl: 3600 },
];

interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  priority?: number;
  ttl?: number;
  proxied?: boolean;
}

interface RoutingAction {
  type: "drop" | "forward" | "worker";
  value?: string[];
}

interface RoutingRule {
  id?: string;
  name?: string;
  enabled?: boolean;
  matchers?: Array<{ type: string; field?: string; value?: string }>;
  actions?: RoutingAction[];
  priority?: number;
  source?: string;
  tag?: string;
}

interface Snapshot {
  captured_at: string;
  zone_id: string;
  zone_name: string;
  routing: Record<string, unknown>;
  rules: RoutingRule[];
  catch_all: RoutingRule | null;
  mx: DnsRecord[];
  spf: DnsRecord | null;
  dns_records: DnsRecord[];
}

function requireEnv(): void {
  if (!TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is required");
  if (!ZONE_ID) throw new Error("CLOUDFLARE_ZONE_ID (or CF_ZONE_ID) is required");
}

async function cf<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    result?: T;
    errors?: unknown;
    messages?: unknown;
  };
  if (!response.ok || body.success === false) {
    throw new Error(
      `${init.method || "GET"} ${path} failed (${response.status}): ${JSON.stringify(body.errors || body.messages || body).slice(0, 600)}`,
    );
  }
  return body.result as T;
}

async function getRecords(type?: string): Promise<DnsRecord[]> {
  const query = type ? `?type=${encodeURIComponent(type)}&per_page=100` : "?per_page=100";
  return await cf<DnsRecord[]>(`/zones/${ZONE_ID}/dns_records${query}`);
}

async function getSettings(): Promise<Record<string, unknown>> {
  return await cf<Record<string, unknown>>(`/zones/${ZONE_ID}/email/routing`);
}

async function getRules(): Promise<RoutingRule[]> {
  return await cf<RoutingRule[]>(`/zones/${ZONE_ID}/email/routing/rules?per_page=100`);
}

async function getCatchAll(): Promise<RoutingRule | null> {
  try {
    return await cf<RoutingRule>(`/zones/${ZONE_ID}/email/routing/rules/catch_all`);
  } catch {
    return null;
  }
}

function unquote(value: string): string {
  return value.trim().replace(/^"(.*)"$/s, "$1");
}

function isCloudflareMx(content: string): boolean {
  return /(^|\.)mx\.cloudflare\.net$/i.test(content.trim());
}

function isZohoMx(content: string): boolean {
  return /zoho\./i.test(content.trim());
}

function targetsWorker(value: RoutingAction[] | undefined): boolean {
  return Boolean(
    value?.some(
      (action) =>
        action.type === "worker" && (action.value || []).some((name) => name === WORKER_NAME),
    ),
  );
}

function snapshotPayload(
  zoneName: string,
  routing: Record<string, unknown>,
  rules: RoutingRule[],
  catchAll: RoutingRule | null,
  records: DnsRecord[],
): Snapshot {
  return {
    captured_at: new Date().toISOString(),
    zone_id: ZONE_ID,
    zone_name: zoneName,
    routing,
    rules,
    catch_all: catchAll,
    mx: records.filter((record) => record.type === "MX" && record.name === zoneName),
    spf:
      records.find(
        (record) =>
          record.type === "TXT" &&
          record.name === zoneName &&
          unquote(record.content).toLowerCase().startsWith("v=spf1"),
      ) || null,
    dns_records: records,
  };
}

async function capture(): Promise<void> {
  requireEnv();
  const zone = await cf<{ id: string; name: string }>(`/zones/${ZONE_ID}`);
  const [routing, rules, catchAll, records] = await Promise.all([
    getSettings(),
    getRules(),
    getCatchAll(),
    getRecords(),
  ]);
  const snapshot = snapshotPayload(zone.name, routing, rules, catchAll, records);
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  chmodSync(SNAPSHOT_PATH, 0o600);
  console.log(`Snapshot written: ${SNAPSHOT_PATH}`);
  console.log(
    `Zone: ${zone.name} (${zone.id}); MX=${snapshot.mx.length}; SPF=${snapshot.spf ? "captured" : "missing"}; rules=${rules.length}`,
  );
}

function loadSnapshot(): Snapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  if (snapshot.zone_id && snapshot.zone_id !== ZONE_ID) {
    throw new Error(
      `Snapshot belongs to zone ${snapshot.zone_id}, not ${ZONE_ID}. Refusing to use it.`,
    );
  }
  return snapshot;
}

function targetSpf(snapshot: Snapshot | null, current: DnsRecord | null): string | null {
  if (snapshot?.spf) return unquote(snapshot.spf.content);
  if (!current) return null;
  const value = unquote(current.content);
  if (!/include:_spf\.mx\.cloudflare\.net/i.test(value)) return null;
  return value
    .replace(/\s*include:_spf\.mx\.cloudflare\.net\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function printManualFallback(zoneName: string): void {
  console.log("\nManual fallback if the API is unavailable:");
  console.log(`  Zone: ${zoneName}`);
  console.log("  Delete MX: route1.mx.cloudflare.net, route2.mx.cloudflare.net, route3.mx.cloudflare.net");
  console.log("  Add MX:    mx.zoho.com (10), mx2.zoho.com (20), mx3.zoho.com (50)");
  console.log("  SPF TXT:   restore the pre-cutover v=spf1 record, removing include:_spf.mx.cloudflare.net");
  console.log("  Then disable Email Routing in Cloudflare Dashboard > Email Service > Email Routing.");
}

async function run(): Promise<void> {
  requireEnv();
  const zone = await cf<{ id: string; name: string }>(`/zones/${ZONE_ID}`);
  const snapshot = loadSnapshot();
  const [settings, rules, catchAll, records] = await Promise.all([
    getSettings(),
    getRules(),
    getCatchAll(),
    getRecords(),
  ]);
  const mx = records.filter((record) => record.type === "MX" && record.name === zone.name);
  const cloudflareMx = mx.filter((record) => isCloudflareMx(record.content));
  const currentSpf =
    records.find(
      (record) =>
        record.type === "TXT" &&
        record.name === zone.name &&
        unquote(record.content).toLowerCase().startsWith("v=spf1"),
    ) || null;
  const spfTarget = targetSpf(snapshot, currentSpf);
  const zohoTarget =
    snapshot?.mx.filter((record) => isZohoMx(record.content)).map((record) => ({
      content: record.content,
      priority: record.priority ?? 10,
      ttl: record.ttl ?? 3600,
    })) || [];
  const targetMx = zohoTarget.length ? zohoTarget : ZOHO_MX;
  // The catch-all is also returned by the rules list; reset it separately below.
  const workerRules = rules.filter(
    (rule) =>
      rule.id !== catchAll?.id &&
      (targetsWorker(rule.actions) || rule.name === "OnlyOrders mail worker"),
  );
  const catchAllWorker = Boolean(catchAll && targetsWorker(catchAll.actions));

  console.log(`Zone: ${zone.name} (${zone.id})`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (add --apply to execute)"}`);
  console.log(`Snapshot: ${snapshot ? SNAPSHOT_PATH : "not found (using Zoho defaults)"}`);
  console.log(
    `Email Routing: enabled=${String(settings.enabled)} status=${String(settings.status ?? "unknown")}`,
  );
  console.log(`Cloudflare MX to remove: ${cloudflareMx.map((record) => record.content).join(", ") || "none"}`);
  console.log(
    `Zoho MX to restore: ${targetMx.map((record) => `${record.content}:${record.priority}`).join(", ")}`,
  );
  console.log(
    `SPF: ${currentSpf ? unquote(currentSpf.content) : "(none)"} -> ${spfTarget ?? "(unchanged)"}`,
  );
  console.log(
    `Worker rules to remove: ${workerRules.map((rule) => rule.name || rule.id).join(", ") || "none"}`,
  );
  console.log(`Catch-all targets worker: ${catchAllWorker ? "yes" : "no"}`);

  if (!APPLY) {
    console.log("\nNo changes applied. Re-run with --apply to roll back to Zoho.");
    printManualFallback(zone.name);
    return;
  }

  for (const rule of workerRules) {
    if (!rule.id) continue;
    await cf(`/zones/${ZONE_ID}/email/routing/rules/${rule.id}`, { method: "DELETE" });
    console.log(`Deleted routing rule: ${rule.name || rule.id}`);
  }

  if (catchAllWorker) {
    const original = snapshot?.catch_all;
    const body =
      original && !targetsWorker(original.actions)
        ? {
            actions: original.actions,
            matchers: original.matchers || [{ type: "all" }],
            enabled: original.enabled ?? false,
            name: original.name || "Catch-all",
            source: "api",
          }
        : {
            actions: [{ type: "drop" }],
            matchers: [{ type: "all" }],
            enabled: false,
            name: "Catch-all",
            source: "api",
          };
    await cf(`/zones/${ZONE_ID}/email/routing/rules/catch_all`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    console.log("Reset catch-all rule");
  }

  if (Boolean(settings.enabled) || cloudflareMx.length > 0) {
    try {
      await cf(`/zones/${ZONE_ID}/email/routing/dns`, { method: "DELETE" });
      console.log("Email Routing disabled via DELETE /email/routing/dns");
    } catch (error) {
      console.warn(`Primary disable failed: ${error instanceof Error ? error.message : String(error)}`);
      await cf(`/zones/${ZONE_ID}/email/routing/disable`, { method: "POST" });
      console.log("Email Routing disabled via deprecated /email/routing/disable");
    }
  }

  const remaining = await getRecords("MX");
  for (const record of remaining.filter(
    (item) => item.name === zone.name && isCloudflareMx(item.content),
  )) {
    await cf(`/zones/${ZONE_ID}/dns_records/${record.id}`, { method: "DELETE" });
    console.log(`Deleted leftover Cloudflare MX: ${record.content}`);
  }

  const afterMx = (await getRecords("MX")).filter((record) => record.name === zone.name);
  for (const wanted of targetMx) {
    const existing = afterMx.find(
      (record) => record.content.toLowerCase() === wanted.content.toLowerCase(),
    );
    const payload = {
      type: "MX",
      name: zone.name,
      content: wanted.content,
      priority: wanted.priority,
      ttl: wanted.ttl,
      proxied: false,
    };
    if (existing) {
      if (existing.priority !== wanted.priority || (existing.ttl ?? 0) !== wanted.ttl) {
        await cf(`/zones/${ZONE_ID}/dns_records/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        console.log(`Updated MX: ${wanted.content}:${wanted.priority}`);
      } else {
        console.log(`MX already present: ${wanted.content}:${wanted.priority}`);
      }
    } else {
      await cf(`/zones/${ZONE_ID}/dns_records`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log(`Created MX: ${wanted.content}:${wanted.priority}`);
    }
  }

  if (spfTarget) {
    const latest = (await getRecords("TXT")).find(
      (record) =>
        record.name === zone.name &&
        unquote(record.content).toLowerCase().startsWith("v=spf1"),
    );
    if (!latest || unquote(latest.content) !== spfTarget) {
      const payload = {
        type: "TXT",
        name: zone.name,
        content: spfTarget,
        ttl: 3600,
      };
      await cf(
        latest
          ? `/zones/${ZONE_ID}/dns_records/${latest.id}`
          : `/zones/${ZONE_ID}/dns_records`,
        {
          method: latest ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      );
      console.log(`SPF restored: ${spfTarget}`);
    } else {
      console.log("SPF already restored");
    }
  }

  const [finalSettings, finalMx, finalRules, finalCatchAll, finalTxt] = await Promise.all([
    getSettings(),
    getRecords("MX"),
    getRules(),
    getCatchAll(),
    getRecords("TXT"),
  ]);
  const apexMx = finalMx.filter((record) => record.name === zone.name);
  const finalSpf = finalTxt.find(
    (record) =>
      record.name === zone.name && unquote(record.content).toLowerCase().startsWith("v=spf1"),
  );
  const stillCloudflare = apexMx.some((record) => isCloudflareMx(record.content));
  const hasZoho = targetMx.every((wanted) =>
    apexMx.some(
      (record) =>
        record.content.toLowerCase() === wanted.content.toLowerCase() &&
        record.priority === wanted.priority,
    ),
  );
  const workerLeft =
    finalRules.some((rule) => targetsWorker(rule.actions)) ||
    Boolean(finalCatchAll && targetsWorker(finalCatchAll.actions));
  const spfOk = !spfTarget || (finalSpf && unquote(finalSpf.content) === spfTarget);

  console.log("\nVerification:");
  console.log(`  Routing enabled: ${String(finalSettings.enabled)}`);
  console.log(`  Zoho MX present: ${hasZoho}`);
  console.log(`  Cloudflare MX remaining: ${stillCloudflare}`);
  console.log(`  Worker rule remaining: ${workerLeft}`);
  console.log(`  SPF: ${finalSpf ? unquote(finalSpf.content) : "(none)"}`);

  if (Boolean(finalSettings.enabled) || stillCloudflare || !hasZoho || workerLeft || !spfOk) {
    printManualFallback(zone.name);
    throw new Error("Rollback verification failed; review the output above");
  }
  console.log("\nRollback complete: inbound mail is back on Zoho.");
}

(async () => {
  try {
    if (CAPTURE) {
      await capture();
      return;
    }
    await run();
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
})();
