/**
 * Docs content model. Articles are plain data (no @/ imports) so vitest can
 * verify them without the Next alias. Copy takes the company name as a
 * parameter — visible text must never hardcode a brand.
 */

export type DocsSection = {
  heading: string;
  body: string[];
  steps?: string[];
};

export type DocsArticle = {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: DocsSection[];
};

const UPDATED = "8 November 2026";

export const DOC_SLUGS = [
  "getting-started",
  "connect-facebook-instagram",
  "connect-whatsapp",
  "catalog-products",
  "ai-auto-replies",
  "inbox-orders",
  "storefront",
  "plans-billing",
  "faq",
] as const;

export type DocSlug = (typeof DOC_SLUGS)[number];

export function getDocsArticles(companyName: string): DocsArticle[] {
  return [
    {
      slug: "getting-started",
      title: "Getting started",
      description: `Create your account, add your first business, and take your first order with ${companyName} — in about ten minutes.`,
      updated: UPDATED,
      sections: [
        {
          heading: "How it works",
          body: [
            `${companyName} connects your Facebook Page, Instagram account, and WhatsApp number to one inbox. An AI agent reads your product catalog and answers common questions — price, availability, delivery — so chats turn into confirmed orders while you focus on fulfilment.`,
          ],
        },
        {
          heading: "Setup in five steps",
          body: [],
          steps: [
            "Create your account from the Start Free button and sign in.",
            "Open Businesses and choose New — give your store a name and a one-line description of what you sell.",
            "Connect at least one sales channel (Facebook, Instagram, or WhatsApp) by following the on-screen connect flow.",
            "Add your products with names, prices, and categories so the AI answers from real data.",
            "Switch the AI agent on, then send your Page a test message from a personal account to watch it reply.",
          ],
        },
        {
          heading: "What happens next",
          body: [
            "Every new chat lands in your inbox with the customer's question, the products the AI suggested, and — when the customer confirms — a structured order you can fulfil. Work through the rest of these guides to set up each part properly.",
          ],
        },
      ],
    },
    {
      slug: "connect-facebook-instagram",
      title: "Connect Facebook & Instagram",
      description:
        "Link your Facebook Page and Instagram account so the AI can reply to Messenger and Instagram DMs.",
      updated: UPDATED,
      sections: [
        {
          heading: "Before you begin",
          body: [
            "You need admin access to the Facebook Page you want to connect. Instagram works through its linked Facebook Page, so connect the Page first — the Instagram account comes with it.",
          ],
        },
        {
          heading: "Connect a Page",
          body: [],
          steps: [
            "Sign in and open your business dashboard.",
            "Start the Facebook connect flow and log in with the Facebook account that admins the Page.",
            "Pick your Page from the list. Pages you manage personally and pages under a business portfolio are grouped separately — choose each Page you sell through.",
            "Approve the requested permissions. The app needs them to read incoming messages and send replies on your behalf — without them, auto-reply cannot work.",
            "Finish the flow and wait for the success confirmation. Connection is automatic from here, including the webhook setup.",
          ],
        },
        {
          heading: "Test it",
          body: [
            "Send your Page a message from a personal Facebook account — for example, ask the price of one of your products. You should see the reply in seconds, and the conversation should appear in your inbox.",
          ],
        },
        {
          heading: "If replies stop",
          body: [
            "Replies stop when Facebook revokes access — usually after a password change or a removed admin. Open the channel settings for that business, disconnect, and connect the Page again. Past conversations and orders are kept.",
          ],
        },
      ],
    },
    {
      slug: "connect-whatsapp",
      title: "Connect WhatsApp",
      description:
        "Attach your WhatsApp business number so customers can ask, order, and get updates on chat.",
      updated: UPDATED,
      sections: [
        {
          heading: "What you need",
          body: [
            "WhatsApp selling runs on the WhatsApp Cloud API, which requires a business phone number that can receive a verification code. A number already used in the WhatsApp or WhatsApp Business app must be migrated first — the connect flow tells you when that applies.",
          ],
        },
        {
          heading: "Connect your number",
          body: [],
          steps: [
            "Sign in and open your business dashboard.",
            "Start the WhatsApp connect flow and enter the business phone number.",
            "Complete Meta's verification steps in the popup, including the code sent to the number.",
            "Return to the dashboard and confirm the number shows as connected.",
            "Send the number a test message from your own phone and confirm the AI replies.",
          ],
        },
        {
          heading: "Good to know",
          body: [
            "WhatsApp applies its own messaging rules outside active conversations — for example, order updates and follow-ups may need approved message templates. Your inbox always shows which chats are currently replyable, so you never guess.",
          ],
        },
      ],
    },
    {
      slug: "catalog-products",
      title: "Add your product catalog",
      description:
        "Products with clear names, prices, and categories are what the AI answers from. Keep them accurate.",
      updated: UPDATED,
      sections: [
        {
          heading: "Why the catalog matters",
          body: [
            "The AI agent never invents prices or availability — it answers strictly from the products you add here. A clean catalog means correct answers; a stale one means corrections you have to make by hand.",
          ],
        },
        {
          heading: "Add products",
          body: [],
          steps: [
            "Open your business, then go to Products.",
            "Add each product with its exact selling name, price, and SKU if you use one.",
            "Assign a category (for example: Abaya, Sharee, Kurti) so customers can browse and the AI can narrow suggestions.",
            "Add clear photos where the form asks for them — chats convert far better with pictures.",
            "Update prices and availability the moment they change in your shop.",
          ],
        },
        {
          heading: "Categories",
          body: [
            "Keep the category list short — under a dozen. Broad, stable categories (by garment type or collection) work better than one category per design, because customers browse them in your storefront too.",
          ],
        },
      ],
    },
    {
      slug: "ai-auto-replies",
      title: "AI auto-replies",
      description:
        "How the agent answers, when it hands off to you, and how to keep it accurate.",
      updated: UPDATED,
      sections: [
        {
          heading: "What the agent handles",
          body: [
            "The agent greets customers, answers price and availability questions from your catalog, shares product details and photos, collects delivery information, and confirms orders. It works the same way across Messenger, Instagram, and WhatsApp, around the clock.",
          ],
        },
        {
          heading: "You stay in control",
          body: [
            "You can open any conversation in the inbox and reply yourself at any time — the agent steps aside the moment you take over. Turn the agent on or off per business from your dashboard whenever you want a fully manual day, for example during a live sale.",
          ],
        },
        {
          heading: "Keeping answers sharp",
          body: [
            "Three habits keep quality high: keep the catalog current, write the business description like you would explain your shop to a new customer, and skim the inbox daily for the first week to catch anything the agent phrased poorly. Report confusing answers to support so the product keeps improving.",
          ],
        },
      ],
    },
    {
      slug: "inbox-orders",
      title: "Inbox & orders",
      description:
        "One inbox for every channel, and orders that build themselves from confirmed chats.",
      updated: UPDATED,
      sections: [
        {
          heading: "One inbox",
          body: [
            "Messenger, Instagram, and WhatsApp conversations appear side by side, each labelled with its channel. Search finds chats and orders by customer name, product, or keyword.",
          ],
        },
        {
          heading: "From chat to order",
          body: [
            "When a customer confirms — name, phone, address, items, cash on delivery — the order is captured with everything needed for fulfilment. Review it in Orders, pack, and mark it as you go.",
          ],
        },
        {
          heading: "Manual orders",
          body: [
            "Phone and walk-in sales belong in the same system. Open Orders, choose New, pick the customer and items from your catalog, and save — reporting stays complete even for offline sales.",
          ],
        },
      ],
    },
    {
      slug: "storefront",
      title: "Your storefront",
      description:
        "Every business gets a shareable store link that stays in sync with your catalog.",
      updated: UPDATED,
      sections: [
        {
          heading: "Share one link everywhere",
          body: [
            "Your storefront is a mobile-first shop page generated from your products and categories. Put the link in your Page bio, Instagram bio, ad buttons, and WhatsApp greeting so every channel points at the same shelf.",
          ],
        },
        {
          heading: "Checkout today",
          body: [
            "Customers check out with cash on delivery: they confirm name, phone, and address, and the order lands in your Orders list alongside chat-confirmed sales.",
          ],
        },
        {
          heading: "Keep it fresh",
          body: [
            "The storefront mirrors your catalog automatically — add a product once and it appears in both the AI's answers and the store. Out-of-date prices are the most common storefront complaint, and the fix is always the same catalog edit.",
          ],
        },
      ],
    },
    {
      slug: "plans-billing",
      title: "Plans & billing",
      description:
        "Start free, upgrade when order volume says so. Current prices live on the pricing page.",
      updated: UPDATED,
      sections: [
        {
          heading: "Start free",
          body: [
            `${companyName} is free to start: connect a channel, add your catalog, and take real orders before paying anything. Paid plans raise the limits — conversations, products, and seats — as your shop grows.`,
          ],
        },
        {
          heading: "Choose a plan",
          body: [
            "Open the pricing page for the current plans and limits, then upgrade from your dashboard at any time. Downgrades take effect at the next cycle, and you keep your data either way.",
          ],
        },
        {
          heading: "Questions about a charge",
          body: [
            "For anything billing-related — invoices, failed payments, plan changes — contact support with your account email and business name, and include the charge date and amount.",
          ],
        },
      ],
    },
    {
      slug: "faq",
      title: "FAQ & troubleshooting",
      description: "Quick answers to the questions every new seller asks.",
      updated: UPDATED,
      sections: [
        {
          heading: "The AI is not replying",
          body: [
            "Check three things in order: the channel still shows as connected in your dashboard, the agent is switched on for that business, and the test message came from a different account than the Page admin. Nine times out of ten, reconnecting the channel fixes it.",
          ],
        },
        {
          heading: "Can I reply myself?",
          body: [
            "Yes — open any conversation and type. The agent pauses while you handle it personally, which is ideal for custom orders, complaints, and regulars who expect you by name.",
          ],
        },
        {
          heading: "Which languages does it speak?",
          body: [
            `The agent converses in English and Bengali, matching the customer's language — including Banglish. Your catalog names stay exactly as you typed them, so product names never get mistranslated.`,
          ],
        },
        {
          heading: "Can I run more than one shop?",
          body: [
            "Yes. Create a separate business for each shop from the Businesses page. Channels, catalogs, orders, and storefronts stay fully separate per business.",
          ],
        },
        {
          heading: "How do I delete my data?",
          body: [
            "Follow the step-by-step Data Deletion Instructions page, or email support from your account address. Platform data practices are described in the Privacy Policy.",
          ],
        },
      ],
    },
  ];
}
