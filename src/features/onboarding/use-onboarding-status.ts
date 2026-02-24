import { useAuth } from '@/features/auth'
import { useBrands } from '@/features/brands/api/use-brands'
import { useNicheConfig } from '@/features/brands/api/use-niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'

export function useOnboardingStatus() {
  const { isAuthenticated } = useAuth()
  const { data: brands, isLoading: brandsLoading } = useBrands()
  const { data: config, isLoading: configLoading } = useNicheConfig()

  const hasBrand = (brands?.length ?? 0) > 0
  const strength = config ? getConfigStrength(config) : 'basic'
  const hasDNA = strength === 'good' || strength === 'excellent'

  // Brand creation is the only gate — DNA steps are freely navigable
  const needsOnboarding = isAuthenticated && !hasBrand
  const onboardingStep: 1 | 2 = !hasBrand ? 1 : 2

  return {
    needsOnboarding,
    onboardingStep,
    hasBrand,
    hasDNA,
    isLoading: brandsLoading || configLoading,
  }
}
