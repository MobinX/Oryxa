'use server';

import { revalidatePath } from 'next/cache';
import { requireConsoleBearer } from '@/lib/admin-access';
import {
  ApiError,
  adminMakeAgentFollowDefault,
  adminUpdatePlatformAgent,
} from '@/lib/api';

export type DefaultAgentSaveResult = { ok: true } | { ok: false; error: string };

/**
 * An emptied wording box is not "answer with nothing" — it is "use the reviewed wording in code", the
 * same rule the merchant playground applies, so clearing a box means the same thing in either place.
 */
function written(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? '').trim();
  return text ? text : null;
}

/**
 * The operator's edit of the agent every store answers with. Console bearer only — this used to fall
 * through to the reader's account token in the plans console, and any signed-in merchant could have
 * rewritten every bot on the platform with it.
 */
export async function updateDefaultAgentAction(formData: FormData): Promise<DefaultAgentSaveResult> {
  // Outside the try: with no console session this throws Next's redirect, and the catch below
  // would swallow it into a save-failure notice instead of sending the reader to the sign-in.
  const bearer = await requireConsoleBearer();

  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  if (!systemPrompt) return { ok: false, error: 'The default agent needs a system prompt.' };

  try {
    await adminUpdatePlatformAgent(bearer, {
      systemPrompt,
      replyGuidance: written(formData.get('replyGuidance')),
      commentReplyGuidance: written(formData.get('commentReplyGuidance')),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'Could not save the default agent.',
    };
  }

  revalidatePath('/admin/default-agent');
  return { ok: true };
}

/**
 * Bring one store back onto the fleet default.
 *
 * Console bearer for the same reason the prompt edit is: this speaks for a business the clicker does
 * not own. It is a flag write, so the store's own text survives it — clicking this by mistake costs
 * nothing that cannot be undone by clicking the store back into an override with its next save.
 */
export async function followDefaultAgentAction(formData: FormData): Promise<DefaultAgentSaveResult> {
  const bearer = await requireConsoleBearer();
  const agentId = String(formData.get('agentId') ?? '');
  if (!agentId) return { ok: false, error: 'No store was named.' };

  try {
    await adminMakeAgentFollowDefault(bearer, agentId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof ApiError ? err.message : 'Could not change who that store answers with.',
    };
  }

  revalidatePath('/admin/default-agent');
  return { ok: true };
}
