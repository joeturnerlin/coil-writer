import { useEffect, useRef } from 'react'
import { useOnboardingStore } from '../store/onboarding-store'

interface FeatureBadgeProps {
  feature: string
  children: React.ReactNode
}

export function FeatureBadge({ feature, children }: FeatureBadgeProps) {
  const hasSeenFeature = useOnboardingStore((s) => s.hasSeenFeature(feature))
  const markFeatureSeen = useOnboardingStore((s) => s.markFeatureSeen)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (hasSeenFeature) return

    timerRef.current = setTimeout(() => {
      markFeatureSeen(feature)
    }, 10_000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [feature, hasSeenFeature, markFeatureSeen])

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {children}
      {!hasSeenFeature && (
        <span
          style={{
            fontSize: 8,
            background: 'var(--accent-cyan)',
            color: '#000',
            borderRadius: 8,
            padding: '1px 6px',
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          New
        </span>
      )}
    </span>
  )
}
