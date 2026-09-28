import { useOnboardingStore } from '../store/onboarding-store'

const TOUR_STEPS = [
  {
    title: 'Mode Selector',
    body: 'Switch between Write and Analyze modes to write or study your script.',
    position: { top: 60, left: '50%', transform: 'translateX(-50%)' } as React.CSSProperties,
  },
  {
    title: 'Left Panel',
    body: 'Browse scenes, view story structure, and see beat mapping.',
    position: { top: 120, left: 24 } as React.CSSProperties,
  },
  {
    title: 'Right Panel',
    body: 'Character profiles that steer AI rewrites \u2014 edit them to direct the AI.',
    position: { top: 120, right: 24 } as React.CSSProperties,
  },
  {
    title: 'Editor',
    body: 'Select text and get AI-powered rewrite suggestions.',
    position: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as React.CSSProperties,
  },
  {
    title: 'Stats Bar',
    body: 'Track word count, dialogue percentage, estimated runtime.',
    position: { bottom: 48, left: '50%', transform: 'translateX(-50%)' } as React.CSSProperties,
  },
]

export function OnboardingOverlay() {
  const { tourStep, nextStep, skipTour } = useOnboardingStore()

  if (tourStep === null) return null

  const step = TOUR_STEPS[tourStep]
  if (!step) return null

  const isLast = tourStep === TOUR_STEPS.length - 1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--onboarding-scrim)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
      }}
      onClick={(e) => {
        // Clicking the scrim skips tour
        if (e.target === e.currentTarget) skipTour()
      }}
    >
      {/* Card */}
      <div
        style={{
          position: 'fixed',
          ...step.position,
          background: 'var(--onboarding-card-bg)',
          border: '1px solid var(--onboarding-card-border)',
          borderRadius: 8,
          padding: 20,
          maxWidth: 320,
          zIndex: 10000,
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          {step.title}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          {step.body}
        </div>

        {/* Actions row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 6 }}>
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: i === tourStep ? 'var(--accent-cyan)' : 'var(--text-dim)',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Skip link */}
            <button
              type="button"
              onClick={skipTour}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Skip
            </button>

            {/* Next / Finish button */}
            <button
              type="button"
              onClick={nextStep}
              style={{
                background: 'var(--accent-cyan)',
                color: '#000',
                padding: '6px 16px',
                borderRadius: 4,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
