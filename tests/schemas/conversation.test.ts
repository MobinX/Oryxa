import { describe, it, expect } from 'vitest';
import {
  createMessageInputSchema,
  updateConversationStateInputSchema,
  internalRunInputSchema,
} from '@shared/schemas/conversation';

describe('Conversation Zod Schemas', () => {
  it('validates create message input', () => {
    const result = createMessageInputSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
  });

  it('rejects empty message content', () => {
    const result = createMessageInputSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('validates conversation state update', () => {
    expect(updateConversationStateInputSchema.safeParse({ state: 'working' }).success).toBe(true);
  });

  it('validates internal run input', () => {
    const result = internalRunInputSchema.safeParse({
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.success).toBe(true);
  });
});
