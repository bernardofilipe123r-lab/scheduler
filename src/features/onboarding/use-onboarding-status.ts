import { useAuth } from '@/features/auth'
import { useBrands } from '@/features/brands/api/use-brands'
import { useNicheConfig } from '@/features/brands/api/use-niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'

export function useOnboardingStatus() {
  const { isAuthenticated, user } = useAuth()
  const { data: brands, isLoading: brandsLoading } = useBrands()
  const { data: config, isLoading: configLoading } = useNicheConfig()

  const hasBrand = (brands?.length ?? 0) > 0
  const strength = config ? getConfigStrength(config) : 'basic'
  const hasDNA = strength === 'good' || strength === 'excellent'
  const onboardingCompleted = Boolean(user?.onboardingCompleted)

  // New users: need onboarding until they explicitly complete it
  // Existing users (pre-onboarding-tracking): have brand but no flag → skip onboarding
  const needsOnboarding = isAuthenticated && !onboardingCompleted && !hasBrand
  const onboardingStep: 1 | 2 = !hasBrand ? 1 : 2

  return {
    needsOnboarding,
    onboardingStep,
    hasBrand,
    hasDNA,
    onboardingCompleted,
    isLoading: brandsLoading || configLoading,
  }
}
