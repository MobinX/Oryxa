/**
 * Operator identities that may reach the `oryxa-sandbox` store without owning it.
 * Exact, case-insensitive match on the comma-separated ADMIN_EMAILS list — never a substring
 * match (`ADMIN_EMAILS.includes(email)` let `racle@x.com` in when `oracle@x.com` was listed).
 * The two historical defaults apply only while ADMIN_EMAILS is unset, so the owner is not
 * locked out by this change; set ADMIN_EMAILS to replace them.
 */
const DEFAULT_OPERATORS = ['admin123@oryxa.app', 'mobin.devx@gmail.com'];

export function operatorEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  const list = raw === undefined || raw.trim() === '' ? DEFAULT_OPERATORS : raw.split(',');
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isOperatorEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return operatorEmails().includes(normalized);
}
