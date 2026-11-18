import type { Metadata } from "next";

/** Full content page: indexable, canonical to itself. */
export const metadata: Metadata = {
  title: "Developers",
  description:
    "Connect Facebook Messenger, Instagram and WhatsApp to OnlyOrders: how channel integrations work, which APIs are used, and how to request API access.",
  alternates: { canonical: "/developers" },
  robots: { index: true, follow: true },
};

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
