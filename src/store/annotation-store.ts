import { create } from 'zustand'
import type { Annotation, AnnotationAction, AnnotationSeverity } from '../editor/types'

interface AnnotationState {
  annotations: Annotation[]
  filterAction: AnnotationAction | 'all'
  filterSeverity: AnnotationSeverity | 'all'
  filterDimension: string | 'all'
  selectedId: string | null
  editingAnnotation: Annotation | null
  /** Imported notes whose passage could not be found with certainty; the user places them by hand. */
  needsPlacing: Annotation[]
  /** Open note composer: the passage being annotated (null = closed). */
  /** One-line result of the last import/export, shown in the Notes panel. */
  notice: string | null
  composer: { from: number; to: number; text: string } | null

  syncFromEditor: (annotations: Annotation[]) => void
  setFilterAction: (action: AnnotationAction | 'all') => void
  setFilterSeverity: (severity: AnnotationSeverity | 'all') => void
  setFilterDimension: (dimension: string | 'all') => void
  setSelectedId: (id: string | null) => void
  setEditingAnnotation: (annotation: Annotation | null) => void
  setNeedsPlacing: (notes: Annotation[]) => void
  setNotice: (notice: string | null) => void
  setComposer: (composer: { from: number; to: number; text: string } | null) => void
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  filterAction: 'all',
  filterSeverity: 'all',
  filterDimension: 'all',
  selectedId: null,
  editingAnnotation: null,
  needsPlacing: [],
  notice: null,
  composer: null,

  syncFromEditor: (annotations) => set({ annotations }),
  setFilterAction: (filterAction) => set({ filterAction }),
  setFilterSeverity: (filterSeverity) => set({ filterSeverity }),
  setFilterDimension: (filterDimension) => set({ filterDimension }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setEditingAnnotation: (editingAnnotation) => set({ editingAnnotation }),
  setNeedsPlacing: (needsPlacing) => set({ needsPlacing }),
  setNotice: (notice) => set({ notice }),
  setComposer: (composer) => set({ composer }),
}))
