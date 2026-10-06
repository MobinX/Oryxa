'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { expireBusiness, expireBusinesses } from '@/app/_cache/tags';
import { requireAuth } from '@/lib/auth';
import { createBusiness, getBusiness, updateBusiness, deleteBusiness, hardDeleteBusiness } from '@/lib/api';
import { isStorePresetId, presetTheme, findPreset } from '@/lib/storefront-presets';
import { isStoreStructure } from '@/lib/storefront';


export async function createBusinessAction(formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!name) {
    redirect('/businesses/new?error=name');
  }

  const business = await createBusiness(token, {
    name,
    description: description || undefined,
    hasTradeLicense: false,
    hasTaxLicense: false,
  });

  revalidatePath('/businesses');
  expireBusinesses();
  redirect(`/b/${business.id}/dashboard`);
}

export async function updateBusinessAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const employeeCount = parseInt(String(formData.get('employeeCount') ?? ''), 10);

  await updateBusiness(token, businessId, {
    name: name || undefined,
    description: description || undefined,
    type: type || undefined,
    phone: phone || undefined,
    employeeCount: Number.isFinite(employeeCount) && employeeCount > 0 ? employeeCount : undefined,
  });

  revalidatePath('/businesses');
  revalidatePath(`/b/${businessId}`);
  expireBusiness(businessId);
  redirect(`/b/${businessId}/settings?saved=1`);
}

export async function updateStoreAction(businessId: string, formData: FormData) {
  const token = await requireAuth();
  const rawSlug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const storePublished = formData.get('storePublished') === 'on';

  const payload: Record<string, unknown> = { storePublished };
  if (rawSlug) {
    const slug = rawSlug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug.length >= 2) payload.slug = slug;
  }

  const theme: Record<string, string> = {};
  const tagline = String(formData.get('tagline') ?? '').trim();
  const accentColor = String(formData.get('accentColor') ?? '').trim();
  const heroImageUrl = String(formData.get('heroImageUrl') ?? '').trim();
  const logoUrl = String(formData.get('logoUrl') ?? '').trim();
  const font = String(formData.get('font') ?? '').trim();
  const layout = String(formData.get('layout') ?? '').trim();
  const structure = String(formData.get('structure') ?? '').trim();
  const preset = String(formData.get('preset') ?? '').trim();
  if (tagline) theme.tagline = tagline.slice(0, 280);
  if (/^#[0-9a-fA-F]{3,8}$/.test(accentColor)) theme.accentColor = accentColor;
  if (heroImageUrl) theme.heroImageUrl = heroImageUrl.slice(0, 1000);
  if (logoUrl) theme.logoUrl = logoUrl.slice(0, 1000);
  if (font === 'sans' || font === 'serif' || font === 'mono') theme.font = font;
  if (layout === 'grid' || layout === 'featured') theme.layout = layout;
  // updateBusiness replaces the whole storeTheme column, so anything this form does not
  // resend is deleted — the template and the preset it came from have to travel with it.
  if (isStoreStructure(structure)) theme.structure = structure;
  if (isStorePresetId(preset)) theme.preset = preset;
  payload.storeTheme = theme;

  await updateBusiness(token, businessId, payload);

  revalidatePath(`/b/${businessId}/settings`);
  expireBusiness(businessId);
  redirect(`/b/${businessId}/settings?saved=1`);
}

export async function deleteBusinessAction(businessId: string) {
  const token = await requireAuth();
  await deleteBusiness(token, businessId);
  revalidatePath('/businesses');
  expireBusiness(businessId);
  redirect('/businesses');
}

export async function hardDeleteBusinessAction(businessId: string) {
  const token = await requireAuth();
  await hardDeleteBusiness(token, businessId);
  revalidatePath('/businesses');
  expireBusiness(businessId);
  redirect('/businesses');
}

export async function deleteBusinessesBulkAction(formData: FormData) {
  const token = await requireAuth();
  const ids = formData.getAll('businessIds') as string[];
  await Promise.all(
    ids.map((id) => deleteBusiness(token, id).catch(() => null)),
  );
  revalidatePath('/businesses');
  expireBusinesses();
  for (const id of ids) expireBusiness(id);
}

/**
 * Applies one of the five storefront presets.
 *
 * `store_theme` is replaced whole on write (`packages/db/crud/business.ts`), so this reads
 * the live business and merges over it — otherwise picking a theme would silently delete a
 * tagline, hero photo or logo saved minutes earlier. It reads through `getBusiness` rather
 * than the cached helper because that cache lives for hours, and a stale copy here is data
 * loss rather than a slightly old picture.
 *
 * Only `storeTheme` is sent: the update schema is `.partial()`, so absent columns keep their
 * values. `slug` in particular must not be echoed back, because a merchant who never filled
 * it in has `null`, and the create-side slug regex rejects that.
 */
export async function applyPresetAction(businessId: string, presetId: string) {
  const token = await requireAuth();
  if (!isStorePresetId(presetId)) {
    redirect(`/b/${businessId}/storefront?error=unknown-theme`);
  }

  const preset = findPreset(presetId);
  if (!preset) redirect(`/b/${businessId}/storefront?error=unknown-theme`);

  const current = await getBusiness(token, businessId).catch(() => null);
  if (!current) redirect(`/b/${businessId}/storefront?error=store-unavailable`);

  await updateBusiness(token, businessId, {
    storeTheme: { ...(current.storeTheme ?? {}), ...presetTheme(preset) },
  });

  revalidatePath(`/b/${businessId}/storefront`);
  revalidatePath(`/b/${businessId}/settings`);
  expireBusiness(businessId);
  // The theme survives as `preset`, so reloads light up the right tile even after the
  // values themselves have been tuned by hand somewhere else.
  redirect(`/b/${businessId}/storefront?preset=${preset.id}&frame=wide&saved=1`);
}
