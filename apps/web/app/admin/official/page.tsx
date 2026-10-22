import Link from 'next/link';
import { Globe, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { requireConsoleBearer } from '@/lib/admin-access';
import { ApiError, adminOfficialChannels, adminOfficialSettings, type OfficialChannel } from '@/lib/api';
import {
  connectOfficialWhatsAppAction,
  disconnectOfficialChannelAction,
  saveOfficialSettingsAction,
  verifyOfficialChannelAction,
} from '@/app/actions/admin-official';

export const instant = false;

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp number',
  tiktok: 'TikTok',
};

export default async function OfficialChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const bearer = await requireConsoleBearer();
  const params = await searchParams;

  let channels: OfficialChannel[] = [];
  let settings: Awaited<ReturnType<typeof adminOfficialSettings>> | null = null;
  let loadError: string | null = null;
  try {
    [channels, settings] = await Promise.all([
      adminOfficialChannels(bearer).then((rows) => rows.channels),
      adminOfficialSettings(bearer),
    ]);
  } catch (err) {
    loadError = err instanceof ApiError ? `${err.status}: ${err.message}` : 'The API could not be reached';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <Globe className="h-6 w-6 text-primary" />
          Official channels
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          The messaging accounts that speak for OnlyOrders itself: a customer DMs them with a
          question about the platform, the AI answers as a person all day, and nothing here
          belongs to a store&apos;s storefront.
        </p>
      </div>

      {params.error && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {params.error === 'no-credentials'
            ? 'A WhatsApp number needs both the token and the phone number id.'
            : params.error === 'wa-verify'
              ? `Meta refused the token${params.detail ? `: ${params.detail}` : ''}`
              : params.error === 'saved'
                ? ''
                : `Failed${params.detail ? `: ${params.detail}` : ''}`}
        </Card>
      )}
      {params.saved && (
        <Card className="border-primary/30 p-4 text-sm">Settings saved.</Card>
      )}
      {params.disconnected && (
        <Card className="border-primary/30 p-4 text-sm">Channel disconnected.</Card>
      )}
      {params.verified === '1' && (
        <Card className="border-primary/30 p-4 text-sm">The platform confirmed this token: connected.</Card>
      )}
      {params.verified === '0' && (
        <Card className="border-amber-500/40 p-4 text-sm text-amber-600">
          The health check failed{params.detail ? `: ${params.detail}` : ''}. Reconnect to refresh the token.
        </Card>
      )}
      {params.connected === 'whatsapp' && (
        <Card className="border-primary/30 p-4 text-sm">WhatsApp number connected to Official channels.</Card>
      )}
      {loadError && (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">{loadError}</Card>
      )}

      {!loadError && (
        <>
          {channels.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2">
              {channels.map((channel) => (
                <li key={channel.id}>
                  <Card className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{channel.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {PLATFORM_LABEL[channel.platform] ?? channel.platform} ·{' '}
                          {channel.platformChannelId}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Connected {new Date(channel.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="mt-2 flex gap-3 text-xs">
                          <Link href="/admin/official/inbox" className="text-primary hover:underline">
                            Inbox
                          </Link>
                          <Link href="/admin/official/tickets" className="text-primary hover:underline">
                            Tickets
                          </Link>
                        </p>
                      </div>
                      <form action={verifyOfficialChannelAction} className="shrink-0">
                        <input type="hidden" name="channelId" value={channel.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          className="mb-2 h-7 px-2 text-xs"
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Health check
                        </Button>
                      </form>
                    </div>
                    <form action={disconnectOfficialChannelAction} className="mt-3">
                      <input type="hidden" name="channelId" value={channel.id} />
                      <Button type="submit" variant="outline" className="h-7 px-2 text-xs text-destructive">
                        Disconnect
                      </Button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {channels.length === 0 && (
            <Card className="py-10 text-center">
              <p className="font-semibold">No official channel yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Connect a Facebook Page the console already holds, or a WhatsApp number below.
                Customer DMs then arrive in the official inbox instead of any store.
              </p>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="text-base font-semibold">Connect WhatsApp</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              A manual token, the same verify step the merchant connect uses: the number is only
              stored if Graph actually answered for it.
            </p>
            <form action={connectOfficialWhatsAppAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input name="token" type="password" placeholder="Permanent access token" required />
              <Input name="phoneNumberId" placeholder="Phone number id" required />
              <Button type="submit">Connect</Button>
            </form>
          </Card>

          {settings && (
            <Card className="p-6">
              <h2 className="text-base font-semibold">How the official AI answers</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Availability is stated to every new customer in the AI&apos;s own words; disabling
                the AI leaves people to the operators alone.
              </p>
              <form action={saveOfficialSettingsAction} className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Availability</span>
                    <select
                      name="availability"
                      defaultValue={settings.availability}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="available">Available for new clients</option>
                      <option value="taking_onboarding_requests">
                        Not available — taking onboarding requests
                      </option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Availability note</span>
                    <Input
                      name="availabilityNote"
                      defaultValue={settings.availabilityNote ?? ''}
                      placeholder="e.g. backlog until August, only small storefronts"
                      maxLength={2000}
                    />
                  </label>
                  <div className="flex flex-col gap-2 pt-5 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="aiEnabled" defaultChecked={settings.aiEnabled} />
                      AI enabled
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="autoReply" defaultChecked={settings.autoReply} />
                      Auto-reply on new messages
                    </label>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Tone</span>
                    <Input name="tone" defaultValue={settings.tone ?? 'friendly'} maxLength={40} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">Language</span>
                    <Input name="language" defaultValue={settings.language ?? 'auto'} maxLength={20} />
                  </label>
                </div>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Instructions for the AI</span>
                  <Textarea
                    name="instructions"
                    rows={3}
                    defaultValue={settings.instructions ?? ''}
                    placeholder="Anything the AI must always follow when it answers the official inboxes."
                    maxLength={8000}
                  />
                </label>
                <Button type="submit">Save settings</Button>
              </form>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="text-base font-semibold">TikTok</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              TikTok Business Messages is not yet offered publicly, so OnlyOrders connects it
              when a public partner API exists. Nothing is faked in the meantime.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
