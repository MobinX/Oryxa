/**
 * Rule-based inbound spam scoring. Pure and dependency-free so the repo's
 * vitest suite can cover it without a Worker runtime. Scores are 0..10;
 * a message is spam when score >= threshold (default 5, SPAM_THRESHOLD).
 *
 * Reasons are stable short codes, persisted on the email row (spam_reason)
 * and in the stored JSON document. They are additive metadata only: spam
 * is never rejected or deleted, just flagged and filterable.
 */

export const DEFAULT_SPAM_THRESHOLD = 5;
export const MAX_SPAM_SCORE = 10;

export interface SpamAddress {
  email: string;
  name: string;
}

export interface SpamAttachmentSummary {
  filename: string;
  contentType: string;
  size: number;
}

export interface SpamInput {
  from: SpamAddress;
  to: SpamAddress[];
  cc?: SpamAddress[];
  replyTo?: SpamAddress[];
  subject: string;
  text: string;
  html: string;
  headers?: Array<{ key: string; value: string }>;
  attachments?: SpamAttachmentSummary[];
  inReplyTo?: string | null;
  references?: string[];
  messageId?: string | null;
}

export interface SpamVerdict {
  score: number;
  isSpam: boolean;
  threshold: number;
  reasons: string[];
}

export function spamThresholdFromEnv(value: string | undefined | null): number {
  const trimmed = (value || "").trim();
  if (!trimmed) return DEFAULT_SPAM_THRESHOLD;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return DEFAULT_SPAM_THRESHOLD;
  return Math.min(10, Math.max(1, Math.floor(parsed)));
}

function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@").pop() || "";
}

function headerValues(headers: SpamInput["headers"], name: string): string[] {
  const wanted = name.toLowerCase();
  return (headers || [])
    .filter((header) => header.key.toLowerCase() === wanted)
    .map((header) => header.value);
}

const SPAM_SUBJECT_WORDS = [
  "lottery",
  "winner",
  "viagra",
  "cialis",
  "pharmacy",
  "crypto giveaway",
  "double your",
  "wire transfer",
  "inheritance",
  "act now",
  "risk-free",
  "risk free",
  "make money",
  "earn $$$",
  "guaranteed income",
  "password expired",
  "account suspended",
  "verify your account",
  "urgent action required",
];

const PHISH_BODY_PHRASES = [
  "verify your account",
  "account has been suspended",
  "account will be suspended",
  "click here to confirm",
  "update your payment",
  "confirm your identity",
  "unusual sign-in",
  "unusual login",
];

const SPOOFED_BRANDS = [
  "paypal",
  "apple",
  "amazon",
  "google",
  "microsoft",
  "netflix",
  "binance",
  "coinbase",
  "onlyorders",
  "zoho",
  "brevo",
];

const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
];

const RISKY_ATTACHMENT_EXTENSIONS = new Set([
  "exe",
  "scr",
  "bat",
  "cmd",
  "com",
  "js",
  "jse",
  "vbs",
  "vbe",
  "wsf",
  "ps1",
  "msi",
  "dll",
  "cpl",
  "gadget",
  "hta",
  "jar",
]);

const ARCHIVE_ATTACHMENT_EXTENSIONS = new Set(["zip", "rar", "7z", "iso", "img", "cab"]);

function extractUrls(text: string, html: string): string[] {
  const urls: string[] = [];
  const pattern = /https?:\/\/[^\s<>"')]+/gi;
  for (const source of [text, html]) {
    for (const match of source.matchAll(pattern)) {
      urls.push(match[0].replace(/[.,;:!?]+$/, ""));
    }
  }
  return urls;
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function anchorPairs(html: string): Array<{ href: string; text: string }> {
  const pairs: Array<{ href: string; text: string }> = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(pattern)) {
    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    pairs.push({ href: match[1], text });
  }
  return pairs;
}

export function scoreInboundSpam(input: SpamInput, threshold = DEFAULT_SPAM_THRESHOLD): SpamVerdict {
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  const subject = (input.subject || "").trim();
  const subjectLower = subject.toLowerCase();
  const text = input.text || "";
  const html = input.html || "";
  const bodyLower = `${text}\n${html.replace(/<[^>]+>/g, " ")}`.toLowerCase();
  const fromDomain = domainOf(input.from.email);

  // --- Strong ham signal: this message continues an existing thread. ---
  if ((input.inReplyTo || "").trim() || (input.references || []).length > 0) {
    score -= 3;
    reasons.push("in_thread:-3");
  }

  // --- Authentication failures reported by upstream hops. ---
  const authResults = headerValues(input.headers, "authentication-results").join(" ").toLowerCase();
  if (/(dmarc|dkim|spf)\s*=\s*fail/.test(authResults)) {
    add(3, "auth_fail");
  }

  // --- Reply-To domain differs from From domain (classic phish tell). ---
  const replyTo = (input.replyTo || []).filter((address) => address.email.trim());
  if (replyTo.length > 0 && replyTo.every((address) => domainOf(address.email) !== fromDomain)) {
    add(2, "replyto_mismatch");
  }

  // --- Display name impersonates a known brand on a foreign domain. ---
  const fromNameLower = (input.from.name || "").toLowerCase();
  if (
    fromNameLower &&
    SPOOFED_BRANDS.some(
      (brand) => fromNameLower.includes(brand) && !fromDomain.includes(brand),
    )
  ) {
    add(2, "from_display_spoof");
  }

  // --- Subject signals. ---
  const subjectWords = SPAM_SUBJECT_WORDS.filter((word) => subjectLower.includes(word));
  if (subjectWords.length > 0) {
    add(subjectWords.length >= 2 ? 3 : 2, "subject_spam_words");
  }
  const letters = subject.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 10 && letters === letters.toUpperCase()) {
    add(1, "subject_caps");
  }
  if (/([!?])\1{2,}/.test(subject)) {
    add(1, "subject_exclaim");
  }

  // --- Body phish phrases. ---
  if (PHISH_BODY_PHRASES.some((phrase) => bodyLower.includes(phrase))) {
    add(2, "phish_phrase");
  }

  // --- Link analysis. ---
  const urls = extractUrls(text, html);
  const distinctHosts = new Set(urls.map(urlHost).filter(Boolean));
  const bodyChars = text.replace(/\s+/g, " ").trim().length;
  if (urls.length >= 6 && bodyChars < 500) {
    add(2, "link_heavy");
  } else if (distinctHosts.size >= 4 && bodyChars < 1000) {
    add(1, "link_many_hosts");
  }
  if (
    urls.some((url) => {
      const host = urlHost(url);
      return (
        SHORTENERS.some((short) => host === short || host.endsWith(`.${short}`)) ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
        /^\[?[0-9a-f:]{3,}\]?$/.test(host)
      );
    })
  ) {
    add(2, "shortener_or_ip_url");
  }
  if (
    anchorPairs(html).some((pair) => {
      if (!/^https?:\/\//i.test(pair.text.trim())) return false;
      const textHost = urlHost(pair.text.trim());
      const hrefHost = urlHost(pair.href);
      return Boolean(textHost && hrefHost && textHost !== hrefHost);
    })
  ) {
    add(2, "mismatched_link_text");
  }

  // --- Credential-harvesting form embedded in HTML. ---
  if (/<form\b/i.test(html) && /type=["']?password["']?/i.test(html)) {
    add(3, "html_password_form");
  }

  // --- Image-only HTML with (almost) no text part. ---
  if (html && /<img\b/i.test(html) && bodyChars < 50) {
    add(1, "html_image_only");
  }

  // --- Attachments. ---
  for (const attachment of input.attachments || []) {
    const parts = attachment.filename.toLowerCase().split(".");
    const extension = parts.length > 1 ? parts.pop() || "" : "";
    const secondExtension = parts.length > 1 ? parts.pop() || "" : "";
    if (RISKY_ATTACHMENT_EXTENSIONS.has(extension)) {
      add(3, "risky_attachment");
      break;
    }
    if (secondExtension && RISKY_ATTACHMENT_EXTENSIONS.has(secondExtension)) {
      add(3, "risky_double_extension");
      break;
    }
    if (ARCHIVE_ATTACHMENT_EXTENSIONS.has(extension)) {
      add(1, "archive_attachment");
      break;
    }
  }

  // --- Bulk headers vs legitimate list mail. ---
  const precedence = headerValues(input.headers, "precedence").join(" ").toLowerCase();
  if (precedence.includes("bulk") || precedence.includes("junk")) {
    add(1, "bulk_precedence");
  }
  if (headerValues(input.headers, "list-unsubscribe").length > 0) {
    score -= 2;
    reasons.push("list_unsubscribe:-2");
  }

  // --- Structural tells. ---
  const recipientCount = input.to.length + (input.cc || []).length;
  if (recipientCount > 20) {
    add(1, "many_recipients");
  }
  if (!input.messageId) {
    add(1, "no_message_id");
  }

  const clamped = Math.min(MAX_SPAM_SCORE, Math.max(0, score));
  return {
    score: clamped,
    isSpam: clamped >= threshold,
    threshold,
    reasons,
  };
}
