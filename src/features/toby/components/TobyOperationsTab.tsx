import { TobyTickMonitor } from './TobyTickMonitor'
import { TobyPipeline } from './TobyPipeline'

export function TobyOperationsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TobyTickMonitor />
      <TobyPipeline />
    </div>
  )
}
