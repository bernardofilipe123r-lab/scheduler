import { FileText, Shield, AlertTriangle, Scale, Ban, RefreshCw, Mail } from 'lucide-react'

const APP_NAME = 'ViralToby'
const COMPANY_NAME = 'HealthyCollege'
const CONTACT_EMAIL = 'viraltobyapp@gmail.com'
const DOMAIN = 'viraltoby.com'

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-5 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-7 w-7 text-blue-400" />
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
        </div>
        <p className="text-sm text-gray-500 mb-10">Last updated: February 27, 2026</p>

        <p className="mb-8">
          Welcome to <strong className="text-white">{APP_NAME}</strong> (
          <a href={`https://${DOMAIN}`} className="text-blue-400 hover:underline">
            {DOMAIN}
          </a>
          ), operated by <strong className="text-white">{COMPANY_NAME}</strong> ("we", "us", "our").
          By accessing or using our service, you agree to be bound by these Terms of Service.
        </p>

        {/* 1 */}
        <Section icon={<FileText className="h-5 w-5" />} title="1. Service Description">
          <p>
            {APP_NAME} is a social media content scheduling and publishing platform. We help users
            create, schedule, and publish short-form video content (Reels, Shorts) to Instagram,
            Facebook, YouTube, Threads, and TikTok through their respective APIs.
          </p>
        </Section>

        {/* 2 */}
        <Section icon={<Shield className="h-5 w-5" />} title="2. Account & Eligibility">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>You must be at least 18 years old to use {APP_NAME}.</li>
            <li>
              You are responsible for maintaining the security of your account credentials.
            </li>
            <li>
              You must provide accurate information when creating your account and connecting social
              media accounts.
            </li>
            <li>
              One person or entity may maintain multiple brand profiles within a single account.
            </li>
          </ul>
        </Section>

        {/* 3 */}
        <Section icon={<Scale className="h-5 w-5" />} title="3. Acceptable Use">
          <p className="mb-3">You agree <strong className="text-white">not</strong> to:</p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>Use the service to publish content that violates any applicable law or regulation.</li>
            <li>
              Publish content that is hateful, harassing, defamatory, or infringes on the rights of
              others.
            </li>
            <li>
              Attempt to gain unauthorized access to other users' accounts or our systems.
            </li>
            <li>
              Use the service in a way that could damage, disable, or impair our infrastructure.
            </li>
            <li>
              Violate any platform-specific terms of Instagram, Facebook, YouTube, Threads, or TikTok when publishing
              through {APP_NAME}.
            </li>
          </ul>
        </Section>

        {/* 4 */}
        <Section icon={<FileText className="h-5 w-5" />} title="4. Content Ownership">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              You retain all ownership rights to the content you create and publish through {APP_NAME}.
            </li>
            <li>
              By using our service, you grant us a limited license to process, store, and transmit
              your content solely for the purpose of providing the service (e.g., scheduling and
              publishing to your connected accounts).
            </li>
            <li>
              We do not claim any ownership over your content and will not use it for any purpose
              other than delivering the service.
            </li>
          </ul>
        </Section>

        {/* 5 */}
        <Section icon={<Shield className="h-5 w-5" />} title="5. Third-Party Platforms">
          <p className="mb-3">
            {APP_NAME} integrates with third-party platforms including Meta (Instagram, Facebook, Threads),
            Google (YouTube), and TikTok. By connecting these accounts:
          </p>
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              You authorize us to access and use your account data as described in our{' '}
              <a href="/privacy" className="text-blue-400 hover:underline">
                Privacy Policy
              </a>
              .
            </li>
            <li>
              You agree to comply with each platform's terms of service and community guidelines.
            </li>
            <li>
              We are not responsible for any changes, outages, or policy changes by these third-party
              platforms that may affect the service.
            </li>
          </ul>
        </Section>

        {/* 6 */}
        <Section icon={<AlertTriangle className="h-5 w-5" />} title="6. Disclaimer of Warranties">
          <p>
            {APP_NAME} is provided on an <strong className="text-white">"as is"</strong> and{' '}
            <strong className="text-white">"as available"</strong> basis. We make no warranties,
            express or implied, regarding the reliability, availability, or accuracy of the service.
            We do not guarantee that content will be published successfully to any platform, as
            publishing depends on third-party API availability and compliance.
          </p>
        </Section>

        {/* 7 */}
        <Section icon={<Ban className="h-5 w-5" />} title="7. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, {COMPANY_NAME} shall not be liable for any
            indirect, incidental, special, or consequential damages arising from your use of{' '}
            {APP_NAME}, including but not limited to loss of data, revenue, or business opportunities.
          </p>
        </Section>

        {/* 8 */}
        <Section icon={<Ban className="h-5 w-5" />} title="8. Termination">
          <ul className="list-disc pl-6 space-y-1.5">
            <li>
              You may stop using {APP_NAME} at any time by disconnecting your social accounts and
              deleting your account.
            </li>
            <li>
              We reserve the right to suspend or terminate your access if you violate these terms or
              engage in abusive behavior.
            </li>
            <li>
              Upon termination, we will delete your data as described in our{' '}
              <a href="/privacy" className="text-blue-400 hover:underline">
                Privacy Policy
              </a>
              .
            </li>
          </ul>
        </Section>

        {/* 9 */}
        <Section icon={<RefreshCw className="h-5 w-5" />} title="9. Changes to These Terms">
          <p>
            We may update these Terms of Service from time to time. We will notify users of material
            changes via email or in-app notification. Continued use of the service after changes
            constitutes acceptance of the updated terms.
          </p>
        </Section>

        {/* 10 */}
        <Section icon={<Mail className="h-5 w-5" />} title="10. Contact">
          <p>
            For any questions about these terms, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
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
        <span className="text-blue-400">{icon}</span>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <div className="text-gray-300 leading-relaxed">{children}</div>
    </section>
  )
}
