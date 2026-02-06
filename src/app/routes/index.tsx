import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '../layout'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'
import { ConnectedPage } from '@/pages/Connected'
import { BrandsPage } from '@/pages/Brands'
import { PostsPage } from '@/pages/Posts'
import { AnalyticsPage } from '@/pages/Analytics'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<GeneratorPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
        <Route path="connected" element={<ConnectedPage />} />
        <Route path="brands" element={<BrandsPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
      </Route>
    </Routes>
  )
}
