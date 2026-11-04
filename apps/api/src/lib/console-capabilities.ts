export const CONSOLE_CAPABILITIES = [
  'dashboard',
  'tokens',
  'model_billing',
  'plans',
  'channels',
  'default_agent',
  'playground',
  'official_channels',
  'official_inbox',
  'tickets',
  'prospects',
  'logs',
  'settings',
  'inbox',
] as const;

export type ConsoleCapability = (typeof CONSOLE_CAPABILITIES)[number];

export function isConsoleCapability(value: unknown): value is ConsoleCapability {
  return typeof value === 'string' && (CONSOLE_CAPABILITIES as readonly string[]).includes(value);
}

export function consoleCan(
  user: { role: string; capabilities: readonly string[] } | null | undefined,
  capability: ConsoleCapability,
): boolean {
  if (!user) return false;
  return user.role === 'superuser' || user.capabilities.includes(capability);
}

const ADMIN_API_CAPABILITY_PREFIXES: Array<[string, ConsoleCapability]> = [
  ['/api2/admin/mail', 'inbox'],
  ['/api2/admin/token-analytics', 'tokens'],
  ['/api2/admin/model-billing', 'model_billing'],
  ['/api2/admin/official/conversations', 'official_inbox'],
  ['/api2/admin/official/tickets', 'tickets'],
  ['/api2/admin/official/prospects', 'prospects'],
  ['/api2/admin/official/prospect-weights', 'prospects'],
  ['/api2/admin/official/settings', 'official_channels'],
  ['/api2/admin/official/channels', 'official_channels'],
  ['/api2/admin/official/tiktok', 'official_channels'],
  ['/api2/admin/default-agent', 'default_agent'],
  ['/api2/admin/channels', 'channels'],
  ['/api2/admin/plans', 'plans'],
  ['/api2/admin/businesses', 'plans'],
  ['/api2/admin/stats', 'dashboard'],
  ['/api2/admin/export.csv', 'dashboard'],
  ['/api2/logs', 'logs'],
];

export function capabilityForAdminApiPath(path: string): ConsoleCapability | null {
  for (const [prefix, capability] of ADMIN_API_CAPABILITY_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return capability;
  }
  return null;
}
