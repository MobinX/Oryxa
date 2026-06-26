import { Card } from '@/components/ui/card';
import { GoogleSignInButton } from '@/components/google-sign-in';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white p-4">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-[var(--primary)]">Oryxa</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          AI-powered customer support for your e-commerce store
        </p>
        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      </Card>
    </div>
  );
}
