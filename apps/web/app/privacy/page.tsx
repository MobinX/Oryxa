'use client';

import { ShieldCheck } from 'lucide-react';
import { useBrand } from '@/components/brand-provider';
import {
  LegalContact,
  LegalList,
  LegalPage,
  LegalSection,
} from '@/components/legal/legal-page';

const UPDATED = '31 October 2026';

export default function PrivacyPage() {
  const { companyName: COMPANY_NAME, parentCompanyName: PARENT_COMPANY_NAME } = useBrand();
  const sameEntity = COMPANY_NAME === PARENT_COMPANY_NAME;

  return (
    <LegalPage
      title="Privacy Policy"
      subtitle={`How ${COMPANY_NAME} collects, uses, shares and protects personal data.`}
      updated={UPDATED}
      icon={ShieldCheck}
      current="/privacy"
    >
      <p>
        {COMPANY_NAME}{sameEntity ? '' : <>, a product of <strong className="text-foreground">{PARENT_COMPANY_NAME}</strong></>}{' '}
        (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), provides AI-assisted messaging, catalog,
        storefront and order tools for merchants. This policy explains what personal data we process,
        why, who we share it with and the choices you have. It applies to our websites, the merchant
        console, connected messaging features and storefronts.
      </p>

      <LegalSection title="1. Who is responsible for your data">
        <p>
          For merchant account, billing and website data, {PARENT_COMPANY_NAME} is the data controller.
          For Customer conversations, orders and customer records that a Merchant handles through the
          Service, the Merchant is the controller and we act as its processor: we process that data on
          the Merchant&apos;s instructions and only to provide the Service. Merchants must give their
          own customers an appropriate privacy notice and have a lawful basis for contacting them.
        </p>
      </LegalSection>

      <LegalSection title="2. Data we collect">
        <LegalList>
          <li><strong className="text-foreground">Account data:</strong> name, email address, sign-in method, Firebase user identifier and account security records.</li>
          <li><strong className="text-foreground">Business data:</strong> store name, description, contact details, guidance, catalog, product photos, prices, stock, categories and storefront settings.</li>
          <li><strong className="text-foreground">Connected platform data:</strong> Page and account identifiers, encrypted access tokens, page names, webhook events and notification Messenger identifiers you connect.</li>
          <li><strong className="text-foreground">Conversations and comments:</strong> customer messages, comments, photos, profile names/avatars supplied by the platform, AI replies, suggestions and conversation state.</li>
          <li><strong className="text-foreground">Orders and customer records:</strong> name, phone number, delivery address, order contents, totals, payment method and any transaction ID a customer provides.</li>
          <li><strong className="text-foreground">Plan and allowance data:</strong> assigned plan, usage counters, overrides and notices. We do not collect card numbers in the Service.</li>
          <li><strong className="text-foreground">Technical data:</strong> IP address, device/browser information, request logs, error diagnostics, timestamps and approximate timezone.</li>
          <li><strong className="text-foreground">Notification data:</strong> browser push subscription tokens, and the Messenger account identifiers used for merchant notices.</li>
          <li><strong className="text-foreground">Cookie choices:</strong> your consent record and, if you accept analytics, a random first-party visitor id.</li>
        </LegalList>
        <p>
          We do not intentionally collect special-category data (such as health, religion or biometric
          data), and you should not ask Customers to provide it in a conversation. Do not send payment
          card numbers in chat.
        </p>
      </LegalSection>

      <LegalSection title="3. Where the data comes from">
        <LegalList>
          <li>From you, when you create an account, add products or settings, or connect a channel.</li>
          <li>From Customers, when they message, comment, send photos or place an order through your connected platform.</li>
          <li>From platforms, which supply message events, profiles, page details and delivery information.</li>
          <li>Automatically, from your browser and our servers, as request logs and cookie choices.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="4. Why we use data and our legal bases">
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Purpose</th>
                <th className="px-3 py-2.5 font-semibold">Examples</th>
                <th className="px-3 py-2.5 font-semibold">Legal basis (GDPR/UK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="px-3 py-2.5">Provide the Service</td>
                <td className="px-3 py-2.5">Accounts, agents, catalog, orders, storefronts, support</td>
                <td className="px-3 py-2.5">Contract</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">Secure and improve the Service</td>
                <td className="px-3 py-2.5">Logs, diagnostics, abuse prevention, anonymous visit counts</td>
                <td className="px-3 py-2.5">Legitimate interests; consent for analytics cookies</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">Billing and notices</td>
                <td className="px-3 py-2.5">Plan assignment, allowances, service notices</td>
                <td className="px-3 py-2.5">Contract; legal obligation</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5">Comply with law</td>
                <td className="px-3 py-2.5">Responding to lawful requests, retaining records</td>
                <td className="px-3 py-2.5">Legal obligation</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Where we rely on consent (for example analytics cookies), you can withdraw it at any time
          through the cookie settings in the footer. Withdrawal does not affect processing that already
          happened.
        </p>
      </LegalSection>

      <LegalSection title="5. AI processing">
        <p>
          Messages, comments and attached photos may be sent to an AI model provider (such as Google
          Gemini, OpenAI or Azure OpenAI) to draft replies, suggestions or product matches. The output
          is returned to the Service and may be sent to your customer when the agent is active. We do
          not use Customer conversations to train our own models. Model providers process the content
          under their terms and privacy commitments. AI output can be inaccurate, which is why the
          console lets you pause an agent, take over a conversation and reply yourself. We do not make
          automated decisions that produce legal or similarly significant effects about a person;
          order acceptance and fulfilment decisions remain with the Merchant.
        </p>
      </LegalSection>

      <LegalSection title="6. Who we share data with">
        <p>
          We do not sell personal data and we do not share it for cross-context behavioural advertising.
          We share data with service providers that help run the Service, under their terms and only as
          needed:
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Provider</th>
                <th className="px-3 py-2.5 font-semibold">Purpose</th>
                <th className="px-3 py-2.5 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr><td className="px-3 py-2.5">Meta (Facebook, Instagram, WhatsApp)</td><td className="px-3 py-2.5">Messaging, comments, notifications</td><td className="px-3 py-2.5">Messages, profiles, page identifiers, tokens</td></tr>
              <tr><td className="px-3 py-2.5">Google Firebase</td><td className="px-3 py-2.5">Authentication and browser push</td><td className="px-3 py-2.5">Account identifiers, push tokens</td></tr>
              <tr><td className="px-3 py-2.5">Google Gemini, OpenAI / Azure OpenAI</td><td className="px-3 py-2.5">AI replies and suggestions</td><td className="px-3 py-2.5">Conversation text, photos, catalog context</td></tr>
              <tr><td className="px-3 py-2.5">Backblaze B2</td><td className="px-3 py-2.5">Image storage</td><td className="px-3 py-2.5">Product and chat photos</td></tr>
              <tr><td className="px-3 py-2.5">Neon</td><td className="px-3 py-2.5">Database hosting</td><td className="px-3 py-2.5">All Service records</td></tr>
              <tr><td className="px-3 py-2.5">Vercel</td><td className="px-3 py-2.5">Application hosting</td><td className="px-3 py-2.5">Request logs and application data</td></tr>
              <tr><td className="px-3 py-2.5">Axiom</td><td className="px-3 py-2.5">Operational logging</td><td className="px-3 py-2.5">Diagnostic events and identifiers</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          We may also disclose data if required by law, to protect rights or safety, to investigate
          abuse, or as part of a merger or sale of the business (subject to this policy). Merchants see
          the data of their own business; we do not share one merchant&apos;s data with another.
        </p>
      </LegalSection>

      <LegalSection title="7. Cookies and similar technologies">
        <p>
          We use strictly necessary cookies for sign-in and security, plus preference storage for your
          theme, cart and timezone. With your consent, we use first-party analytics to count store
          visits anonymously. We do not use advertising or cross-site tracking cookies. See the{' '}
          <a href="/cookies" className="font-semibold text-primary hover:underline">Cookie Policy</a>{' '}
          for the exact list, durations and controls.
        </p>
      </LegalSection>

      <LegalSection title="8. How long we keep data">
        <LegalList>
          <li><strong className="text-foreground">Account and business data:</strong> while the account is active, then for a short deletion window and any legally required period.</li>
          <li><strong className="text-foreground">Conversations, comments and orders:</strong> for the life of the business workspace unless you delete them, so you can serve returning customers and keep records.</li>
          <li><strong className="text-foreground">Platform tokens:</strong> until you disconnect the channel or delete the workspace.</li>
          <li><strong className="text-foreground">Operational logs:</strong> generally up to 30 days, longer only for security investigations.</li>
          <li><strong className="text-foreground">Anonymous visit counts:</strong> the visitor id lasts 30 days; the hashed daily count is kept with store analytics.</li>
          <li><strong className="text-foreground">Plan, billing and tax records:</strong> kept for the period required by applicable Bangladeshi tax and accounting law, including after a workspace is closed.</li>
          <li><strong className="text-foreground">Cookie choices:</strong> 180 days, unless you change them sooner.</li>
        </LegalList>
        <p>
          Backups may retain copies for a limited period after deletion. Where a law requires a longer
          retention period, we keep only what is required.
        </p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          We use TLS in transit, encrypt connected-platform tokens at rest, verify webhook signatures,
          restrict access to production systems and keep audit logs. No system is perfectly secure. You
          are responsible for protecting your credentials, and you should not send card numbers or
          sensitive identity documents through chat.
        </p>
      </LegalSection>

      <LegalSection title="10. International transfers">
        <p>
          We and our providers process data in Bangladesh, the United States and other countries where
          our providers operate. Where data leaves the UK/EEA, we rely on appropriate safeguards such as
          standard contractual clauses or an applicable adequacy decision. You can contact us for more
          information about the safeguards used.
        </p>
      </LegalSection>

      <LegalSection title="11. Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, delete, restrict or
          object to processing, receive a portable copy, withdraw consent and lodge a complaint with a
          supervisory authority. EU/UK residents can complain to their local data protection authority.
        </p>
        <p>
          If you are in California, you may request to know, delete or correct personal information, and
          to opt out of sale or sharing. We do not sell personal information or share it for cross-context
          behavioural advertising, so there is no sale/share to opt out of. We will not discriminate
          against you for exercising a privacy right.
        </p>
        <p>
          To exercise a right, email us at the address below. For Customer data held by a Merchant, we
          will forward your request to that Merchant and assist them; contact the Merchant first if you
          know which store you dealt with. We may need to verify identity before acting.
        </p>
      </LegalSection>

      <LegalSection title="12. Children">
        <p>
          The Service is for businesses and is not directed to children. Merchants must be at least 18.
          We do not knowingly collect personal data from children. If you believe a child&apos;s data has
          been sent to us, contact us and we will take appropriate steps. Merchants must comply with
          platform age rules and their local child-protection law.
        </p>
      </LegalSection>

      <LegalSection title="13. Marketing and notifications">
        <p>
          We send service and account notices through the console, email and, if you connect it, the
          notification Messenger account. You can disconnect that account at any time. We do not send
          third-party advertising or sell your contact details. Transactional notices about orders,
          allowances and security are part of the Service.
        </p>
      </LegalSection>

      <LegalSection title="14. Changes to this policy">
        <p>
          We may update this policy as the Service or the law changes. The updated date at the top will
          change, and material changes will be communicated in the console or by email where
          appropriate. If a change relies on consent, we will ask for it again.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p>
          For privacy questions, data requests or processor enquiries (including a data processing
          agreement), contact us. We have not appointed a statutory Data Protection Officer; privacy
          enquiries go to the address below. Where EU/UK law requires a local representative, we will
          publish their contact details here; until then our privacy contact handles those requests.
        </p>
        <LegalContact companyName={PARENT_COMPANY_NAME} />
        <p>
          You can also use our{' '}
          <a href="/data-delete-instructions" className="font-semibold text-primary hover:underline">
            data deletion instructions
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
