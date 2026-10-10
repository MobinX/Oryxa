import { describe, it, expect } from 'vitest';
import {
  createAgentInputSchema,
  createChannelInputSchema,
} from '@shared/schemas/channel';

describe('Channel & Agent Zod Schemas', () => {
  it('validates agent input', () => {
    const result = createAgentInputSchema.safeParse({
      name: 'Bot',
      systemPrompt: 'Be helpful',
      platformType: 'facebook',
    });
    expect(result.success).toBe(true);
  });

  it('validates channel input', () => {
    const result = createChannelInputSchema.safeParse({
      platform: 'facebook',
      apiToken: 'token',
      platformChannelId: 'page-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid platform', () => {
    const result = createChannelInputSchema.safeParse({
      platform: 'tiktok',
      apiToken: 'token',
      platformChannelId: 'page-1',
    });
    expect(result.success).toBe(false);
  });
});
