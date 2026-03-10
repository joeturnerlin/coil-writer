import { create } from 'zustand'
import type { Annotation, AnnotationAction, AnnotationSeverity } from '../editor/types'

interface AnnotationState {
  annotations: Annotation[]
  filterAction: AnnotationAction | 'all'
  filterSeverity: AnnotationSeverity | 'all'
  filterDimension: string | 'all'
  selectedId: string | null
  editingAnnotation: Annotation | null

  syncFromEditor: (annotations: Annotation[]) => void
  setFilterAction: (action: AnnotationAction | 'all') => void
  setFilterSeverity: (severity: AnnotationSeverity | 'all') => void
  setFilterDimension: (dimension: string | 'all') => void
  setSelectedId: (id: string | null) => void
  setEditingAnnotation: (annotation: Annotation | null) => void
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  annotations: [],
  filterAction: 'all',
  filterSeverity: 'all',
  filterDimension: 'all',
  selectedId: null,
  editingAnnotation: null,

  syncFromEditor: (annotations) => set({ annotations }),
  setFilterAction: (filterAction) => set({ filterAction }),
  setFilterSeverity: (filterSeverity) => set({ filterSeverity }),
  setFilterDimension: (filterDimension) => set({ filterDimension }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setEditingAnnotation: (editingAnnotation) => set({ editingAnnotation }),
}))
