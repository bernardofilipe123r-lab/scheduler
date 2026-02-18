import { useState } from 'react'
import { useDynamicBrands } from '@/features/brands'
import {
  Info,
  FileDown,
  Sparkles,
  Film,
  LayoutGrid,
  Bot,
  BarChart3,
  Calendar,
  Globe,
  Cpu,
  Layers,
  Shield,
  Zap,
  TrendingUp,
  Eye,
  Target,
  Share2,
  Database,
  Server,
  Palette,
  Type,
  Image,
  Video,
  Instagram,
  Facebook,
  Youtube,
  Brain,
  Search,
  CheckCircle2,
  ArrowRight,
  User,
  Loader2,
} from 'lucide-react'

// ─── PDF Generation Utility ─────────────────────────────────────────

function generatePDF(dynamicBrands: { id: string; label: string; instagram_handle?: string }[]) {
  // We build a clean, print-optimized HTML document and open it in a new window
  const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Viral App — Platform Overview</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      background: #ffffff;
    }
    
    .page { 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 48px 56px;
    }
    
    /* Cover */
    .cover {
      text-align: center;
      padding: 80px 0 60px;
      border-bottom: 3px solid #00435c;
      margin-bottom: 48px;
    }
    .cover-brand {
      font-size: 42px;
      font-weight: 800;
      color: #00435c;
      letter-spacing: -1px;
      margin-bottom: 8px;
    }
    .cover-sub {
      font-size: 16px;
      color: #6b7280;
      font-weight: 400;
      margin-bottom: 32px;
    }
    .cover-tagline {
      font-size: 20px;
      color: #374151;
      font-weight: 500;
      line-height: 1.5;
      max-width: 600px;
      margin: 0 auto;
    }
    .cover-date {
      margin-top: 32px;
      font-size: 12px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .cover-badge {
      display: inline-block;
      margin-top: 16px;
      padding: 6px 16px;
      background: #e6f2f5;
      color: #00435c;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    
    h2 {
      font-size: 22px;
      font-weight: 700;
      color: #00435c;
      margin: 36px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e6f2f5;
    }
    
    h3 {
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin: 20px 0 8px;
    }
    
    p {
      font-size: 14px;
      color: #4b5563;
      margin-bottom: 12px;
      line-height: 1.7;
    }
    
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    
    li {
      font-size: 14px;
      color: #4b5563;
      margin-bottom: 6px;
      line-height: 1.6;
    }
    
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      background: #f9fafb;
    }
    
    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #00435c;
      margin-bottom: 6px;
    }
    
    .card-text {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.5;
    }
    
    .tech-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .tech-table th,
    .tech-table td {
      padding: 10px 14px;
      text-align: left;
      font-size: 13px;
      border-bottom: 1px solid #e5e7eb;
    }
    .tech-table th {
      background: #f9fafb;
      color: #374151;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .tech-table td {
      color: #4b5563;
    }
    
    .pipeline {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .pipeline-step {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #e6f2f5;
      color: #00435c;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .pipeline-arrow {
      color: #9ca3af;
      font-size: 14px;
    }
    
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 2px solid #e6f2f5;
      text-align: center;
    }
    .footer p {
      font-size: 12px;
      color: #9ca3af;
    }
    .footer-brand {
      font-weight: 700;
      color: #00435c;
    }
    
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { padding: 32px 40px; }
      .cover { padding: 60px 0 40px; }
      h2 { break-after: avoid; }
      .card, .grid-2 { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    
    <!-- Cover -->
    <div class="cover">
      <div class="cover-brand">Viral App</div>
      <div class="cover-sub">Social Media Content Operations Platform</div>
      <div class="cover-tagline">
        Viral App centralizes short-form content operations — content setup, media rendering,
        scheduling, and multi-platform publishing across Instagram, Facebook, and YouTube.
      </div>
      <div class="cover-date">Platform Overview — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
      <div class="cover-badge">Proprietary Technology by Viral App</div>
    </div>

    <!-- Executive Summary -->
    <h2>Executive Summary</h2>
    <p>
      Viral App is a full-stack social media content operations platform built to manage multiple brands
      from one dashboard. The system covers the full lifecycle: content configuration, image and video
      generation, scheduling, and multi-platform publishing for Instagram Reels, Facebook Reels, and
      YouTube Shorts.
    </p>
    <p>
      Each brand keeps independent identity settings (name, handles, colors, prompts, and credentials)
      while using the same operational pipeline. The workspace currently manages ${dynamicBrands.length} brands,
      with separate schedules and publish metadata tracked per brand.
    </p>

    <!-- Platform Architecture -->
    <h2>Platform Architecture</h2>
    <table class="tech-table">
      <thead>
        <tr><th>Layer</th><th>Technology</th><th>Purpose</th></tr>
      </thead>
      <tbody>
        <tr><td>Backend API</td><td>FastAPI (Python) + Uvicorn</td><td>REST API, job management, scheduling</td></tr>
        <tr><td>Frontend</td><td>React 18 + TypeScript + Vite</td><td>Admin dashboard &amp; content management</td></tr>
        <tr><td>Database</td><td>PostgreSQL + SQLAlchemy</td><td>Jobs, schedules, analytics, brand configs</td></tr>
        <tr><td>Content Services</td><td>Python service layer</td><td>Job creation, prompt/context assembly, CTA and brand logic</td></tr>
        <tr><td>Media Engine</td><td>Pillow + FFmpeg + MoviePy</td><td>Template image rendering and video generation</td></tr>
        <tr><td>Storage</td><td>Supabase Storage + local output paths</td><td>Generated images, videos, thumbnails, and assets</td></tr>
        <tr><td>Video Engine</td><td>FFmpeg + MoviePy</td><td>Image‑to‑video with background music</td></tr>
        <tr><td>Publishing</td><td>Meta Graph API + YouTube Data API</td><td>Cross-platform publishing</td></tr>
        <tr><td>Scheduling</td><td>APScheduler</td><td>Background job scheduling &amp; daemon cycles</td></tr>
        <tr><td>Deployment</td><td>Docker + Railway</td><td>Cloud hosting with Supabase Storage</td></tr>
        <tr><td>UI Framework</td><td>TailwindCSS + Recharts + Lucide</td><td>Modern, responsive admin interface</td></tr>
      </tbody>
    </table>

    <!-- Content Generation Pipeline -->
    <h2>Content Generation Pipeline</h2>
    <p>The platform follows a practical 10-stage pipeline from configuration to publishing:</p>
    <div class="pipeline">
      <span class="pipeline-step">1. Pattern Selection</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">2. Prompt Build</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">3. Content Assembly</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">4. Validation</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">5. Brand Variation</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">6. Brand Differentiation</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">7. Image Rendering</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">8. Video Production</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">9. Caption Building</span>
      <span class="pipeline-arrow">→</span>
      <span class="pipeline-step">10. Publishing</span>
    </div>
    
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Modular Pipeline</div>
        <div class="card-text">The workflow is split across focused backend services so job creation, media rendering, and publishing can evolve independently.</div>
      </div>
      <div class="card">
        <div class="card-title">Validation Checks</div>
        <div class="card-text">Input and scheduling checks protect publishing flows and ensure required fields are present before jobs run.</div>
      </div>
      <div class="card">
        <div class="card-title">Brand Separation</div>
        <div class="card-text">Each brand keeps independent settings, credentials, and scheduling state to avoid cross-brand conflicts.</div>
      </div>
      <div class="card">
        <div class="card-title">Reusable Templates</div>
        <div class="card-text">Shared templates and formatting utilities keep output consistent while allowing per-brand customization.</div>
      </div>
    </div>

    <!-- Operations Workflow -->
    <h2>Operations Workflow</h2>
    <p>
      Viral App is designed for repeatable operations: prepare content inputs, generate media,
      queue publishing, and monitor results from one place.
    </p>
    <h3>Four Core Modes</h3>
    <ul>
      <li><strong>CREATE</strong> — Build reels and posts with brand-specific settings</li>
      <li><strong>SCHEDULE</strong> — Queue immediate or timed publishing jobs</li>
      <li><strong>PUBLISH</strong> — Send content to connected platforms per brand</li>
      <li><strong>REVIEW</strong> — Track job status and analytics in dashboard views</li>
    </ul>
    <p>
      Background services continuously process job queues and scheduled posts, with retries and status
      updates visible in the jobs and calendar pages.
    </p>

    <!-- Multi-Brand System -->
    <h2>Scalable Multi-Brand Ecosystem</h2>
    <p>
      The platform is architected to support <strong>multiple brands</strong> — each with completely 
      independent visual identities, social media accounts, and API credentials. Every brand covers the same 
      content workflow but with distinct identity settings. Adding a new brand is a matter of configuring
      credentials, colors, and content settings.
    </p>
    <h3>Currently Active</h3>
    <table class="tech-table">
      <thead>
        <tr><th>Brand</th><th>Instagram Handle</th></tr>
      </thead>
      <tbody>
        ${dynamicBrands.map(b => `<tr><td>${b.label}</td><td>@${b.instagram_handle || b.id}</td></tr>`).join('')}
      </tbody>
    </table>
    <h3>Shared Topic Coverage</h3>
    <p>Teams can organize content themes per brand and keep a consistent publishing cadence:</p>
    <div class="pipeline">
      <span class="pipeline-step">Education</span>
      <span class="pipeline-step">Tips</span>
      <span class="pipeline-step">Lifestyle</span>
      <span class="pipeline-step">Motivation</span>
      <span class="pipeline-step">Product Highlights</span>
      <span class="pipeline-step">Community</span>
      <span class="pipeline-step">Promotions</span>
    </div>
    <p>
      Content differentiation is managed through brand-specific templates, settings, and scheduling.
      This keeps each brand timeline independent while still using one shared platform.
    </p>

    <!-- Publishing & Distribution -->
    <h2>Multi-Platform Publishing</h2>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Instagram Reels</div>
        <div class="card-text">Two-step Meta Graph API flow: container creation → publish. Supports 9:16 vertical format with thumbnail handling and brand CTAs.</div>
      </div>
      <div class="card">
        <div class="card-title">Facebook Reels</div>
        <div class="card-text">Single-step video upload via Pages API. Vertical videos can surface as Reels, with per-brand caption and CTA settings.</div>
      </div>
      <div class="card">
        <div class="card-title">YouTube Shorts</div>
        <div class="card-text">Full OAuth 2.0 integration with YouTube Data API v3. Quota monitoring with per-operation cost tracking. Supports scheduled publishing and clean thumbnails.</div>
      </div>
      <div class="card">
        <div class="card-title">Multi-Account Orchestration</div>
        <div class="card-text">Simultaneous publishing across an unlimited number of brand accounts on Instagram, Facebook, and YouTube — with per-brand credential management and failure isolation.</div>
      </div>
    </div>

    <!-- Analytics & Intelligence -->
    <h2>Analytics &amp; Performance Intelligence</h2>
    <p>
      The platform collects and analyzes performance metrics at multiple levels to continuously optimize content strategy:
    </p>
    <ul>
      <li><strong>Post-Level Metrics</strong> — Plays, reach, likes, saves, shares collected at 24h, 48h, and 7-day windows after publishing</li>
      <li><strong>Engagement Scoring</strong> — Aggregated engagement indicators for quick performance review</li>
      <li><strong>Brand-Level Analytics</strong> — Cross-platform followers, views, and engagement tracked with historical snapshot data</li>
      <li><strong>Trend Monitoring</strong> — Historical snapshots to compare periods and identify movement over time</li>
      <li><strong>Auto-Refresh</strong> — Analytics data refreshed automatically every 12 hours with PostgreSQL-backed caching</li>
    </ul>

    <!-- Visual Content Engine -->
    <h2>Visual Content Engine</h2>
    <ul>
      <li><strong>Image Rendering</strong> — Pillow-based branded reel images with custom text layout, title bars, and numbered content lines (1080×1920 px)</li>
      <li><strong>Light &amp; Dark Modes</strong> — Template-based visual variants with brand-specific styling</li>
      <li><strong>Video Production</strong> — FFmpeg-powered conversion from static images to MP4 Reels with randomized background music (3 tracks, 7–8s duration)</li>
      <li><strong>Background Variants</strong> — Configurable assets and rendering settings for visual consistency</li>
      <li><strong>Caption Formatting</strong> — Structured captions with CTA options and platform-specific publishing metadata</li>
    </ul>

    <!-- Scheduling System -->
    <h2>Intelligent Scheduling</h2>
    <p>
      The PostgreSQL-backed scheduling system supports immediate and timed publishing with 60-second polling intervals. 
      Features include: multi-platform selection (IG/FB/YouTube per post), partial retry on platform-specific failures, 
      stuck-post recovery on restart, and full metadata tracking for video/thumbnail paths and publish results.
    </p>

    <!-- Admin Dashboard -->
    <h2>Admin Dashboard</h2>
    <p>
      A modern React 18 dashboard provides full operational control through an intuitive interface built 
      with TypeScript, TailwindCSS, and TanStack React Query for real-time data management:
    </p>
    <ul>
      <li><strong>Content Generator</strong> — Create reels and posts with real-time previews and brand selection</li>
      <li><strong>Job Management</strong> — Track generation jobs with progress bars and status updates</li>
      <li><strong>Scheduling Calendar</strong> — Visual scheduling with date/time pickers and platform selection</li>
      <li><strong>Analytics Dashboard</strong> — Interactive charts (Recharts) with cross-platform performance data</li>
      <li><strong>Brand Management</strong> — CRUD operations for brand configurations, colors, and credentials</li>
      <li><strong>About &amp; Docs</strong> — Internal platform overview and exportable PDF snapshot</li>
      <li><strong>User Profile</strong> — Account-level settings and session controls</li>
      <li><strong>System Logs</strong> — Request/response logging with middleware-based capture and 7-day retention</li>
    </ul>

    <!-- Security & Infrastructure -->
    <h2>Security &amp; Infrastructure</h2>
    <ul>
      <li><strong>Authentication</strong> — Session-based user authentication with role-based access control</li>
      <li><strong>Credential Security</strong> — All API keys and tokens stored in environment variables, never committed</li>
      <li><strong>System User Tokens</strong> — Meta Business Suite system user tokens that never expire for uninterrupted publishing</li>
      <li><strong>Docker Deployment</strong> — Containerized deployment on Railway with Supabase Storage for all media</li>
      <li><strong>Database Migrations</strong> — Alembic-managed schema migrations for zero-downtime updates</li>
      <li><strong>Request Logging</strong> — Full HTTP request/response logging middleware with automatic log rotation</li>
      <li><strong>Auto-Recovery</strong> — Stuck publishing posts automatically reset on application restart</li>
    </ul>

    <!-- Footer -->
    <div class="footer">
      <p><span class="footer-brand">Viral App</span> — Social Media Content Operations Platform</p>
      <p style="margin-top: 4px;">Proprietary &amp; Confidential &bull; ${new Date().getFullYear()}</p>
      <p style="margin-top: 4px;">Generated on ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
  </div>
</body>
</html>
`

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(printContent)
    printWindow.document.close()
    // Wait for fonts to load, then trigger print
    setTimeout(() => {
      printWindow.print()
    }, 800)
  }
}

// ─── Section Component ──────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  className = '',
}: {
  icon: typeof Info
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ─── Feature Card ───────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Info
  title: string
  description: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 hover:border-primary-200 hover:bg-primary-50/30 transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-primary-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Pipeline Step ──────────────────────────────────────────────────

function PipelineStep({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-lg border border-primary-100">
        <span className="w-5 h-5 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
          {number}
        </span>
        <span className="text-sm font-medium text-primary-700 whitespace-nowrap">{label}</span>
      </div>
      {number < 10 && <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
    </div>
  )
}

// ─── Tech Stack Row ─────────────────────────────────────────────────

function TechRow({
  layer,
  tech,
  purpose,
}: {
  layer: string
  tech: string
  purpose: string
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4 text-sm font-medium text-gray-900 whitespace-nowrap">{layer}</td>
      <td className="py-3 pr-4 text-sm text-primary-700 font-mono">{tech}</td>
      <td className="py-3 text-sm text-gray-600">{purpose}</td>
    </tr>
  )
}

// ─── Brand Row ──────────────────────────────────────────────────────

function BrandRow({
  name,
  handle,
  color,
  focus,
}: {
  name: string
  handle: string
  color: string
  focus: string
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-medium text-gray-900">{name}</span>
        </div>
      </td>
      <td className="py-3 pr-4 text-sm text-gray-600 font-mono">{handle}</td>
      <td className="py-3 text-sm text-gray-600">{focus}</td>
    </tr>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────

export function AboutPage() {
  const [pdfLoading, setPdfLoading] = useState(false)
  const { brands: dynamicBrands } = useDynamicBrands()

  const handleExportPDF = () => {
    setPdfLoading(true)
    try {
      generatePDF(dynamicBrands)
    } finally {
      setTimeout(() => setPdfLoading(false), 1000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">About Viral App</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-primary-50 text-primary-700 rounded-full">
              v1.0
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            Social Media Content Operations Platform — Proprietary technology by Viral App
          </p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={pdfLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-lg font-medium text-sm hover:bg-primary-600 transition-colors disabled:opacity-60"
        >
          {pdfLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          Export PDF
        </button>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 rounded-xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-32 h-32 rounded-full border-2 border-white" />
          <div className="absolute bottom-4 left-12 w-20 h-20 rounded-full border-2 border-white" />
          <div className="absolute top-1/2 right-1/3 w-16 h-16 rounded-full border border-white" />
        </div>
        <div className="relative">
          <h2 className="text-3xl font-extrabold mb-3">
            The Complete Content Automation Engine
          </h2>
          <p className="text-primary-100 text-lg max-w-3xl leading-relaxed">
            Viral App manages the full lifecycle of short-form video content — from content setup and media
            rendering to scheduling and multi-platform publishing across Instagram, Facebook, and YouTube.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            {[
              { icon: Bot, label: 'Content Operations' },
              { icon: Film, label: 'Video Generation' },
              { icon: Globe, label: 'Multi-Platform Publishing' },
              { icon: Layers, label: 'Multi-Brand Pipeline' },
              { icon: BarChart3, label: 'Performance Tracking' },
            ].map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 backdrop-blur-sm rounded-lg text-sm font-medium"
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <Section icon={Info} title="Executive Summary">
        <p className="text-gray-600 leading-relaxed mb-3">
          Viral App is a full-stack social media content operations platform designed to run multiple brands
          from one dashboard. The platform manages the content lifecycle from configuration to media generation,
          scheduled publishing, and delivery to Instagram Reels, Facebook Reels, and YouTube Shorts.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Each brand has independent identity settings (name, handles, colors, prompts, and credentials)
          while using a shared pipeline. The workspace currently manages {dynamicBrands.length} brands with
          separate schedules, jobs, and publish metadata per brand.
        </p>
      </Section>

      {/* Platform Architecture */}
      <Section icon={Server} title="Platform Architecture">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Layer</th>
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Technology</th>
                <th className="text-left py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <TechRow layer="Backend API" tech="FastAPI + Uvicorn" purpose="REST API, job management, scheduling" />
              <TechRow layer="Frontend" tech="React 18 + TypeScript + Vite" purpose="Admin dashboard & content management" />
              <TechRow layer="Database" tech="PostgreSQL + SQLAlchemy" purpose="Jobs, schedules, analytics, brands" />
              <TechRow layer="Content Services" tech="Python service layer" purpose="Job creation, prompt/context assembly, CTA and brand logic" />
              <TechRow layer="Media Engine" tech="Pillow + FFmpeg + MoviePy" purpose="Template image rendering and video generation" />
              <TechRow layer="Storage" tech="Supabase Storage + local output" purpose="Images, videos, thumbnails, and generated assets" />
              <TechRow layer="Video Engine" tech="FFmpeg + MoviePy" purpose="Image-to-video with background music" />
              <TechRow layer="Publishing" tech="Meta Graph API + YouTube API" purpose="Cross-platform social publishing" />
              <TechRow layer="Scheduling" tech="APScheduler" purpose="Background jobs & daemon cycles" />
              <TechRow layer="Deployment" tech="Docker + Railway" purpose="Cloud hosting with Supabase Storage" />
              <TechRow layer="UI Framework" tech="TailwindCSS + Recharts + Lucide" purpose="Modern admin interface" />
            </tbody>
          </table>
        </div>
      </Section>

      {/* Content Generation Pipeline */}
      <Section icon={Zap} title="Content Generation Pipeline">
        <p className="text-gray-600 text-sm mb-4">
          A practical 10-stage pipeline transforms configured inputs into publish-ready content:
        </p>
        <div className="flex flex-wrap gap-y-3 gap-x-1 mb-6">
          {[
            'Pattern Selection',
            'Prompt Build',
            'Content Assembly',
            'Validation',
            'Brand Variation',
            'Brand Differentiation',
            'Image Rendering',
            'Video Production',
            'Caption Building',
            'Publishing',
          ].map((step, i) => (
            <PipelineStep key={step} number={i + 1} label={step} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Brain}
            title="Modular Pipeline"
            description="Workflow steps are separated into focused backend services so job creation, rendering, and publishing can evolve independently."
          />
          <FeatureCard
            icon={Target}
            title="Validation Checks"
            description="Input, scheduling, and platform checks protect publish flows before jobs run."
          />
          <FeatureCard
            icon={Shield}
            title="Brand Separation"
            description="Each brand has isolated settings, credentials, and scheduling state to avoid cross-brand conflicts."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Reusable Templates"
            description="Shared formatting utilities keep output consistent while still supporting brand-level customization."
          />
        </div>
      </Section>

      {/* Operations Workflow */}
      <Section icon={Bot} title="Operations Workflow">
        <p className="text-gray-600 leading-relaxed mb-4">
          Viral App is built for repeatable operations: create content, schedule publication,
          publish to connected platforms, and review outcomes in one dashboard.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FeatureCard
            icon={Search}
            title="CREATE"
            description="Build reels and posts with brand-specific settings and templates."
          />
          <FeatureCard
            icon={Target}
            title="SCHEDULE"
            description="Queue immediate or timed publishing with per-platform selection."
          />
          <FeatureCard
            icon={TrendingUp}
            title="PUBLISH"
            description="Send content to connected accounts with retries and status tracking."
          />
          <FeatureCard
            icon={Sparkles}
            title="REVIEW"
            description="Track job status and analytics to monitor what has been posted."
          />
        </div>
        <div className="mt-4 bg-primary-50 rounded-lg p-4 border border-primary-100">
          <p className="text-sm text-primary-800">
            <strong>Automation Cycle:</strong> Background checks run continuously for queued and scheduled publishing tasks.
          </p>
        </div>
      </Section>

      {/* Multi-Brand System */}
      <Section icon={Layers} title="Scalable Multi-Brand Ecosystem">
        <p className="text-gray-600 text-sm mb-4">
          Architected to support <strong className="text-gray-900">multiple brands</strong> with independent identity settings,
          credentials, and schedules. Each brand runs through the same operational pipeline while keeping
          separate configuration.
        </p>

        {/* Shared Topics */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Shared Topic Coverage</h3>
          <p className="text-xs text-gray-500 mb-3">Typical content themes can be organized per brand while keeping one central workflow:</p>
          <div className="flex flex-wrap gap-2">
            {['Education', 'Tips', 'Lifestyle', 'Motivation', 'Product Highlights', 'Community', 'Promotions'].map(
              (topic) => (
                <span
                  key={topic}
                  className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium border border-primary-100"
                >
                  {topic}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Current Brands */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Currently Active</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</th>
                  <th className="text-left py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Instagram</th>
                </tr>
              </thead>
              <tbody>
                {dynamicBrands.map(brand => (
                  <BrandRow 
                    key={brand.id}
                    name={brand.label} 
                    handle={brand.instagram_handle ? `@${brand.instagram_handle}` : brand.id} 
                    color={brand.color} 
                    focus="" 
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
          <p className="text-sm text-gray-600">
            <strong className="text-gray-900">Content Differentiation:</strong> Brand-specific templates, settings,
            and schedules keep each timeline independent while using the same platform.
          </p>
        </div>
      </Section>

      {/* Publishing */}
      <Section icon={Share2} title="Multi-Platform Publishing">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Instagram}
            title="Instagram Reels"
            description="Two-step Meta Graph API flow: container creation → publish. 9:16 vertical format with thumbnail handling and brand CTAs."
          />
          <FeatureCard
            icon={Facebook}
            title="Facebook Reels"
            description="Single-step Pages API upload. Vertical videos can surface as Reels with per-brand caption settings."
          />
          <FeatureCard
            icon={Youtube}
            title="YouTube Shorts"
            description="Full OAuth 2.0 with YouTube Data API v3. Quota monitoring with per-operation cost tracking and scheduled publishing support."
          />
          <FeatureCard
            icon={Globe}
            title="Multi-Account Orchestration"
            description="Simultaneous publishing across an unlimited number of brand accounts on all platforms with per-brand credential management and failure isolation."
          />
        </div>
      </Section>

      {/* Analytics */}
      <Section icon={BarChart3} title="Analytics & Performance Intelligence">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Eye}
            title="Post-Level Metrics"
            description="Plays, reach, likes, saves, and shares collected at 24h, 48h, and 7-day windows after publishing for granular performance analysis."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Engagement Scoring"
            description="Aggregated engagement indicators for quick performance review across brands and platforms."
          />
          <FeatureCard
            icon={BarChart3}
            title="Brand Analytics"
            description="Cross-platform followers, views, and engagement tracked with historical snapshot data and interactive Recharts visualizations."
          />
          <FeatureCard
            icon={Search}
            title="Historical Tracking"
            description="Historical snapshots support period-over-period checks and trend visibility over time."
          />
        </div>
      </Section>

      {/* Visual Content Engine */}
      <Section icon={Palette} title="Visual Content Engine">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Image}
            title="Brand Image Rendering"
            description="Pillow-based rendering of branded reel images (1080×1920 px) with custom text layout, title bars, and numbered content lines."
          />
          <FeatureCard
            icon={Sparkles}
            title="Background Variants"
            description="Template-based visual variants for light/dark styles with brand-specific color control."
          />
          <FeatureCard
            icon={Video}
            title="Video Production"
            description="FFmpeg-powered static-to-video conversion with randomized background music (3 tracks, 7–8 second duration, random start offset)."
          />
          <FeatureCard
            icon={Type}
            title="Caption Formatting"
            description="Structured captions with CTA options and platform metadata for publishing workflows."
          />
        </div>
      </Section>

      {/* Scheduling */}
      <Section icon={Calendar} title="Intelligent Scheduling System">
        <p className="text-gray-600 text-sm leading-relaxed mb-3">
          PostgreSQL-backed scheduling engine with 60-second polling intervals. Supports immediate and timed publishing 
          with multi-platform selection (Instagram, Facebook, YouTube) per post. Features include partial retry on 
          platform-specific failures, automatic stuck-post recovery on restart, and full metadata tracking for 
          video/thumbnail paths and publish results.
        </p>
        <div className="flex flex-wrap gap-2">
          {['Immediate Publishing', 'Scheduled Publishing', 'Multi-Platform Selection', 'Partial Retry', 'Stuck-Post Recovery', 'Full Audit Trail'].map(
            (feature) => (
              <span
                key={feature}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100"
              >
                <CheckCircle2 className="w-3 h-3" />
                {feature}
              </span>
            ),
          )}
        </div>
      </Section>

      {/* Admin Dashboard */}
      <Section icon={LayoutGrid} title="Admin Dashboard">
        <p className="text-gray-600 text-sm mb-4">
          A modern React 18 dashboard provides full operational control through an intuitive interface:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { icon: Film, title: 'Content Generator', desc: 'Create reels & posts with previews' },
            { icon: Cpu, title: 'Job Management', desc: 'Track generation with progress bars' },
            { icon: Calendar, title: 'Scheduling', desc: 'Visual calendar & platform selection' },
            { icon: BarChart3, title: 'Analytics', desc: 'Interactive charts & performance data' },
            { icon: Layers, title: 'Brand Manager', desc: 'CRUD for brand configs & colors' },
            { icon: Info, title: 'About', desc: 'Platform overview and exportable PDF snapshot' },
            { icon: User, title: 'Profile', desc: 'Account info and session settings' },
            { icon: Shield, title: 'System Logs', desc: '7-day retention with middleware capture' },
            { icon: Database, title: 'Connected Pages', desc: 'Social account management' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <Icon className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{title}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Security */}
      <Section icon={Shield} title="Security & Infrastructure">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureCard
            icon={Shield}
            title="Authentication & Access"
            description="Session-based user authentication with role-based access control and secure environment variable management."
          />
          <FeatureCard
            icon={Database}
            title="System User Tokens"
            description="Meta Business Suite system user tokens that never expire, ensuring uninterrupted publishing operations."
          />
          <FeatureCard
            icon={Server}
            title="Docker + Railway"
            description="Containerized deployment on Railway with Supabase Storage for all media and Alembic-managed schema migrations."
          />
          <FeatureCard
            icon={Cpu}
            title="Auto-Recovery"
            description="Stuck publishing posts automatically reset on application restart. Log rotation with 24-hour cleanup cycles and 7-day retention."
          />
        </div>
      </Section>

      {/* Footer */}
      <div className="text-center py-8 border-t border-gray-200">
        <p className="text-sm font-bold text-primary-600">Viral App</p>
        <p className="text-xs text-gray-400 mt-1">
          Social Media Content Operations Platform &bull; Proprietary &amp; Confidential &bull; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
