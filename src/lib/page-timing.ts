import type { SceneBlock } from './scene-model'

export interface SceneTiming {
  sceneIndex: number
  seconds: number
  formatted: string
}

export interface DocumentTiming {
  totalSeconds: number
  totalFormatted: string
  perScene: SceneTiming[]
}

export function computeTiming(scenes: SceneBlock[]): DocumentTiming {
  const perScene: SceneTiming[] = scenes.map((scene) => {
    const actionSeconds = scene.actionLines * 4
    const dialogueSeconds = scene.dialogueLines * 2.5
    const transitionSeconds = scene.heading ? 3 : 0
    const seconds = Math.round(actionSeconds + dialogueSeconds + transitionSeconds)
    return {
      sceneIndex: scene.index,
      seconds,
      formatted: formatDuration(seconds),
    }
  })

  const totalSeconds = perScene.reduce((sum, s) => sum + s.seconds, 0)

  return {
    totalSeconds,
    totalFormatted: formatDuration(totalSeconds),
    perScene,
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
