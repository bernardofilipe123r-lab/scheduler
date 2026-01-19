import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '../layout'
import { GeneratorPage } from '@/pages/Generator'
import { HistoryPage } from '@/pages/History'
import { JobDetailPage } from '@/pages/JobDetail'
import { ScheduledPage } from '@/pages/Scheduled'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<GeneratorPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="job/:jobId" element={<JobDetailPage />} />
        <Route path="scheduled" element={<ScheduledPage />} />
      </Route>
    </Routes>
  )
}
