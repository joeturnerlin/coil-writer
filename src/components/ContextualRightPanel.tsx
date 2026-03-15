import { useSettingsStore } from '../store/settings-store'
import { AnnotationsPanel } from './AnnotationsPanel'
import { CharacterHub } from './CharacterHub'

export function ContextualRightPanel() {
  const { editorMode, showAnnotations } = useSettingsStore()

  if (editorMode === 'write') {
    if (!showAnnotations) return null
    return <AnnotationsPanel />
  }

  // Analyze mode
  return <CharacterHub />
}
