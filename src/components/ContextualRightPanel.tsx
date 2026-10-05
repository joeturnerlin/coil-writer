import { useSettingsStore } from '../store/settings-store'
import { AnnotationsPanel } from './AnnotationsPanel'
import { CharacterHub } from './CharacterHub'
import { NotesPanel } from './NotesPanel'
import { ProofreadPanel } from './ProofreadPanel'

export function ContextualRightPanel() {
  const { editorMode, showAnnotations, showProofread, showNotes } = useSettingsStore()

  if (showProofread) return <ProofreadPanel />
  if (showNotes) return <NotesPanel />

  if (editorMode === 'write') {
    if (!showAnnotations) return null
    return <AnnotationsPanel />
  }

  // Analyze mode
  return <CharacterHub />
}
