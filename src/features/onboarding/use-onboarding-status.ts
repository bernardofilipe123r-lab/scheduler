import { useAuth } from '@/features/auth'
import { useBrands } from '@/features/brands/api/use-brands'
import { useNicheConfig } from '@/features/brands/api/use-niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'

export function useOnboardingStatus() {
  const { isAuthenticated, user } = useAuth()
  const { data: brands, isLoading: brandsLoading } = useBrands()
  const { data: config, isLoading: configLoading } = useNicheConfig()
  const { data: connections, isLoading: connectionsLoading } = useBrandConnections()

  const hasBrand = (brands?.length ?? 0) > 0
  const strength = config ? getConfigStrength(config) : 'basic'
  const hasDNA = strength === 'good' || strength === 'excellent'
  const onboardingCompleted = Boolean(user?.onboardingCompleted)

  // Check if at least one platform is connected across all brands
  const hasConnection = Boolean(
    connections?.brands?.some(
      (b) => b.instagram.connected || b.youtube.connected
    )
  )

  // New users without a brand always need onboarding.
  // Once a user has completed onboarding (or has DNA configured as a legacy
  // pre-flag user), disconnecting platforms must NOT send them back.
  const needsOnboarding =
    isAuthenticated && !onboardingCompleted && !hasDNA && !hasBrand
  const onboardingStep: 1 | 3 = !hasBrand ? 1 : 3

  return {
    needsOnboarding,
    onboardingStep,
    hasBrand,
    hasDNA,
    hasConnection,
    onboardingCompleted,
    isLoading: brandsLoading || configLoading || connectionsLoading,
  }
}
