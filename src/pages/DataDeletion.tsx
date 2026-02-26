import { Trash2, Mail, LogOut, Instagram, ShieldX } from 'lucide-react'

const APP_NAME = 'ViralToby'
const CONTACT_EMAIL = 'bernardofilipe123r@gmail.com'

export function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <div className="max-w-3xl mx-auto px-5 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="h-7 w-7 text-red-400" />
          <h1 className="text-3xl font-bold text-white">Data Deletion Request</h1>
        </div>
        <p className="text-sm text-gray-500 mb-10">{APP_NAME}</p>

        <p className="mb-10 text-gray-300">
          We respect your right to control your data. Here's how to delete all data we store about
          you:
        </p>

        {/* Option 1 */}
        <Option
          number={1}
          icon={<LogOut className="h-5 w-5" />}
          title="In-App Disconnect"
        >
          <ol className="list-decimal pl-6 space-y-2">
            <li>Log in to {APP_NAME}</li>
            <li>
              Go to <strong className="text-white">Settings → Brand Settings</strong>
            </li>
            <li>
              Click <strong className="text-white">"Disconnect"</strong> next to your Instagram or
              Facebook account
            </li>
            <li>This immediately deletes all stored tokens and account identifiers</li>
          </ol>
        </Option>

        {/* Option 2 */}
        <Option
          number={2}
          icon={<Instagram className="h-5 w-5" />}
          title="Revoke from Instagram / Facebook / YouTube"
        >
          <ol className="list-decimal pl-6 space-y-2">
            <li>
              Open <strong className="text-white">Instagram → Settings → Apps and Websites</strong>
            </li>
            <li>
              Find <strong className="text-white">{APP_NAME}</strong> and click{' '}
              <strong className="text-white">Remove</strong>
            </li>
            <li>
              For YouTube, go to{' '}
              <a
                href="https://myaccount.google.com/permissions"
                className="text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account Permissions
              </a>{' '}
              and revoke access for {APP_NAME}
            </li>
            <li>
              This revokes our access. We will automatically purge your data upon detecting the
              revoked token.
            </li>
          </ol>
        </Option>

        {/* Option 3 */}
        <Option
          number={3}
          icon={<Mail className="h-5 w-5" />}
          title="Email Request"
        >
          <p>
            Send an email to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:underline">
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject line{' '}
            <strong className="text-white">"Data Deletion Request"</strong> and include your Instagram
            username or email. We will delete all your data within 48 hours and confirm by email.
          </p>
        </Option>

        {/* What gets deleted */}
        <div className="mt-12 border border-gray-800 rounded-xl p-6 bg-gray-900/50">
          <div className="flex items-center gap-2 mb-4">
            <ShieldX className="h-5 w-5 text-red-400" />
            <h2 className="text-lg font-semibold text-white">What Gets Deleted</h2>
          </div>
          <ul className="list-disc pl-6 space-y-1.5 text-gray-300">
            <li>Instagram / Facebook access tokens</li>
            <li>Instagram Business Account ID and Facebook Page ID</li>
            <li>Instagram username and Facebook Page name</li>
            <li>YouTube channel ID, access tokens, and refresh tokens</li>
            <li>Any scheduled or generated content associated with your account</li>
          </ul>
          <p className="mt-4 text-gray-400 text-sm">
            After deletion, no data about your connected social accounts is retained in our systems.
          </p>
        </div>
      </div>
    </div>
  )
}

function Option({
  number,
  icon,
  title,
  children,
}: {
  number: number
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8 border border-gray-800 rounded-xl p-6 bg-gray-900/30">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-500/20 text-blue-400 text-sm font-bold">
          {number}
        </span>
        <span className="text-blue-400">{icon}</span>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <div className="text-gray-300 leading-relaxed">{children}</div>
    </section>
  )
}
