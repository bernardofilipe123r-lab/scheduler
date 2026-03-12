import { TobyKnowledgeMeter } from './TobyKnowledgeMeter'
import { TobyBufferHealth } from './TobyBufferHealth'
import { TobyDNASuggestions } from './TobyDNASuggestions'
import { TobyQuickChecks } from './TobyQuickChecks'

export function TobyOverviewTab() {
  return (
    <div className="space-y-6">
      {/* Knowledge meter — phase progress */}
      <TobyKnowledgeMeter />

      {/* DNA suggestions — only renders when there are pending suggestions */}
      <TobyDNASuggestions />

      {/* Buffer health + operations quick status side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TobyBufferHealth />
        <TobyQuickChecks />
      </div>
    </div>
  )
}
