import { headers } from 'next/headers';
import { brandFromHeaders, type BrandInfo } from '@/lib/brand';

/** The request's brand, from the headers the middleware stamped onto it. */
export async function getBrand(): Promise<BrandInfo> {
  return brandFromHeaders(await headers());
}
