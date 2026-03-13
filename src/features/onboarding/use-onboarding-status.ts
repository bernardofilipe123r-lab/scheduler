import { useAuth } from '@/features/auth'
import { useBrands } from '@/features/brands/api/use-brands'
import { useNicheConfig } from '@/features/brands/api/use-niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { useContentDNAProfiles } from '@/features/content-dna'

export function useOnboardingStatus() {
  const { isAuthenticated, user } = useAuth()
  const { data: brands, isLoading: brandsLoading } = useBrands({ enabled: isAuthenticated })
  const { data: config, isLoading: configLoading } = useNicheConfig({ enabled: isAuthenticated })
  const { data: dnaData, isLoading: dnaLoading } = useContentDNAProfiles({ enabled: isAuthenticated })
  const { data: connections, isLoading: connectionsLoading } = useBrandConnections({ enabled: isAuthenticated })

  const hasBrand = (brands?.length ?? 0) > 0

  // Check DNA profiles (new system) or legacy NicheConfig
  const dnaProfiles = dnaData?.profiles ?? []
  const hasDNAProfiles = dnaProfiles.length > 0
  const strength = config ? getConfigStrength(config) : 'basic'
  const hasLegacyDNA = strength === 'good' || strength === 'excellent'
  const hasDNA = hasDNAProfiles || hasLegacyDNA

  const onboardingCompleted = Boolean(user?.onboardingCompleted)

  // Check if at least one platform is connected across all brands
  const hasConnection = Boolean(
    connections?.brands?.some(
      (b) => b.instagram.connected || b.youtube.connected
    )
  )

  // needsOnboarding depends ONLY on the explicit onboarding_completed flag
  // in Supabase user metadata (set at the final wizard step).
  //
  // DO NOT add hasBrand, hasDNA, or any other calculated state here.
  // Those values change mid-wizard (brand creation, DNA auto-save) and
  // would cause the route guard to kick the user out before finishing.
  //
  // Legacy users (pre-flag) are handled by the backfill script
  // (scripts/backfill_onboarding_flag.py) which sets the flag to true.
  const needsOnboarding = isAuthenticated && !onboardingCompleted
  const onboardingStep: 1 | 3 = !hasBrand ? 1 : 3

  return {
    needsOnboarding,
    onboardingStep,
    hasBrand,
    hasDNA,
    hasConnection,
    onboardingCompleted,
    isLoading: brandsLoading || configLoading || connectionsLoading || dnaLoading,
  }
}
