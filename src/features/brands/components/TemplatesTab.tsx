import { Layout, Sparkles } from 'lucide-react'

export function TemplatesTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-6">
        <Layout className="w-8 h-8 text-primary-500" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Templates Coming Soon</h2>
      <p className="text-gray-500 text-center max-w-md mb-6">
        Manage content templates for each brand — preview, upload, and organize your reels and post templates all in one place.
      </p>
      <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-full text-sm font-medium">
        <Sparkles className="w-4 h-4" />
        In Development
      </div>
    </div>
  )
}
