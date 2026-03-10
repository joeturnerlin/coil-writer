import { type Extension, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import type { Annotation } from './types'

// ── StateEffects ──

export const addAnnotation = StateEffect.define<Annotation>()
export const removeAnnotation = StateEffect.define<string>() // annotation id
export const clearAnnotations = StateEffect.define<void>()
export const updateAnnotation = StateEffect.define<{ id: string; changes: Partial<Annotation> }>()

// ── Decoration for highlighted annotations ──

const annotationMark = Decoration.mark({ class: 'cm-annotation-mark' })

// ── StateField ──

interface AnnotationFieldValue {
  annotations: Annotation[]
  decorations: DecorationSet
}

function buildDecorations(annotations: Annotation[]): DecorationSet {
  const ranges = annotations
    .filter((a) => a.from < a.to)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((a) => annotationMark.range(a.from, a.to))
  return Decoration.set(ranges)
}

export const annotationField = StateField.define<AnnotationFieldValue>({
  create() {
    return { annotations: [], decorations: Decoration.none }
  },

  update(value, tr) {
    let annotations = value.annotations
    let changed = false

    // Map positions through document changes
    if (tr.docChanged) {
      annotations = annotations.map((a) => ({
        ...a,
        from: tr.changes.mapPos(a.from),
        to: tr.changes.mapPos(a.to),
      }))
      changed = true
    }

    // Process effects
    for (const effect of tr.effects) {
      if (effect.is(addAnnotation)) {
        annotations = [...annotations, effect.value]
        changed = true
      } else if (effect.is(removeAnnotation)) {
        annotations = annotations.filter((a) => a.id !== effect.value)
        changed = true
      } else if (effect.is(clearAnnotations)) {
        annotations = []
        changed = true
      } else if (effect.is(updateAnnotation)) {
        annotations = annotations.map((a) => (a.id === effect.value.id ? { ...a, ...effect.value.changes } : a))
        changed = true
      }
    }

    if (!changed) return value

    return {
      annotations,
      decorations: buildDecorations(annotations),
    }
  },

  provide(field) {
    return EditorView.decorations.from(field, (v) => v.decorations)
  },
})

/**
 * Get current annotations from an EditorView.
 */
export function getAnnotations(view: EditorView): Annotation[] {
  return view.state.field(annotationField).annotations
}
