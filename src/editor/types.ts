/**
 * All possible Fountain element types the parser can classify a line as.
 */
export enum FountainElement {
  TitlePageKey = 'title-page-key',
  TitlePageValue = 'title-page-value',
  SceneHeading = 'scene-heading',
  Character = 'character',
  Dialogue = 'dialogue',
  Parenthetical = 'parenthetical',
  Transition = 'transition',
  Action = 'action',
  EpisodeBoundary = 'episode-boundary',
  KillboxSection = 'killbox-section',
  PageBreak = 'page-break',
  Boneyard = 'boneyard',
  Note = 'note',
  CenteredText = 'centered-text',
  Lyric = 'lyric',
  Blank = 'blank',
}

/**
 * State carried between lines by the StreamParser.
 * StreamLanguage.define() stores this object.
 */
export interface FountainParserState {
  /** What type the previous non-blank line was classified as */
  prevLineType: FountainElement | null
  /** Whether the immediately previous line was blank */
  prevLineBlank: boolean
  /** How many consecutive blank lines have occurred */
  consecutiveBlanks: number
  /** Whether we are still in the title page (before first ===) */
  inTitlePage: boolean
  /** Whether we are inside a boneyard block */
  inBoneyard: boolean
  /** Current episode number (0 = before first episode marker) */
  currentEpisode: number
}

/**
 * Episode extracted from document for navigation.
 */
export interface Episode {
  number: number
  title: string
  /** Absolute character position in the document where this episode starts */
  startPos: number
}

/**
 * Editor modes — controls sidebar content and CM6 extensions.
 * Editor is always editable in both modes. Modes change surroundings, not editor state.
 *
 * Migration: 'edit' -> 'write', 'annotate' -> 'analyze'
 */
export type EditorMode = 'write' | 'analyze'

/**
 * Full-screen overlays — portals rendered as siblings to editor layout.
 * Independent from EditorMode. Can be triggered from toolbar or keyboard shortcut.
 */
export type ActiveOverlay = 'none' | 'beat-board'

/** Structure framework identifier */
export type StructureFramework = 'save-the-cat' | 'heros-journey' | 'story-structure' | 'sequence'

/** Active tab in the left panel during Analyze mode */
export type AnalyzeLeftTab = 'structure' | 'beatboard'

/**
 * Stats derived from the document.
 */
export interface DocumentStats {
  lineCount: number
  wordCount: number
  dialogueLineCount: number
  totalContentLines: number
  dialoguePercentage: number
  estimatedPages: number
  episodeCount: number
  sceneCount: number
}

/**
 * Annotation action types.
 */
export type AnnotationAction = 'rewrite' | 'delete' | 'move' | 'flag'

export type AnnotationSeverity = 'P1' | 'P2' | 'P3'

/**
 * An annotation attached to a text range in the document.
 * Positions are CM6 document positions (absolute character offsets).
 */
export interface Annotation {
  id: string
  from: number
  to: number
  selectedText: string
  action: AnnotationAction
  comment: string
  proposedText?: string
  severity?: AnnotationSeverity
  dimensions?: string[]
  createdAt: string
  // Anchor fields for Note Transfer (Phase 3)
  anchorHeading?: string
  anchorContext?: string
  anchorCharacter?: string
  fileName?: string
}
