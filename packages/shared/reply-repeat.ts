/**
 * Messenger customers type in fragments and send them: "What you hve", then six seconds later
 * "Have". Each fragment becomes its own turn, and the agent answers it again with the same
 * sentence — which reads to the merchant as the bot malfunctioning and repeating itself.
 *
 * This is the one comparison every outbound path uses, so the run's tool sends, the model's final
 * text and the operator's alert all agree on what "the same answer again" means.
 */

/** Below this many characters a reply is a courtesy ("Ok", "ধন্যবাদ") and repetition is harmless. */
const REPEAT_MIN_CHARS = 18;

/**
 * A chip row appears as "(Red / Blue / Green)" beside the sentence that offered it. The next turn
 * says the same sentence without the chips, because the chip row was already offered — so those
 * brackets have to come out or the two answers do not compare as the repeat they are.
 */
const CHIP_LIST = /\s*\((?:[^()]{0,400}?\/[^()]{0,400}?)\)\s*$/;

export function normalizeForRepeatCheck(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019']/g, '')
    .replace(/[\u201c\u201d"]/g, '')
    .replace(/[\s ]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The comparison key: normalised, chip list dropped, punctuation and other fillers stripped. */
export function repeatKey(text: string | null | undefined): string {
  return normalizeForRepeatCheck(text)
    .replace(CHIP_LIST, ' ')
    .replace(/[^a-z0-9\u0980-\u09ff\u0e00-\u0e7f\uac00-\ud7af]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `candidate` says what the customer has already been told in `previous`. Equal keys
 * count, and so does one answer that is the other truncated to its first sentence — the model
 * often re-sends a shorter version of the same content.
 */
export function isRepeatAnswer(
  candidate: string | null | undefined,
  previous: string | null | undefined,
): boolean {
  const next = repeatKey(candidate);
  const before = repeatKey(previous);
  if (next.length < REPEAT_MIN_CHARS || before.length < REPEAT_MIN_CHARS) return false;
  if (next === before) return true;
  const shorter = next.length <= before.length ? next : before;
  const longer = next.length <= before.length ? before : next;
  // "same answer, second one cut short" — compare on the leading words, not raw prefixes, so a
  // rephrased opening ("We have these categories" vs "we have these categories in the store") still
  // reads as a repeat only when the wording genuinely matches.
  return longer.startsWith(shorter) && shorter.length >= REPEAT_MIN_CHARS;
}

/** True when the candidate repeats ANY recent answer, newest or oldest first. */
export function repeatsAnyAnswer(
  candidate: string | null | undefined,
  recent: Array<string | null | undefined>,
): string | null {
  for (const previous of recent) {
    if (previous && isRepeatAnswer(candidate, previous)) return previous;
  }
  return null;
}

/**
 * What the agent is told when a send is refused. The send is NOT dropped quietly: the model sees
 * the words it had already used and is directed to answer differently, which is the only way this
 * becomes a better reply rather than silence.
 */
export function repeatAlert(previous: string): string {
  const shown = previous.trim().slice(0, 220);
  return (
    `That is a repeat of what this customer has already been told, so it was NOT sent. You already said: "${shown}". `
    + 'Say something NEW instead: answer their actual question in different words and move the sale forward — name a '
    + 'specific product with its price, ask one narrower question (category, size, colour, quantity), or offer to show '
    + 'pictures. If there is genuinely nothing new to add, end your turn with the single word SILENT instead of '
    + 'repeating yourself. Never send the same sentence twice to the same customer.'
  );
}
