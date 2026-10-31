'use client';

import Link from 'next/link';
import { Mail } from 'lucide-react';
import { useBrand } from '@/components/brand-provider';
import {
  LegalContact,
  LegalList,
  LegalPage,
  LegalSection,
} from '@/components/legal/legal-page';

const UPDATED = '31 October 2026';

export default function ContactPage() {
  const { companyName: COMPANY_NAME, parentCompanyName: PARENT_COMPANY_NAME } = useBrand();

  return (
    <LegalPage
      title="Contact Us"
      subtitle={`Questions, support requests, or partnership inquiries — reach the ${COMPANY_NAME} team below.`}
      updated={UPDATED}
      icon={Mail}
      current="/contact"
    >
      <p>
        For product support, billing questions, or general information about {COMPANY_NAME},
        email us and we will get back to you as soon as we can.
      </p>

      <LegalSection title="Contact details">
        <LegalContact companyName={PARENT_COMPANY_NAME} />
      </LegalSection>

      <LegalSection title="What to include">
        <p>
          To help us resolve support requests faster, please include:
        </p>
        <LegalList>
          <li>Your account email address and business name.</li>
          <li>The connected channel or page the issue relates to, where applicable.</li>
          <li>A short description of the problem, with screenshots if possible.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Other resources">
        <LegalList>
          <li>
            Data removal walkthroughs:{' '}
            <Link href="/data-delete-instructions" className="font-semibold text-primary hover:underline">
              Data Deletion Instructions
            </Link>
            .
          </li>
          <li>
            Platform rules and data practices:{' '}
            <Link href="/terms" className="font-semibold text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </li>
        </LegalList>
      </LegalSection>
    </LegalPage>
  );
}
