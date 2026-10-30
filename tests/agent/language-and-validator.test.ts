import { describe, expect, it } from 'vitest';
import {
  detectTurnLanguage,
  classifyTurnIntent,
  stripEmDashes,
  stripPhotoCodes,
  validateAndSanitizeReply,
} from '@repo/shared';
import { parseVariantAttributes } from '@agent/tools';

describe('P1 Language Detection & Preservation', () => {
  it('detects Bangla script as bn', () => {
    expect(detectTurnLanguage('এই শার্টটিতে কয়টি কালার এবং কয়টি সাইজ আছে?')).toBe('bn');
  });

  it('detects Banglish (Latin letters) as bn', () => {
    expect(detectTurnLanguage('Ei Oxford shirt tay koyta color ar koyta size ache?')).toBe('bn');
    expect(detectTurnLanguage('Amake 2ta Classic Oxford Shirt dao. Phone: 01711223344')).toBe('bn');
  });

  it('detects standard English as en', () => {
    expect(detectTurnLanguage('How many colors and sizes does this shirt come in?')).toBe('en');
    expect(detectTurnLanguage('Is the Classic Oxford Shirt available in XL?')).toBe('en');
  });

  it('does not classify pure English with generic words as Banglish', () => {
    expect(detectTurnLanguage('I sent bKash money, TrxID 8XK2M4Q1, please confirm order')).toBe('en');
    expect(detectTurnLanguage('what do you sell?')).toBe('en');
    expect(detectTurnLanguage('is there a red t-shirt?')).toBe('en');
    expect(detectTurnLanguage('What is the price and delivery charge?')).toBe('en');
  });

  it('still detects real Banglish as bn', () => {
    expect(detectTurnLanguage('ami lal order korechilam kintu nil peyechi, refund chai')).toBe('bn');
    expect(detectTurnLanguage('classic tee er dam koto? lal ache?')).toBe('bn');
  });

  it('classifies TrxID messages by language markers, not loanwords', () => {
    // Pure English with generic loanwords stays 'en'
    expect(detectTurnLanguage('I sent bKash money, TrxID 8XK2M4Q1, please confirm order')).toBe('en');
    // Banglish with strong verb markers (korechi/korun) is 'bn' despite English loanwords
    expect(detectTurnLanguage('ami bkash korechi, trxid 8XK2M4Q1, order confirm korun')).toBe('bn');
  });

  it('preserves previous language on short turns like "ok" or numbers', () => {
    expect(detectTurnLanguage('ok', { lastReplyLanguage: 'en' })).toBe('en');
    expect(detectTurnLanguage('ok', { lastReplyLanguage: 'bn' })).toBe('bn');
    expect(detectTurnLanguage('2', { lastReplyLanguage: 'bn' })).toBe('bn');
  });

  it('respects explicit language overrides', () => {
    expect(detectTurnLanguage('Ami jante chai, please reply in English: dam koto?')).toBe('en');
    expect(detectTurnLanguage('Please answer in English')).toBe('en');
    expect(detectTurnLanguage('Please speak in English')).toBe('en');
  });
});

describe('P2 Em-Dash, Code & Narration Sanitization', () => {
  it('replaces em-dashes and en-dashes cleanly with commas', () => {
    expect(stripEmDashes('Classic Oxford Shirt — Black M — $29.99')).toBe(
      'Classic Oxford Shirt, Black M, $29.99',
    );
    expect(stripEmDashes('Delivery time – 2 to 3 days')).toBe(
      'Delivery time, 2 to 3 days',
    );
  });

  it('strips photo codes and tool narration in validator', () => {
    const input = 'Here is your product: Classic Oxford Shirt #AFG23 with id 8f14e45f-ceea-467f-a8f0-000000000001. I have sent the card to you — please check.';
    const result = validateAndSanitizeReply(input, { expectedLanguage: 'en' });
    expect(result.sanitizedText).not.toContain('8f14e45f-ceea-467f-a8f0-000000000001');
    expect(result.sanitizedText).not.toContain('—');
    expect(result.sanitizedText).not.toContain('#AFG23');
  });

  it('flags SILENT violations if expected silent comment', () => {
    const result = validateAndSanitizeReply('Hello friend', { isSilentExpected: true });
    expect(result.sanitizedText).toBe('SILENT');
    expect(result.isValid).toBe(false);
    expect(result.violations).toContain('R3_SILENT_VIOLATION');
  });
});

describe('P3 Variant Attribute Parsing', () => {
  it('parses color and size from variant name strings', () => {
    expect(parseVariantAttributes('Classic Oxford Shirt - Black M')).toEqual({
      color: 'Black',
      size: 'M',
    });
    expect(parseVariantAttributes('Navy XL')).toEqual({
      color: 'Navy',
      size: 'XL',
    });
    expect(parseVariantAttributes('White Small')).toEqual({
      color: 'White',
      size: 'Small',
    });
  });
});

describe('Turn Intent Classifier', () => {
  it('classifies silent comments on friend tags', () => {
    expect(classifyTurnIntent('@Rafiq Ahmed dekh ei shirt ta tor jonno onek valo hobe!')).toBe('comment_silent');
  });

  it('classifies order postbacks and order actions', () => {
    expect(classifyTurnIntent('place order with 8f14e45f-ceea-467f-a8f0-000000000001 and Shirt')).toBe('button_order');
    expect(classifyTurnIntent('please track order with id 9a14e45f-ceea-467f-a8f0-000000000098')).toBe('order_track');
    expect(classifyTurnIntent('Please cancel my order.')).toBe('order_cancel');
    expect(classifyTurnIntent('Please change my delivery address to Uttara')).toBe('order_update');
  });

  it('classifies rejection and option queries', () => {
    expect(classifyTurnIntent("I don't like this color, show me different ones.")).toBe('reject_color');
    expect(classifyTurnIntent("This size doesn't suit me.")).toBe('reject_size');
    expect(classifyTurnIntent('Ei Oxford shirt tay koyta color ar koyta size ache?')).toBe('product_options_query');
    expect(classifyTurnIntent('Do you have #AFG23 in stock?')).toBe('photo_code');
  });
});
