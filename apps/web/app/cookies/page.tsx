'use client';

import { Cookie } from 'lucide-react';
import { useBrand } from '@/components/brand-provider';
import { CookiePreferencesPanel } from '@/components/cookie-consent';
import {
  LegalContact,
  LegalList,
  LegalPage,
  LegalSection,
} from '@/components/legal/legal-page';

const UPDATED = '31 October 2026';

export default function CookiesPage() {
  const { companyName: COMPANY_NAME, parentCompanyName: PARENT_COMPANY_NAME } = useBrand();
  const sameEntity = COMPANY_NAME === PARENT_COMPANY_NAME;

  return (
    <LegalPage
      title="Cookie Policy"
      subtitle={`The cookies and browser storage ${COMPANY_NAME} uses, and how you stay in control.`}
      updated={UPDATED}
      icon={Cookie}
      current="/cookies"
    >
      <p>
        This policy explains how {COMPANY_NAME} uses cookies and similar browser storage.{' '}
        {sameEntity ? null : (
          <>
            {COMPANY_NAME} is a product of{' '}
            <strong className="text-foreground">{PARENT_COMPANY_NAME}</strong>.{' '}
          </>
        )}
        It should be read with our{' '}
        <a href="/privacy" className="font-semibold text-primary hover:underline">Privacy Policy</a>.
        When you first visit the site, a banner asks whether you accept optional analytics. Necessary
        storage is used to run the Service you requested and does not depend on that choice.
      </p>

      <LegalSection title="1. Your choice">
        <p>
          You can accept all, reject optional storage, or choose categories. Your choice is saved for
          180 days in a first-party cookie and can be changed at any time from the footer
          (&quot;Cookie settings&quot;) or the controls below. Withdrawing analytics consent stops new
          analytics collection and deletes the anonymous visit id; it does not affect processing that
          already happened.
        </p>
        <CookiePreferencesPanel />
      </LegalSection>

      <LegalSection title="2. Categories">
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">What it covers</th>
                <th className="px-3 py-2.5 font-semibold">Consent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="px-3 py-2.5 font-semibold text-foreground">Strictly necessary</td>
                <td className="px-3 py-2.5">Sign-in, security, consent record, cart, theme, timezone and console layout. These are stored only to deliver features you use.</td>
                <td className="px-3 py-2.5">Not required; these deliver the feature you requested.</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-semibold text-foreground">Analytics</td>
                <td className="px-3 py-2.5">Anonymous first-party counting of storefront visits.</td>
                <td className="px-3 py-2.5">Optional, off until you accept.</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-semibold text-foreground">Advertising</td>
                <td className="px-3 py-2.5">We do not use advertising, retargeting or cross-site tracking cookies.</td>
                <td className="px-3 py-2.5">Not used.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="3. Cookies we set">
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full min-w-[620px] text-left text-xs">
            <thead className="bg-muted/50 text-foreground">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Category</th>
                <th className="px-3 py-2.5 font-semibold">Purpose</th>
                <th className="px-3 py-2.5 font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">oryxa_consent</td>
                <td className="px-3 py-2.5">Necessary</td>
                <td className="px-3 py-2.5">Stores your cookie choice and its date.</td>
                <td className="px-3 py-2.5">180 days</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">oryxa_token</td>
                <td className="px-3 py-2.5">Necessary</td>
                <td className="px-3 py-2.5">Signed-in session for the merchant console. HTTP-only and secure on HTTPS.</td>
                <td className="px-3 py-2.5">1 hour</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">oryxa_logs_tz</td>
                <td className="px-3 py-2.5">Necessary preference</td>
                <td className="px-3 py-2.5">Remembers the timezone used to display console timestamps.</td>
                <td className="px-3 py-2.5">1 year</td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-mono text-[11px] text-foreground">oryxa_vid</td>
                <td className="px-3 py-2.5">Analytics (optional)</td>
                <td className="px-3 py-2.5">Random first-party id used to count storefront visits. Only set after you accept analytics; the server stores a hash, not the id.</td>
                <td className="px-3 py-2.5">30 days</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Firebase Authentication may keep a local session record in browser storage so you stay signed
          in. We do not set third-party advertising cookies, and we do not embed social pixels that
          track you across other sites.
        </p>
      </LegalSection>

      <LegalSection title="4. Browser storage that is not a cookie">
        <LegalList>
          <li><strong className="text-foreground">theme</strong> — remembers light or dark mode.</li>
          <li><strong className="text-foreground">oryxa.storefront.cart.&lt;store&gt;</strong> — keeps a storefront cart on your device.</li>
          <li><strong className="text-foreground">oryxa:push-dismissed:&lt;business&gt;</strong> — remembers that you dismissed a browser push prompt.</li>
          <li><strong className="text-foreground">admin-sidebar-collapsed</strong> — remembers the console sidebar layout.</li>
          <li><strong className="text-foreground">Firebase Authentication persistence</strong> — keeps your sign-in session until it expires or you sign out.</li>
        </LegalList>
        <p>
          These are set only when you use the relevant feature, are limited to this site, and are not
          used to profile you across other websites.
        </p>
      </LegalSection>

      <LegalSection title="5. How to manage cookies">
        <p>
          Use the controls above or &quot;Cookie settings&quot; in the footer. You can also block or
          delete cookies in your browser settings; blocking necessary cookies may prevent sign-in, cart
          or console features from working. Browser controls vary, so consult your browser&apos;s help.
        </p>
        <p>
          We honour Global Privacy Control and Do Not Track signals to the extent they apply: because we
          do not sell or share personal data for advertising, there is no sale or sharing to opt out of,
          and analytics remains off unless you accept it.
        </p>
      </LegalSection>

      <LegalSection title="6. EU/UK visitors">
        <p>
          Necessary and preference storage is used to deliver the Service you requested. Analytics is
          optional and relies on your consent under the ePrivacy rules and, where applicable, the GDPR.
          Refusing or withdrawing consent is as easy as accepting: use the same controls at any time.
          We do not use cookie walls, pre-ticked analytics switches or dark patterns.
        </p>
      </LegalSection>

      <LegalSection title="7. US visitors">
        <p>
          We do not sell personal information or share it for cross-context behavioural advertising. If
          you are a California resident, the Privacy Policy explains your rights to know, delete, correct
          and opt out, and how to exercise them. Optional analytics is off until you accept it.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-party sites">
        <p>
          Connected platforms and other sites you visit through our Service have their own cookies and
          policies. We do not control them. Review their privacy and cookie notices before using them.
        </p>
      </LegalSection>

      <LegalSection title="9. Changes and contact">
        <p>
          We may update this policy when our storage changes or the law requires it. The updated date at
          the top will change. Questions about cookies or privacy:
        </p>
        <LegalContact companyName={PARENT_COMPANY_NAME} />
      </LegalSection>
    </LegalPage>
  );
}
