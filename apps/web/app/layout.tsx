import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Oryxa — AI Commerce',
  description: 'Multi-channel AI auto-reply for e-commerce',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
