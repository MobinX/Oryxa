'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireConsoleBearer } from '@/lib/admin-access';
import {
  adminOfficialConnectWhatsApp,
  adminOfficialDisconnectChannel,
  adminOfficialPatchProspect,
  adminOfficialPatchTicket,
  adminOfficialReply,
  adminOfficialSaveSettings,
  adminOfficialTakeover,
  adminOfficialVerifyChannel,
  adminOfficialWeights,
  ApiError,
} from '@/lib/api';

/** One detail → the page's error slot; a control-flow redirect never rides the catch. */
function detail(err: unknown): string {
  const message =
    err instanceof ApiError || err instanceof Error
      ? err.message
      : 'The request did not arrive';
  return encodeURIComponent(message);
}

export async function saveOfficialSettingsAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  try {
    await adminOfficialSaveSettings(bearer, {
      availability: formData.get('availability') === 'taking_onboarding_requests'
        ? 'taking_onboarding_requests'
        : undefined,
      availabilityNote: formData.has('availabilityNote')
        ? String(formData.get('availabilityNote') || '').slice(0, 2000) || null
        : undefined,
      aiEnabled: formData.has('aiEnabled') ? formData.get('aiEnabled') === 'on' : undefined,
      autoReply: formData.has('autoReply') ? formData.get('autoReply') === 'on' : undefined,
      tone: formData.has('tone') ? String(formData.get('tone') || '').slice(0, 40) || null : undefined,
      language: formData.has('language') ? String(formData.get('language') || '').slice(0, 20) || null : undefined,
      instructions: formData.has('instructions')
        ? String(formData.get('instructions') || '').slice(0, 8000) || null
        : undefined,
    });
  } catch (err) {
    redirect(`/admin/official?error=${detail(err)}`);
  }
  revalidatePath('/admin/official');
  redirect('/admin/official?saved=1');
}

export async function connectOfficialWhatsAppAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const token = String(formData.get('token') || '').trim();
  const phoneNumberId = String(formData.get('phoneNumberId') || '').trim();
  if (!token || !phoneNumberId) {
    redirect('/admin/official?error=no-credentials');
  }
  try {
    const result = await adminOfficialConnectWhatsApp(bearer, {
      token: token.slice(0, 900),
      phoneNumberId: phoneNumberId.slice(0, 120),
    });
    if (result.verified === false || result.error) {
      redirect(`/admin/official?error=wa-verify&detail=${encodeURIComponent(result.error ?? 'Meta refused the token')}`);
    }
  } catch (err) {
    redirect(`/admin/official?error=connect&detail=${detail(err)}`);
  }
  revalidatePath('/admin/official');
  redirect('/admin/official?connected=whatsapp');
}

export async function verifyOfficialChannelAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const channelId = String(formData.get('channelId') || '');
  try {
    const result = await adminOfficialVerifyChannel(bearer, channelId);
    redirect(`/admin/official?verified=${result.verified ? 1 : 0}${result.error ? `&detail=${encodeURIComponent(result.error)}` : ''}`);
  } catch (err) {
    redirect(`/admin/official?error=verify&detail=${detail(err)}`);
  }
}

export async function disconnectOfficialChannelAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const channelId = String(formData.get('channelId') || '');
  try {
    await adminOfficialDisconnectChannel(bearer, channelId);
  } catch (err) {
    redirect(`/admin/official?error=disconnect&detail=${detail(err)}`);
  }
  revalidatePath('/admin/official');
  redirect('/admin/official?disconnected=1');
}

export async function officialReplyAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const conversationId = String(formData.get('conversationId') || '');
  const content = String(formData.get('content') || '').slice(0, 4000).trim();
  const paused = formData.get('pauseAi') === 'on';
  if (!content) redirect(`/admin/official/inbox/${conversationId}?error=empty`);
  try {
    await adminOfficialReply(bearer, conversationId, content, paused ? true : false);
  } catch (err) {
    redirect(`/admin/official/inbox/${conversationId}?error=${detail(err)}`);
  }
  revalidatePath(`/admin/official/inbox/${conversationId}`);
  redirect(`/admin/official/inbox/${conversationId}`);
}

export async function officialTakeoverAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const conversationId = String(formData.get('conversationId') || '');
  const paused = formData.get('paused') === '1';
  try {
    await adminOfficialTakeover(bearer, conversationId, paused);
  } catch (err) {
    redirect(`/admin/official/inbox/${conversationId}?error=${detail(err)}`);
  }
  revalidatePath(`/admin/official/inbox/${conversationId}`);
  redirect(`/admin/official/inbox/${conversationId}`);
}

export async function officialTicketPatchAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const ticketId = String(formData.get('ticketId') || '');
  const status = formData.get('status');
  const priority = formData.get('priority');
  const notes = formData.get('notes');
  try {
    await adminOfficialPatchTicket(bearer, ticketId, {
      ...(status ? { status: String(status) } : {}),
      ...(priority ? { priority: String(priority) } : {}),
      ...(notes !== null ? { notes: String(notes || '').slice(0, 8000) || null } : {}),
    });
  } catch (err) {
    redirect(`/admin/official/tickets?error=${detail(err)}`);
  }
  revalidatePath('/admin/official/tickets');
  redirect(`/admin/official/tickets?saved=${ticketId ? '1' : '0'}`);
}

export async function officialProspectPatchAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const prospectId = String(formData.get('prospectId') || '');
  const status = formData.get('status');
  const notes = formData.get('notes');
  const back = String(formData.get('back') || '/admin/official/prospects');
  try {
    await adminOfficialPatchProspect(bearer, prospectId, {
      ...(status ? { status: String(status) } : {}),
      ...(notes !== null ? { notes: String(notes || '').slice(0, 8000) || null } : {}),
    });
  } catch (err) {
    redirect(`${back}?error=${detail(err)}`);
  }
  revalidatePath(back);
  redirect(back);
}

export async function officialWeightsAction(formData: FormData) {
  const bearer = await requireConsoleBearer();
  const numeric = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || String(raw).trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(10, Math.round(value))) : undefined;
  };
  try {
    await adminOfficialWeights(bearer, {
      name: numeric('name'),
      country: numeric('country'),
      businessType: numeric('businessType'),
      employeesEstimate: numeric('employeesEstimate'),
      budget: numeric('budget'),
      needs: numeric('needs'),
    });
  } catch (err) {
    redirect(`/admin/official/prospects?error=${detail(err)}`);
  }
  revalidatePath('/admin/official/prospects');
  redirect('/admin/official/prospects?weights=1');
}
