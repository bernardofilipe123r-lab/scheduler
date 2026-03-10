import { Shield, Mail, Trash2, Database, Eye, RefreshCw, Server } from 'lucide-react'
import { LegalLayout } from '@/shared/components/LegalLayout'

const APP_NAME = 'ViralToby'
const COMPANY_NAME = 'Viral Toby'
const CONTACT_EMAIL = 'viraltobyapp@gmail.com'
const DOMAIN = 'viraltoby.com'

export function PrivacyPolicyPage() {
  return (
    <LegalLayout>
      <div className="max-w-3xl mx-auto px-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-7 w-7 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        </div>
        <p className="text-sm text-gray-400 mb-10">Last updated: February 27, 2026</p>

        <p className="mb-8 text-gray-600">
          <strong className="text-gray-900">{APP_NAME}</strong> (
          <a href={`https://${DOMAIN}`} className="text-blue-600 hover:underline">
            {DOMAIN}
          </a>
          ), operated by <strong className="text-gray-900">{COMPANY_NAME}</strong> ("we", "our", "the
          app"), is a social media scheduling tool that helps users create and publish content to
          Instagram, Facebook, YouTube, Threads, TikTok, and Bluesky.
        </p>

        {/* 1 */}
        <Section icon={<Database className="h-5 w-5" />} title="1. Information We Collect">
          <p className="mb-3">
            When you connect your social media accounts via OAuth, we receive and store:
          </p>
          <p className="font-semibold text-gray-900 mt-3 mb-2">Meta (Instagram &amp; Facebook)</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Account identifiers</strong> — your Instagram Business
              Account ID and/or Facebook Page ID.
            </li>
            <li>
              <strong className="text-gray-900">Access tokens</strong> — OAuth tokens issued by Meta that
              allow us to publish content on your behalf.
            </li>
            <li>
              <strong className="text-gray-900">Basic profile info</strong> — your Instagram username and
              Facebook Page name, used for display purposes only.
            </li>
          </ul>
          <p className="font-semibold text-gray-900 mt-4 mb-2">YouTube (Google)</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Channel identifiers</strong> — your YouTube channel ID.
            </li>
            <li>
              <strong className="text-gray-900">Access &amp; refresh tokens</strong> — OAuth tokens
              issued by Google that allow us to upload Shorts on your behalf.
            </li>
            <li>
              <strong className="text-gray-900">Channel name</strong> — used for display purposes only.
            </li>
          </ul>
          <p className="font-semibold text-gray-900 mt-4 mb-2">Threads (Meta)</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Account identifiers</strong> — your Threads user ID.
            </li>
            <li>
              <strong className="text-gray-900">Access tokens</strong> — OAuth tokens issued by Meta that
              allow us to publish content on your behalf.
            </li>
            <li>
              <strong className="text-gray-900">Profile info</strong> — your Threads username, used for display purposes only.
            </li>
          </ul>
          <p className="font-semibold text-gray-900 mt-4 mb-2">TikTok</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Account identifiers</strong> — your TikTok open ID.
            </li>
            <li>
              <strong className="text-gray-900">Access &amp; refresh tokens</strong> — OAuth tokens
              issued by TikTok that allow us to publish content on your behalf.
            </li>
            <li>
              <strong className="text-gray-900">Basic profile info</strong> — your TikTok display name, used for display purposes only.
            </li>
          </ul>
          <p className="font-semibold text-gray-900 mt-4 mb-2">Bluesky</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Account identifiers</strong> — your Bluesky DID (decentralized
              identifier).
            </li>
            <li>
              <strong className="text-gray-900">App Password</strong> — stored to create sessions and publish
              on your behalf.
            </li>
            <li>
              <strong className="text-gray-900">Basic profile info</strong> — your Bluesky handle, used for
              display purposes only.
            </li>
          </ul>
          <p className="mt-3">
            We also collect your <strong className="text-gray-900">email address</strong> when you sign
            up, used solely for authentication and account recovery.
          </p>
        </Section>

        {/* 2 */}
        <Section icon={<Eye className="h-5 w-5" />} title="2. How We Use Your Information">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Publishing content</strong> — to schedule and publish
              Reels, posts, carousels, YouTube Shorts, Threads posts, TikTok videos, and Bluesky posts to your connected accounts.
            </li>
            <li>
              <strong className="text-gray-900">Analytics</strong> — to fetch and display insights about
              your published content (impressions, reach, engagement).
            </li>
            <li>
              <strong className="text-gray-900">Account management</strong> — to identify your connected
              accounts in the app dashboard.
            </li>
          </ul>
          <p className="mt-3">
            We do <strong className="text-gray-900">not</strong> sell, share, or transfer your data to
            any third parties. We do <strong className="text-gray-900">not</strong> use your data for
            advertising.
          </p>
        </Section>

        {/* 3 */}
        <Section icon={<Shield className="h-5 w-5" />} title="3. Data Storage & Security">
          <p>
            Your data is stored in a secured PostgreSQL database hosted on Supabase with row-level
            security. Access tokens are stored encrypted at rest. All API communication is over HTTPS.
          </p>
        </Section>

        {/* 4 */}
        <Section icon={<RefreshCw className="h-5 w-5" />} title="4. Data Retention">
          <p>
            We retain your data for as long as your account is active. When you disconnect a social
            account or delete your account, we immediately remove all associated tokens and identifiers
            from our database.
          </p>
        </Section>

        {/* 5 */}
        <Section icon={<Eye className="h-5 w-5" />} title="5. Your Rights">
          <p className="mb-3">You can at any time:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Disconnect</strong> your Instagram, Facebook, YouTube,
              Threads, TikTok, or Bluesky account from the app settings, which deletes all stored tokens.
            </li>
            <li>
              <strong className="text-gray-900">Request deletion</strong> of all your data by contacting
              us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
                {CONTACT_EMAIL}
              </a>{' '}
              or using the{' '}
              <a href="/data-deletion" className="text-blue-600 hover:underline">
                data deletion page
              </a>
              .
            </li>
            <li>
              <strong className="text-gray-900">Revoke access</strong> directly from Instagram (Settings
              → Apps and Websites), Facebook (Settings → Business Integrations), Google (
              <a
                href="https://myaccount.google.com/permissions"
                className="text-blue-600 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              ), Threads (Settings → Apps), TikTok (Settings → Manage App Permissions), or Bluesky (Settings → App Passwords).
            </li>
          </ul>
        </Section>

        {/* 6 */}
        <Section icon={<Trash2 className="h-5 w-5" />} title="6. Data Deletion">
          <p>
            To request deletion of all data we hold about you, visit our{' '}
            <a href="/data-deletion" className="text-blue-600 hover:underline">
              Data Deletion page
            </a>
            .
          </p>
          <p className="mt-2">
            We will process deletion requests within 48 hours. You can also email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        {/* 7 */}
        <Section icon={<Server className="h-5 w-5" />} title="7. Third-Party Services">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              <strong className="text-gray-900">Meta Platform</strong> (Instagram Graph API, Facebook
              Graph API, Threads API) — for publishing and analytics.
            </li>
            <li>
              <strong className="text-gray-900">Google / YouTube</strong> (YouTube Data API v3) — for
              publishing YouTube Shorts.
            </li>
            <li>
              <strong className="text-gray-900">TikTok</strong> (TikTok Content Posting API) — for
              publishing TikTok videos.
            </li>
            <li>
              <strong className="text-gray-900">Bluesky</strong> (AT Protocol API) — for publishing posts to
              Bluesky.
            </li>
            <li>
              <strong className="text-gray-900">Supabase</strong> — for authentication and database
              hosting.
            </li>
            <li>
              <strong className="text-gray-900">Railway</strong> — for application hosting.
            </li>
          </ul>
          <p className="mt-3">
            {APP_NAME}'s use and transfer of information received from Google APIs adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        {/* 8 */}
        <Section icon={<RefreshCw className="h-5 w-5" />} title="8. Changes to This Policy">
          <p>
            We may update this policy from time to time. We will notify users of material changes via
            email or in-app notification.
          </p>
        </Section>

        {/* 9 */}
        <Section icon={<Mail className="h-5 w-5" />} title="9. Contact">
          <p>
            For any questions about this privacy policy, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </LegalLayout>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600">{icon}</span>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="text-gray-600 leading-relaxed">{children}</div>
    </section>
  )
}
