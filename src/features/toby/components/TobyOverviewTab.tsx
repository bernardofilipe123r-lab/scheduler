import { TobyKnowledgeMeter } from './TobyKnowledgeMeter'
import { TobyBufferHealth } from './TobyBufferHealth'
import { TobyLearningFeed } from './TobyLearningFeed'
import { TobyDNASuggestions } from './TobyDNASuggestions'

export function TobyOverviewTab() {
  return (
    <div className="space-y-6">
      {/* Knowledge meter replaces the old phase timeline */}
      <TobyKnowledgeMeter />

      {/* DNA suggestions — only renders when there are pending suggestions */}
      <TobyDNASuggestions />

      {/* Buffer health + learning feed side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <TobyBufferHealth />
        </div>
        <div className="lg:col-span-3">
          <TobyLearningFeed />
        </div>
      </div>
    </div>
  )
}
