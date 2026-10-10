import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';

/**
 * A cached console read that may fail, as a value the page can branch on. A thrown error
 * inside a page shows Next's default screen, which is the wrong answer for an operator
 * console: the reader needs to know whether to sign in again, whether the row is gone, or
 * whether the API is simply down. At most one field is ever set.
 */
export type Read<T> = { value?: T; error?: string; missing?: boolean };

export async function adminRead<T>(load: () => Promise<T>): Promise<Read<T>> {
  try {
    return { value: await load() };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/admin/login');
    // A 404 is an answer, not an outage: the store was deleted, or the id was typed.
    if (err instanceof ApiError && err.status === 404) return { missing: true };
    if (err instanceof ApiError) return { error: `${err.status}: ${err.message}` };
    return { error: 'The API could not be reached' };
  }
}
