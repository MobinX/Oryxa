import { describe, expect, it } from 'vitest';
import {
  CONSOLE_CAPABILITIES as API_CAPABILITIES,
  capabilityForAdminApiPath,
  isConsoleCapability,
} from '@api/lib/console-capabilities';
import {
  CONSOLE_CAPABILITIES as WEB_CAPABILITIES,
  CONSOLE_CAPABILITY_HREFS,
  CONSOLE_CAPABILITY_OPTIONS,
  capabilityForAdminPagePath,
} from '../../apps/web/lib/console-capabilities';

/**
 * The console's capability names exist twice: the browser draws the picker, the API is the one that
 * validates and enforces. That is deliberate (apps/web has no `@repo/shared` dependency), but it is
 * also how `subagent` shipped as a page the superuser could grant and the API then refused with
 * "Unknown capability: subagent". Nothing in either file failed; only the pair was wrong.
 *
 * These checks are the pair. They do not prove the roles are right, only that an operator can never
 * again be offered a capability the API does not recognise, or be denied one it accepts.
 */

describe('console capabilities: the browser list and the API list agree', () => {
  it('accepts every capability the superuser page offers', () => {
    const refused = CONSOLE_CAPABILITY_OPTIONS.map((option) => option.key).filter(
      (key) => !isConsoleCapability(key),
    );
    expect(refused).toEqual([]);
  });

  it('has the same set of capabilities on both sides', () => {
    expect([...WEB_CAPABILITIES].sort()).toEqual([...API_CAPABILITIES].sort());
  });

  it('gives every capability a page, and the page routes back to that capability', () => {
    for (const { key } of CONSOLE_CAPABILITY_OPTIONS) {
      const href = CONSOLE_CAPABILITY_HREFS[key];
      expect(href, `${key} has no href`).toBeTruthy();
      expect(capabilityForAdminPagePath(href), `${key} page is not gated by ${key}`).toBe(key);
    }
  });

  it('gates the subagent admin API by the subagent capability', () => {
    // An unmapped `/api2/admin/*` path is open to every signed-in console admin, so a capability the
    // API does not map is both a grant an operator cannot make and a door anyone inside can open.
    expect(capabilityForAdminApiPath('/api2/admin/subagents')).toBe('subagent');
    expect(capabilityForAdminApiPath('/api2/admin/subagents/product_info')).toBe('subagent');
  });
});
