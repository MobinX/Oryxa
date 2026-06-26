import { signOutAction } from '@/app/actions/auth';

export function SignOutForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
