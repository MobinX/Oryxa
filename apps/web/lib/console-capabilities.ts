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

export type ConsoleUser = {
  id: string;
  email: string;
  name: string | null;
  role: 'superuser' | 'admin';
  capabilities: string[];
  isActive: boolean;
  legacy?: boolean;
};

export const CONSOLE_CAPABILITY_HREFS: Record<ConsoleCapability, string> = {
  dashboard: '/admin',
  tokens: '/admin/token-analytics',
  model_billing: '/admin/model-billing',
  plans: '/admin/plans',
  channels: '/admin/channels',
  default_agent: '/admin/default-agent',
  playground: '/admin/agent-playground',
  official_channels: '/admin/official',
  official_inbox: '/admin/official/inbox',
  tickets: '/admin/official/tickets',
  prospects: '/admin/official/prospects',
  logs: '/admin/logs',
  settings: '/admin/settings',
  inbox: '/admin/inbox',
};

export function firstAllowedAdminHref(user: ConsoleUser | null | undefined): string {
  if (!user) return '/admin/login';
  if (user.role === 'superuser') return '/admin';
  const first = CONSOLE_CAPABILITY_OPTIONS.find((option) => user.capabilities.includes(option.key));
  return first ? CONSOLE_CAPABILITY_HREFS[first.key] : '/admin';
}

export const CONSOLE_CAPABILITY_OPTIONS: Array<{
  key: ConsoleCapability;
  label: string;
  description: string;
}> = [
  { key: 'dashboard', label: 'Dashboard', description: 'Platform KPIs, health and CSV export.' },
  { key: 'tokens', label: 'Tokens', description: 'Token/cost analytics per store and month.' },
  { key: 'model_billing', label: 'Model billing', description: 'Edit the model rate card.' },
  { key: 'plans', label: 'Plans', description: 'Plans, assignments, caps and cycle resets.' },
  { key: 'channels', label: 'Store channels', description: 'Connect operator Facebook Pages.' },
  { key: 'default_agent', label: 'Default agent', description: 'Platform prompt and overrides.' },
  { key: 'playground', label: 'Playground', description: 'Test prompts against the sandbox store.' },
  { key: 'official_channels', label: 'Official channels', description: 'Official channels and AI settings.' },
  { key: 'official_inbox', label: 'Official inbox', description: 'Official-channel conversations and replies.' },
  { key: 'tickets', label: 'Tickets', description: 'Support and security tickets.' },
  { key: 'prospects', label: 'Prospects', description: 'Onboarding prospects and scoring.' },
  { key: 'logs', label: 'Event log', description: 'Request, webhook and agent event log.' },
  { key: 'settings', label: 'Settings', description: 'Console/account settings.' },
  { key: 'inbox', label: 'Mail inbox', description: 'Send, receive, reply and forward admin mail.' },
];

export function consoleCan(
  user: Pick<ConsoleUser, 'role' | 'capabilities'> | null | undefined,
  capability: ConsoleCapability,
): boolean {
  if (!user) return false;
  return user.role === 'superuser' || user.capabilities.includes(capability);
}

const ADMIN_PAGE_CAPABILITIES: Array<[string, ConsoleCapability]> = [
  ['/admin/inbox', 'inbox'],
  ['/admin/token-analytics', 'tokens'],
  ['/admin/model-billing', 'model_billing'],
  ['/admin/official/inbox', 'official_inbox'],
  ['/admin/official/tickets', 'tickets'],
  ['/admin/official/prospects', 'prospects'],
  ['/admin/official', 'official_channels'],
  ['/admin/plans', 'plans'],
  ['/admin/channels', 'channels'],
  ['/admin/default-agent', 'default_agent'],
  ['/admin/agent-playground', 'playground'],
  ['/admin/logs', 'logs'],
  ['/admin/settings', 'settings'],
];

export function capabilityForAdminPagePath(pathname: string): ConsoleCapability | null {
  if (pathname === '/admin/login') return null;
  if (pathname === '/admin') return 'dashboard';
  for (const [prefix, capability] of ADMIN_PAGE_CAPABILITIES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return capability;
  }
  return null;
}
