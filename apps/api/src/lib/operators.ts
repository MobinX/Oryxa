/**
 * Operator identities that may reach the `oryxa-sandbox` store without owning it.
 * Exact, case-insensitive match on the comma-separated ADMIN_EMAILS list — never a substring
 * match (`ADMIN_EMAILS.includes(email)` let `racle@x.com` in when `oracle@x.com` was listed).
 * The list lives in the environment only. A personal address baked into source is a credential
 * every reader of the repository has, so an empty or unset ADMIN_EMAILS means no one is an
 * operator by this shortcut. The historical `admin123@oryxa.app` is deliberately not built in
 * either — an identity whose local part is a famously published password string is one guess
 * away from an account name.
 */
export function operatorEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOperatorEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return operatorEmails().includes(normalized);
}
