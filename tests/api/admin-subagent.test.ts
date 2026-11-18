import { describe, it, expect, beforeEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { withPglite } from '../helpers/with-pglite';
import { seedTestWorld } from '../helpers/seed';
import { app } from '@api/index';
import { getProductInfoPrompt, getSubagent, updateSubagentPrompt } from '@repo/db/crud/subagent';
import { createProductInfoTool } from '@agent/tools/product-info';
import { PRODUCT_INFO_SYSTEM_PROMPT } from '@repo/shared';
import { db } from '@db/client';
import { subagents } from '@db/schema';

const OPERATOR = 'operator-console-test-secret';
beforeEach(() => {
  process.env.LOGS_UI_PASSWORD = OPERATOR;
});

const bearer = (token: string) => `Bearer ${token}`;

const call = (url: string, init: RequestInit & { auth?: string } = {}) => {
  const { auth, ...rest } = init;
  return app.request(url, {
    ...rest,
    headers: { ...(auth ? { Authorization: auth } : {}), 'content-type': 'application/json' },
  });
};

type SubagentRow = {
  key: string;
  name: string;
  systemPrompt: string;
  defaultPrompt: string;
  isDefault: boolean;
  updatedAt: string;
};

/** A model that records the system prompt it was handed and answers with one fixed line. */
function capturingModel(seen: BaseMessage[]) {
  class CapturingModel extends BaseChatModel {
    constructor() {
      super({});
    }
    _llmType() {
      return 'capturing-subagent';
    }
    bindTools() {
      return this;
    }
    async _generate(messages: BaseMessage[]): Promise<ChatResult> {
      seen.push(...messages);
      return { generations: [{ text: 'It is cotton.', message: new AIMessage('It is cotton.') }], llmOutput: {} };
    }
  }
  return new CapturingModel();
}

describe('the subagent prompt console', () => {
  withPglite({ timeoutMs: 120_000 });

  it('creates the product-answer writer from the reviewed text on first read', async () => {
    const res = await call('http://localhost/api2/admin/subagents/product_info', { auth: bearer(OPERATOR) });
    expect(res.status).toBe(200);

    const row = (await res.json()) as SubagentRow;
    expect(row.key).toBe('product_info');
    expect(row.systemPrompt).toBe(PRODUCT_INFO_SYSTEM_PROMPT);
    expect(row.defaultPrompt).toBe(PRODUCT_INFO_SYSTEM_PROMPT);
    expect(row.isDefault).toBe(true);

    // Read again: still one row, created rather than re-created.
    await call('http://localhost/api2/admin/subagents/product_info', { auth: bearer(OPERATOR) });
    expect(await db.select({ id: subagents.id }).from(subagents)).toHaveLength(1);
  });

  it('saves an edit and hands it to the product-answer tool on its next call', async () => {
    const seed = await seedTestWorld();
    const edited = 'Answer only in one sentence, and never mention the price.';

    const put = await call('http://localhost/api2/admin/subagents/product_info', {
      method: 'PUT',
      auth: bearer(OPERATOR),
      body: JSON.stringify({ systemPrompt: edited }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as SubagentRow).systemPrompt).toBe(edited);
    expect(await getProductInfoPrompt()).toBe(edited);

    const seen: BaseMessage[] = [];
    const tool = createProductInfoTool({
      businessId: seed.business.id,
      llm: capturingModel(seen),
    });

    const result = await tool.invoke({ productId: seed.productDetail.id, userQuery: 'Is it cotton?' });

    expect(result).toBe('It is cotton.');
    // The edited row, not the reviewed default: this is what "read on every call" has to mean.
    const system = seen.find((message) => message._getType() === 'system');
    expect(String(system?.content)).toBe(edited);
  });

  it('restores nothing implicitly: the reviewed default stays available beside the edit', async () => {
    await updateSubagentPrompt('product_info', 'A custom brief.');
    const row = await getSubagent('product_info');

    expect(row?.systemPrompt).toBe('A custom brief.');
    expect(row?.isDefault).toBe(false);
    // The console's restore button writes this value back; the row never replaces itself.
    expect(row?.defaultPrompt).toBe(PRODUCT_INFO_SYSTEM_PROMPT);
    expect(await getProductInfoPrompt()).toBe('A custom brief.');
  });

  it('refuses a key no subagent is registered under, and refuses callers without the console session', async () => {
    const unknown = await call('http://localhost/api2/admin/subagents/nope', { auth: bearer(OPERATOR) });
    expect(unknown.status).toBe(404);

    const unknownPut = await call('http://localhost/api2/admin/subagents/nope', {
      method: 'PUT',
      auth: bearer(OPERATOR),
      body: JSON.stringify({ systemPrompt: 'x' }),
    });
    expect(unknownPut.status).toBe(404);

    expect((await call('http://localhost/api2/admin/subagents/product_info')).status).toBe(401);
    expect(
      (
        await call('http://localhost/api2/admin/subagents/product_info', {
          method: 'PUT',
          body: JSON.stringify({ systemPrompt: 'x' }),
        })
      ).status,
    ).toBe(401);
  });
});
