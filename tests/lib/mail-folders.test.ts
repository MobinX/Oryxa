import { describe, it, expect } from 'vitest';
import { mailHref, readFolder } from '../../apps/web/lib/mail-query';

describe('mail folders (apps/web/lib/mail-query.ts)', () => {
  it('reads the trash folder param', () => {
    expect(readFolder('trash')).toBe('trash');
    expect(readFolder(['trash'])).toBe('trash');
  });

  it('falls back to inbox for unknown folders', () => {
    expect(readFolder('spam')).toBe('inbox');
    expect(readFolder(undefined)).toBe('inbox');
  });

  it('keeps existing folders working', () => {
    expect(readFolder('inbox')).toBe('inbox');
    expect(readFolder('sent')).toBe('sent');
    expect(readFolder('all')).toBe('all');
  });

  it('builds trash hrefs like other folders', () => {
    expect(mailHref({ folder: 'trash' })).toBe('/mails?folder=trash');
    expect(mailHref({ folder: 'trash', q: 'invoice', offset: 40 })).toBe(
      '/mails?folder=trash&q=invoice&offset=40',
    );
  });
});
