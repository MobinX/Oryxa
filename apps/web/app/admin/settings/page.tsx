import { KeyRound } from 'lucide-react';
import { redirect } from 'next/navigation';
import { logsBearer, operatorAccountEmail } from '@/lib/logs-session';
import { AdminPageHeader } from '@/components/admin-page-header';
import { COMPANY_NAME } from '@/lib/brand';
import { PasswordSettingsForm } from './password-form';

export const metadata = {
  title: 'Admin — settings',
  description: `The ${COMPANY_NAME} console operator's account settings.`,
};

/**
 * The one page that changes who can walk in, so it opens only behind the console session.
 *
 * The password here belongs to the Firebase account the console signs in as — the same account
 * `apps/api/scripts/create-operator.ts` created and the same one that owns the sandbox store. It is
 * changed in the browser by Firebase itself after the operator proves the current one, so the new
 * password never crosses this app's servers.
 *
 * It is deliberately not the console cookie's secret: `LOGS_UI_PASSWORD` signs every operator
 * session and lives in env on two apps. Rotating that is a deploy, not a form — mixing the two on
 * one page would make an env change look like it had happened because a box was filled in.
 */
export const instant = false;

export default async function SettingsPage() {
  if (!(await logsBearer())) redirect('/admin/login');
  const operatorEmail = operatorAccountEmail();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={KeyRound}
        title="Settings"
        description={
          <span>
            The operator account — <code>{operatorEmail}</code> — signs into this console and owns
            the sandbox store. Changing its password changes what you type at the sign-in page; it
            does not touch the session this browser is already holding.
          </span>
        }
      />

      <PasswordSettingsForm operatorEmail={operatorEmail} />

      <p className="text-xs text-muted-foreground">
        After a change, sign-ins from other browsers need the new password. If this browser is not
        holding the operator account, the form refuses — sign in again at{' '}
        <code>/admin/login</code> first.
      </p>
    </div>
  );
}
