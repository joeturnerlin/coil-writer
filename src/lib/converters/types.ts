/**
 * Converter type definitions — shared IR for all script format conversions.
 */

export type ElementType =
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered-text'
  | 'page-break'
  | 'blank'
  | 'general'
  | 'episode-boundary'
  | 'killbox-section'
  | 'boneyard'

export type InlineStyle =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bold-italic'
  | 'bold-underline'
  | 'italic-underline'
  | 'bold-italic-underline'

export interface InlineSpan {
  from: number
  to: number
  style: InlineStyle
}

export interface ScriptNote {
  text: string
  position: number
}

export interface ScriptElement {
  type: ElementType
  text: string
  spans?: InlineSpan[]
  sceneNumber?: string
  isDualDialogue?: boolean
  dualDialoguePosition?: 'left' | 'right'
  notes?: ScriptNote[]
  original?: Record<string, unknown>
}

export interface TitlePageField {
  key: string
  values: string[]
}

export interface ScriptMetadata {
  sourceFormat: string
  sourceVersion?: string
}

export interface ScriptIR {
  titlePage: TitlePageField[]
  elements: ScriptElement[]
  metadata: ScriptMetadata
}

export type WarningSeverity = 'info' | 'warning' | 'error'

export interface ConversionWarning {
  line?: number
  element?: string
  message: string
  severity: WarningSeverity
}

export interface ConversionResult {
  ir: ScriptIR
  warnings: ConversionWarning[]
}

export interface ExportResult {
  data: Blob
  mimeType: string
  extension: string
  warnings: ConversionWarning[]
}

export type FormatId = 'fountain' | 'fdx' | 'fadein' | 'highland' | 'writerduet' | 'celtx'

export interface FormatDescriptor {
  id: FormatId
  name: string
  extensions: string[]
  canImport: boolean
  canExport: boolean
}

export type Importer = (data: ArrayBuffer) => Promise<ConversionResult>
export type Exporter = (ir: ScriptIR) => Promise<ExportResult>
