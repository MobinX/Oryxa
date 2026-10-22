/**
 * Operator identities that may reach the `oryxa-sandbox` store without owning it.
 * Exact, case-insensitive match on the comma-separated ADMIN_EMAILS list — never a substring
 * match (`ADMIN_EMAILS.includes(email)` let `racle@x.com` in when `oracle@x.com` was listed).
 * The built-in default applies only while ADMIN_EMAILS is unset, so the owner is not locked
 * out by this change; set ADMIN_EMAILS to replace it. The historical `admin123@oryxa.app`
 * operator is deliberately NOT a default any more — an identity whose local part is a
 * famously published password string is one guess away from an account name.
 */
const DEFAULT_OPERATORS = ['mobin.devx@gmail.com'];

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
