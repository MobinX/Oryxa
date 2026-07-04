import { AuthForm } from '@/components/auth-form';

export const metadata = {
  title: 'Sign in — Oryxa',
  description: 'Sign in or create an account to manage your AI-powered e-commerce store.',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--background)] to-[var(--muted)] p-4">
      {/* Logo & Hero */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] text-white font-bold text-2xl shadow-lg mb-4">
          O
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Oryxa</h1>
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
