import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { requireConsoleBearer } from '@/lib/admin-access';
import {
  ApiError,
  listAdminAiChannels,
  getAdminAiChannelConfig,
  getAdminBusinessProfile,
  listAdminKnowledge,
  type AdminAiChannel,
  type AdminAiChannelRow,
  type AdminBusinessProfile,
  type AdminKnowledgeEntry,
} from '@/lib/api';
import { ChannelConfigForm } from './channel-config-form';
import { BusinessProfileForm } from './business-profile-form';
import { KnowledgeEditor } from './knowledge-editor';
import { SandboxPreview } from './sandbox-preview';

export const instant = false;

/** Every text block the AI Studio composes answers from (spec B). One channel at a time. */
export default async function AdminAiStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ ch?: string }>;
}) {
  const bearer = await requireConsoleBearer();
  const { ch } = await searchParams;

  let channels: AdminAiChannel[] = [];
  let loadError: string | null = null;
  try {
    channels = (await listAdminAiChannels(bearer)).channels;
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  const active: AdminAiChannel | undefined =
    channels.find((channel) => channel.id === ch) ??
    channels.find((channel) => !channel.isAdminOnly && channel.businessId) ??
    channels[0];

  let config: AdminAiChannelRow | null = null;
  let profile: AdminBusinessProfile | null = null;
  let knowledge: AdminKnowledgeEntry[] = [];
  if (active) {
    const [configRes, profileRes, knowledgeRes] = await Promise.all([
      getAdminAiChannelConfig(bearer, active.id).catch(() => null),
      active.businessId ? getAdminBusinessProfile(bearer, active.businessId).catch(() => null) : Promise.resolve(null),
      active.businessId ? listAdminKnowledge(bearer, active.businessId).catch(() => null) : Promise.resolve(null),
    ]);
    config = configRes?.config ?? null;
    profile = profileRes?.profile ?? null;
    knowledge = knowledgeRes?.entries ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Sparkles className="h-6 w-6 text-primary" />
          AI Studio
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          What the AI knows and how it answers: the business profile, the shared FAQ, capacity
          wording, per-channel toggles and instructions. Nothing here is prefilled with invented
          data — it answers only from what is written on this page and the store&apos;s catalog.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}
      {!loadError && channels.length === 0 && (
        <Card className="py-12 text-center">
          <p className="font-semibold">No channels yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connect a channel first — <Link href="/admin/channels" className="text-primary underline">Channels</Link>.
          </p>
        </Card>
      )}

      {channels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => (
            <Link
              key={channel.id}
              href={channel.id === active?.id ? '#' : `/admin/ai-studio?ch=${channel.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium sm:text-sm ${
                channel.id === active?.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              {channel.platform}
              {channel.isAdminOnly ? ' (admin)' : ` · ${channel.businessName ?? 'unassigned'}`}
            </Link>
          ))}
        </div>
      )}

      {active && (
        <div className="space-y-6">
          <SandboxPreview bearer={bearer} channelId={active.id} />
          <ChannelConfigForm bearer={bearer} channelId={active.id} config={config} />
          {active.businessId && (
            <>
              <BusinessProfileForm bearer={bearer} businessId={active.businessId} profile={profile} />
              <KnowledgeEditor bearer={bearer} businessId={active.businessId} entries={knowledge} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
