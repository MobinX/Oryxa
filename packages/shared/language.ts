/**
 * Oryxa Sales Agent — Language Detection, Turn Intent Classification & Post-Generation Sanitizer
 * Part of System Update 02 Argon (High Cache-Hit, Low-Latency Architecture)
 */

export const BANGLA_CHAR_RE = /[\u0980-\u09FF]/;
export const UUID_GLOBAL_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** System prompt leak strings to sanitize if LLM echoes them */
export const SYSTEM_PROMPT_LEAK_PATTERNS = [
  /You are the official Sales and Support Representative/gi,
  /CORE_AGENT_PROMPT/gi,
  /MESSENGER_AGENT_GUIDANCE/gi,
  /COMMENT_AGENT_GUIDANCE/gi,
  /Intent-to-Tool Decision Table/gi,
  /# Identity & Language/gi,
  /## Language Rule \(Mandatory\)/gi,
];

/** Tool narration phrases that must never be presented to customers */
export const TOOL_NARRATION_PATTERNS = [
  /(?:i (?:have )?(?:sent|shared|displayed) (?:the )?(?:product )?card[s]?)/gi,
  /(?:কার্ড(?:টি)? পাঠানো হয়েছে|কার্ড পাঠিয়ে দিয়েছি|কার্ড পাঠালাম)/gi,
  /(?:the (?:picture|photo|variant) code is\s*#?[A-Z0-9]{4,6})/gi,
  /(?:ছবির কোড(?:টি)? হলো\s*#?[A-Z0-9]{4,6})/gi,
  /(?:calling tool|tool call:|calling get_product|calling show_products)/gi,
];

/**
 * Common Banglish (Bengali written in Latin letters) lexicon.
 * If these tokens appear in the customer query, it is Banglish input intended for Bangla response.
 * NOTE: generic English words (please, order, price, color, size, etc.) are intentionally
 * excluded — they appear in pure English messages and must not trigger 'bn' on their own.
 */
export const BANGLISH_LEXICON = new Set([
  'ami', 'amra', 'tumi', 'tomra', 'apni', 'apnara', 'apnader', 'amader', 'amar', 'tomar', 'apnar',
  'amake', 'tomake', 'apnake',
  'koto', 'koto?', 'dam', 'daam', 'ache', 'ase', 'ase?', 'ache?', 'thakbe', 'thakbe?',
  'ki', 'ki?', 'kire', 'kemon', 'kemon?', 'koyta', 'koita', 'koyta?', 'koita?',
  'shob', 'shobgulo', 'sob', 'sobgulo', 'chobi', 'chobigulo', 'picgulo',
  'dekhao', 'dekhan', 'dekhte', 'chai', 'dekte', 'dekhbo', 'dekhi', 'dekho', 'dekhun',
  'lagbe', 'hobe', 'hobe?',
  'dibo', 'nibo', 'nebo', 'den', 'dao', 'diben', 'bodole', 'onno', 'arekta', 'ar',
  'ei', 'oi', 'etar', 'otar', 'eta', 'ota', 'eita', 'oita', 'er', 'tar',
  'kache', 'thikana', 'thik', 'dhaka', 'chattogram',
  'pathan', 'pathaben', 'korte', 'kore', 'koren', 'korbo', 'koro', 'korun', 'korben',
  'korechi', 'korchi', 'koreche', 'korechen', 'korechilam', 'korlam', 'kora',
  'khub', 'valo', 'bhalo', 'bhai', 'bhaiya', 'apu', 'didi', 'dada', 'dost', 'dosto',
  'shundor', 'sundor', 'beshi', 'kom', 'kichu', 'akta', 'ekta', 'duita', 'tin ta', 'tinta',
  'pice', 'bolun', 'bolo', 'janan', 'parben', 'parben?',
  'kintu', 'jante', 'peyechi', 'diyechi', 'niyechi', 'keno', 'kothay', 'kivabe', 'kokhon',
]);

/**
 * Distinctive Banglish markers — a single occurrence classifies the turn as 'bn',
 * even in a longer message diluted with English loanwords (order, confirm, bKash, TrxID).
 * Generic English words (please, order, price, delivery, etc.) are intentionally excluded.
 */
export const STRONG_BANGLISH_MARKERS = new Set([
  'ami', 'amra', 'tumi', 'tomra', 'apni', 'apnara', 'apnader', 'amader', 'amar', 'tomar', 'apnar',
  'amake', 'tomake', 'apnake',
  'korte', 'kore', 'koren', 'korbo', 'koro', 'korun', 'korben', 'korechi', 'korchi',
  'koreche', 'korechen', 'korechilam', 'korlam',
  'chai', 'ache', 'ase', 'thakbe', 'lagbe', 'hobe', 'dibo', 'nibo', 'nebo', 'den', 'dao', 'diben',
  'dekhao', 'dekhan', 'dekhte', 'dekhi', 'dekhbo', 'dekte', 'dekho', 'dekhun',
  'koto', 'koyta', 'koita', 'kemon', 'dam', 'daam', 'thikana', 'chobi', 'bodole',
  'kache', 'pathan', 'pathaben', 'parben', 'bolun', 'bolo', 'janan',
  'ei', 'oi', 'etar', 'otar', 'eta', 'ota', 'er', 'tar',
  'kintu', 'jante', 'peyechi',
]);

export interface LanguageDetectionContext {
  languageOverride?: 'bn' | 'en' | null;
  lastReplyLanguage?: 'bn' | 'en' | null;
}

/**
 * Detect customer's intended reply language based on P1 rules:
 * 1. Explicit requests override everything ("reply in English", "বাংলায় বলুন")
 * 2. If state.languageOverride is set, follow it
 * 3. Short messages ("ok", numbers, emoji, button taps) keep previous reply language
 * 4. Bangla Unicode script -> 'bn'
 * 5. Banglish (Bengali in Latin script) -> 'bn'
 * 6. English / other -> 'en'
 */
export function detectTurnLanguage(
  input: string,
  historyOrContext?: Array<{ from: 'customer' | 'self'; content: string }> | LanguageDetectionContext,
  maybeContext?: LanguageDetectionContext
): 'bn' | 'en' {
  const cleanInput = (input || '').trim();
  const lower = cleanInput.toLowerCase();

  const context: LanguageDetectionContext | undefined = Array.isArray(historyOrContext)
    ? maybeContext
    : (historyOrContext as LanguageDetectionContext | undefined);
  const history = Array.isArray(historyOrContext) ? historyOrContext : undefined;

  // 1. Explicit override keywords
  if (
    /(\b(?:reply|talk|speak|write|answer|say|tell(?:\s+me)?)\s+in\s+english\b|\bin\s+english\s+please\b|\bin\s+english\b)/i.test(lower)
  ) {
    return 'en';
  }
  if (
    /(বাংলায়\s*(?:বলুন|কথা|লিখুন)|বাংলায়\s*(?:বলুন|কথা|লিখুন)|\bbangla\s*(?:te|y|e)?\s*(?:bolo|bolun|likhun)\b|\bin\s+bangla\b)/i.test(lower)
  ) {
    return 'bn';
  }

  // 2. Active stored override
  if (context?.languageOverride) {
    return context.languageOverride;
  }

  // 3. Short affirmations / button taps / single numbers keep previous reply language
  const isShortMessage =
    cleanInput.length <= 6 ||
    /^(ok|okay|ha|haa|hmm|thik ache|yes|no|done|fine|sure|\d+|[^\w\s]+)$/i.test(lower);

  if (isShortMessage) {
    if (context?.lastReplyLanguage) {
      return context.lastReplyLanguage;
    }
    // Inspect history if context is missing
    if (history && history.length > 0) {
      const lastSelf = [...history].reverse().find((m) => m.from === 'self');
      if (lastSelf && BANGLA_CHAR_RE.test(lastSelf.content)) {
        return 'bn';
      }
      if (lastSelf) {
        return 'en';
      }
    }
  }

  // 4. Bangla Unicode script
  if (BANGLA_CHAR_RE.test(cleanInput)) {
    return 'bn';
  }

  // 5. Banglish token detection
  const words = lower.split(/[^a-zA-Z0-9?]+/).filter(Boolean);

  // A single distinctive Banglish marker classifies as 'bn', even when diluted
  // by English loanwords (order, confirm, bKash, TrxID). Strip trailing '?' so
  // 'koto?' matches strong marker 'koto'.
  if (words.some((w) => STRONG_BANGLISH_MARKERS.has(w) || STRONG_BANGLISH_MARKERS.has(w.replace(/\?+$/, '')))) {
    return 'bn';
  }

  let banglishTokenCount = 0;
  for (const w of words) {
    if (BANGLISH_LEXICON.has(w)) {
      banglishTokenCount++;
    }
  }

  // If words contain 2+ Banglish tokens or >=25% of total tokens are Banglish, classify as Banglish -> 'bn'
  if (banglishTokenCount >= 2 || (words.length > 0 && banglishTokenCount / words.length >= 0.25)) {
    return 'bn';
  }

  // 6. Default English
  return 'en';
}

/**
 * Strips em dashes (—) and en dashes (–) from customer-facing text, replacing with commas or periods.
 */
export function stripEmDashes(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips internal 5-character photo codes (e.g. #AFG23, AFG23) from customer-facing replies
 */
export function stripPhotoCodes(text: string): string {
  if (!text) return '';
  return text.replace(/#?[A-Za-z0-9]{5}\b/g, (match) => {
    const raw = match.replace(/^#/, '');
    // Strip alphanumeric stamps like AFG23, DAA03
    if (/^[A-Za-z]{2,4}[0-9]{1,3}$|^[0-9]{1,3}[A-Za-z]{2,4}$/.test(raw)) {
      return '';
    }
    return match;
  });
}

/**
 * Validates and sanitizes agent reply text before delivery to customer.
 * - Strips em dashes (—)
 * - Strips raw UUIDs
 * - Strips tool narration ("I sent the card")
 * - Strips system prompt echoes
 */
export function validateAndSanitizeReply(
  replyText: string,
  options?: {
    expectedLanguage?: 'bn' | 'en';
    channel?: 'messenger' | 'comment';
    validPrices?: string[];
    isSilentExpected?: boolean;
  }
): { sanitizedText: string; isValid: boolean; violations: string[] } {
  if (!replyText) {
    return { sanitizedText: '', isValid: true, violations: [] };
  }

  const violations: string[] = [];
  let sanitized = replyText;

  // 1. Silent expected
  if (options?.isSilentExpected) {
    if (sanitized.trim() !== 'SILENT') {
      violations.push('R3_SILENT_VIOLATION');
      sanitized = 'SILENT';
    }
    return { sanitizedText: sanitized, isValid: violations.length === 0, violations };
  }

  // 2. Em dash removal
  if (sanitized.includes('—') || sanitized.includes('–')) {
    violations.push('R4_EM_DASH');
    sanitized = stripEmDashes(sanitized);
  }

  // 3. UUID leakage
  if (UUID_GLOBAL_RE.test(sanitized)) {
    violations.push('R5_UUID_LEAK');
    sanitized = sanitized.replace(UUID_GLOBAL_RE, '');
  }

  // 4. System prompt leaks
  for (const pattern of SYSTEM_PROMPT_LEAK_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('R5_SYSTEM_PROMPT_LEAK');
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // 5. Tool narration removal
  for (const pattern of TOOL_NARRATION_PATTERNS) {
    if (pattern.test(sanitized)) {
      violations.push('R4_TOOL_NARRATION');
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // 5.1 Photo codes removal
  const strippedCodes = stripPhotoCodes(sanitized);
  if (strippedCodes !== sanitized) {
    violations.push('R4_PHOTO_CODE');
    sanitized = strippedCodes;
  }

  // Clean up any double spaces, trailing commas or awkward punctuation left after stripping
  sanitized = sanitized
    .replace(/\s*,\s*,/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();

  // 6. Language check
  if (options?.expectedLanguage) {
    const hasBangla = BANGLA_CHAR_RE.test(sanitized);
    if (options.expectedLanguage === 'bn' && !hasBangla && sanitized.length > 5) {
      violations.push('R3_LANGUAGE_MISMATCH_EXPECTED_BN');
    } else if (options.expectedLanguage === 'en' && hasBangla) {
      violations.push('R3_LANGUAGE_MISMATCH_EXPECTED_EN');
    }
  }

  return {
    sanitizedText: sanitized,
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Classifies turn intent into predefined categories for logging, dynamic reasoning effort,
 * and fast-path determination.
 */
export function classifyTurnIntent(
  text: string,
  state?: any,
  postContext?: any
): string {
  const lower = (text || '').toLowerCase().trim();

  // 1. Silent Comment (@mention or friend tag)
  if (lower.startsWith('@') || /@[\w\u0980-\u09FF]+/.test(lower)) {
    return 'comment_silent';
  }

  // 2. Order Button Tap postbacks
  if (lower.startsWith('place order with') || lower.startsWith('please track order with id')) {
    return lower.startsWith('place order with') ? 'button_order' : 'order_track';
  }

  // 3. Order actions
  if (/cancel\s+(?:my\s+)?order|বাতিল/i.test(lower)) {
    return 'order_cancel';
  }
  if (/change\s+(?:my\s+)?(?:delivery\s+)?address|পরিবর্তন|bodole/i.test(lower)) {
    return 'order_update';
  }
  if (/track\s+order|where\s+is\s+my\s+order/i.test(lower)) {
    return 'order_track';
  }

  // 4. Reject color or size
  if (/don't\s+like\s+this\s+color|onno\s+color|অন্য\s+কালার/i.test(lower)) {
    return 'reject_color';
  }
  if (/size\s+doesn't\s+suit|onno\s+size|অন্য\s+সাইজ|gaye\s+lage\s+na/i.test(lower)) {
    return 'reject_size';
  }

  // 5. Product options or count
  if (/koyta\s+(?:color|size)|how\s+many\s+colors|কয়টি\s+(?:কালার|সাইজ)/i.test(lower)) {
    return 'product_options_query';
  }

  // 6. Photo stamp code
  if (/#?[A-Z0-9]{5}\b/.test(text)) {
    return 'photo_code';
  }

  // 7. General browse
  if (/show\s+(?:me\s+)?products|dekhan|dekhao|ki\s+ki\s+ache/i.test(lower)) {
    return 'browse_products';
  }

  return 'general';
}
