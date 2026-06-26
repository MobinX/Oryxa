export const metadata = {
  title: 'Oryxa API (Next.js)',
  description: 'Hono API served via Next.js App Router',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
