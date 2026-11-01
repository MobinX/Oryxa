import { redirect } from 'next/navigation';
import { Mail } from 'lucide-react';
import { ConsoleLoginForm } from '@/components/console-login-form';
import { getActiveConsoleUser } from '@/lib/console-session';
import { consoleCan } from '@/lib/console-capabilities';
import { getBrand } from '@/lib/brand-server';

export const instant = false;

export async function generateMetadata() {
  const { companyName } = await getBrand();
  return {
    title: `Mail — sign in — ${companyName}`,
    description: `Sign in to the ${companyName} admin mailbox.`,
  };
}

export default async function MailLoginPage() {
  const user = await getActiveConsoleUser();
  if (user) redirect(consoleCan(user, 'inbox') ? '/mails' : '/admin');

  const { companyName } = await getBrand();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border/40 bg-card/70">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-geist text-base font-bold text-primary-foreground shadow-md shadow-primary/20">
            O
          </span>
          <span className="font-geist text-base font-bold tracking-tight sm:text-lg">
            {companyName}
          </span>
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mail
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-7 shadow-xl">
          <div className="mb-6 text-center">
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Mail className="h-6 w-6" />
            </span>
            <h1 className="font-geist text-xl font-bold tracking-tight">Mail sign in</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Use the same admin account that opens the console. It reads the same mailbox, without
              the rest of the admin workspace.
            </p>
          </div>

          <ConsoleLoginForm endpoint="/api/admin/login" nextPath="/mails" />

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Accounts are created and reset by the superuser in the admin console.
          </p>
        </div>
      </main>
    </div>
  );
}
