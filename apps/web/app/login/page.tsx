import { AuthForm } from '@/components/auth-form';
import { getBrand } from '@/lib/brand-server';
import { socialMetadata } from '@/lib/seo';

export async function generateMetadata() {
  const { companyName } = await getBrand();
  const title = `Sign in — ${companyName}`;
  const description = 'Sign in or create an account to manage your AI-powered e-commerce store.';
  return {
<<<<<<< HEAD
    title: `Sign in — ${companyName}`,
    description: 'Sign in or create an account to manage your AI-powered e-commerce store.',
    robots: { index: false, follow: false },
=======
    title,
    description,
    alternates: { canonical: '/login' },
    robots: { index: false, follow: false },
    ...socialMetadata({ title, description, path: '/login', siteName: companyName }),
>>>>>>> origin/main
  };
}

/** Brand shell is request-derived, so this route may block. */
export const instant = false;

/** Brand shell is request-derived, so this route may block. */
export const instant = false;

export default async function LoginPage() {
  const { companyName } = await getBrand();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] p-4">
      {/* Logo & Hero */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] text-white font-bold text-2xl shadow-lg mb-4">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">{companyName}</h1>
        <p className="mt-2 text-[var(--muted-foreground)] text-sm max-w-xs">
          AI-powered sales automation for your e-commerce store
        </p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl p-7">
        <AuthForm />
      </div>

      <p className="mt-8 text-xs text-[var(--muted-foreground)] text-center max-w-sm">
        By continuing, you agree to our{' '}
        <a href="/terms" className="underline hover:text-[var(--foreground)]">Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" className="underline hover:text-[var(--foreground)]">Privacy Policy</a>.
      </p>
    </div>
  );
}
