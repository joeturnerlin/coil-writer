import { useSettingsStore } from '../store/settings-store'
import { AnnotationsPanel } from './AnnotationsPanel'
import { CharacterHub } from './CharacterHub'
import { ProofreadPanel } from './ProofreadPanel'

export function ContextualRightPanel() {
  const { editorMode, showAnnotations, showProofread } = useSettingsStore()

  if (showProofread) return <ProofreadPanel />

  if (editorMode === 'write') {
    if (!showAnnotations) return null
    return <AnnotationsPanel />
  }

  // Analyze mode
  return <CharacterHub />
}
