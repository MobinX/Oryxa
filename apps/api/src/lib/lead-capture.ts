import { upsertLeadFromTurn, recordLeadEvent } from '@repo/db/crud/lead';

/**
 * Lead capture (spec D). The lead row grows from two evidence sources, in order of
 * trust: the customer's own platform profile (name) and the words they typed. Typed
 * name/phone/email are found by the fenced patterns below — conservative on purpose,
 * because a false phone number joins a CRM row to a person who never gave it.
 */

const PHONE_RE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** "My name is ___", "I'm ___", "this is ___" — the customer naming themselves. */
const NAME_RE = /\b(?:my name is|i am|i'm|this is|itis|it's)\s+([A-Za-z][A-Za-z .'-]{1,60})/i;
const INFO_ASKED_RE =
  /\b(?:["']?[^"']*["']?\s*)?(?:when\s+(?:can|does)|what\s+(?:are|is)\s+your|how\s+much|price|quote|available|availability|schedule|book)/i;

export type ExtractedLeadFields = {
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
  consent?: boolean;
};

/** Pulls the fields a typed customer turn can offer. No field is invented. */
export function extractLeadFields(text: string, platformName?: string | null): ExtractedLeadFields {
  const fields: ExtractedLeadFields = {};
  const lower = text.toLowerCase();

  // A phone number only counts when the customer offers one to be reached on — a
  // bare sequence of digits inside an order or price is not a phone number.
  if (/(contact|call|reach|text|whatsapp me|give (?:me )?(?:your )?(?:number|phone)|phone(?:\s+no)?\s*[:=]|number is|phone is|:\s*[\d(])/.test(lower)) {
    const match = [...text.matchAll(PHONE_RE)]
      .map((m) => ({
        candidate: m[0].trim(),
        // Where the candidate sits in the text, to spot "card number is …"-style
        // non-contact numbers: a bare digit run inside an order or account context.
        index: m.index ?? 0,
      }))
      .find(
        ({ candidate, index }) =>
          candidate.replace(/\D/g, '').length >= 7 &&
          candidate.replace(/\D/g, '').length <= 15 &&
          !/(?:order|card|invoice|tracking|serial|receipt)\b[^\n]{0,16}$/i.test(text.slice(Math.max(0, index - 20), index).toLowerCase()),
      );
    if (match) fields.phone = match.candidate;
  }

  const email = text.match(EMAIL_RE)?.[0];
  if (email) fields.email = email;

  const name = text.match(NAME_RE)?.[1];
  if (name) {
    fields.name = name.trim().replace(/[,.;:!?].*$/, '').trim() || undefined;
  } else if (platformName) {
    fields.name = platformName;
  }

  // "Interested in X" and its siblings write the interest slot; capped to one line.
  const interest = text.match(/\b(?:i(?:'m| am)?\s+(?:interested in|looking for|want|need))\s+([^.!?\n]{1,300})/i)?.[1];
  if (interest) fields.interest = interest.trim();

  if (fields.name || fields.phone || fields.email || fields.interest) return fields;
  if (INFO_ASKED_RE.test(lower)) return { interest: text.slice(0, 200) };
  return {};
}

export type LeadIdentityInput = {
  businessId: string;
  channelId: string;
  platform: 'facebook' | 'instagram' | 'whatsapp' | 'telegram' | 'twitter';
  platformUserId: string;
  conversationId?: string | null;
  commentThreadId?: string | null;
  sourceChannel?: string;
};

/**
 * Called on every inbound customer turn of a lead-bearing channel: get-or-create the
 * (channel, platform user) lead and fold in what this turn revealed. Slow, cheap, side-
 * effect-lean — a failed DB write never breaks the webhook path around it.
 */
export async function captureLeadFromTurn(
  identity: LeadIdentityInput,
  observed: ExtractedLeadFields & { customerPlatformName?: string | null },
): Promise<void> {
  try {
    await upsertLeadFromTurn(
      {
        businessId: identity.businessId,
        channelId: identity.channelId,
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        conversationId: identity.conversationId,
        sourceChannel: identity.sourceChannel,
      },
      {
        name: observed.name ?? observed.customerPlatformName ?? null,
        phone: observed.phone ?? null,
        email: observed.email ?? null,
        interest: observed.interest ?? null,
      },
    );
  } catch (err) {
    console.error('[lead-capture] failed to update lead:', err);
  }
}

/**
 * A customer's answer that gives a field the model relayed is recorded here, after the
 * run — the exact boundary a spec test (scenario 6 "gives phone/email") asserts at. The
 * values come from the model's final answer, which the instructions field forbid inventing.
 */
export async function reconcileLeadFromReply(
  identity: LeadIdentityInput,
  extracted: ExtractedLeadFields & { customerPlatformName?: string | null },
): Promise<void> {
  if (!extracted.name && !extracted.phone && !extracted.email && !extracted.interest) return;
  try {
    const lead = await upsertLeadFromTurn(
      {
        businessId: identity.businessId,
        channelId: identity.channelId,
        platform: identity.platform,
        platformUserId: identity.platformUserId,
        conversationId: identity.conversationId,
        sourceChannel: identity.sourceChannel,
      },
      {
        name: extracted.customerPlatformName ?? null,
        phone: extracted.phone ?? null,
        email: extracted.email ?? null,
        interest: extracted.interest ?? null,
      },
    );
    await recordLeadEvent(lead.id, 'ai_reply_observed', { kind: 'ai' }, {
      observed: Object.keys(extracted).filter((k) => ['name', 'phone', 'email'].includes(k)),
    });
  } catch (err) {
    console.error('[lead-capture] failed to reconcile lead from reply:', err);
  }
}
