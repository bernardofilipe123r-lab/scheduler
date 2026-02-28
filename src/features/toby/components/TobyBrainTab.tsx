import { TobyInsights } from './TobyInsights'
import { TobyExperiments } from './TobyExperiments'

export function TobyBrainTab() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TobyInsights />
        <TobyExperiments />
      </div>
    </div>
  )
}
