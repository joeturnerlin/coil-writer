import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type ScriptIndex,
  buildScriptIndex,
  elementAtLine,
  hashRange,
  sceneAtLine,
  textAtLines,
} from '../src/lib/script-index'

const fx = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf8')

function allElements(ix: ScriptIndex) {
  return [...ix.preamble, ...ix.scenes.flatMap((s) => s.elements)]
}

/** Property: every element's text is exactly the source slice at its offsets, and
 *  line numbers agree with offsets. */
function checkSlices(ix: ScriptIndex, src: string) {
  for (const e of allElements(ix)) {
    expect(e.text).toBe(src.slice(e.from, e.to))
    expect(e.from).toBe(ix.lineStarts[e.lineStart - 1])
    expect(src.slice(0, e.from).split('\n').length).toBe(e.lineStart)
    expect(src.slice(0, e.to).split('\n').length).toBe(e.lineEnd)
  }
}

describe('ScriptIndex: edge-case fixture', () => {
  const src = fx('script-index-edge.fountain')
  const ix = buildScriptIndex(src)
  const kinds = (i: number) => ix.scenes[i].elements.map((e) => `${e.kind}${e.speaker ? `:${e.speaker}` : ''}`)

  it('versions and hashes', () => {
    expect(ix.schemaVersion).toBe(1)
    expect(ix.parserVersion).toBe(1)
    expect(ix.revisionHash).toBe(hashRange(src))
    expect(buildScriptIndex(`${src} `).revisionHash).not.toBe(ix.revisionHash)
  })

  it('keeps title-page fields out of scenes', () => {
    expect(ix.titlePage.map((t) => t.key)).toEqual(['Title', 'Credit', 'Author', 'Draft date'])
    expect(ix.titlePage[3].value).toContain('and a continued value line')
    expect(allElements(ix).some((e) => e.text.includes('Test Author'))).toBe(false)
  })

  it('finds headings: forced, scene numbers, int/ext, time', () => {
    expect(ix.scenes.map((s) => s.rawHeading)).toEqual([
      'INT. KITCHEN - NIGHT',
      '.FORCED HEADING AT DAWN',
      'EXT. ROOF - LATER #12A#',
      'INT./EXT. CAR - MOVING',
      'int. lowercase room - morning',
    ])
    const [k, f, r, c, l] = ix.scenes
    expect([k.intExt, k.location, k.timeOfDay, k.timeRaw]).toEqual(['INT', 'KITCHEN', 'NIGHT', 'NIGHT'])
    expect([f.intExt, f.location, f.timeOfDay]).toEqual(['UNKNOWN', 'FORCED HEADING AT DAWN', 'UNKNOWN'])
    expect([r.intExt, r.location, r.timeOfDay, r.sceneNumber]).toEqual(['EXT', 'ROOF', 'LATER', '12A'])
    expect([c.intExt, c.location, c.timeOfDay, c.timeRaw]).toEqual(['INT/EXT', 'CAR - MOVING', 'UNKNOWN', null])
    expect([l.intExt, l.location, l.timeOfDay]).toEqual(['INT', 'lowercase room', 'MORNING'])
  })

  it('preamble holds pre-heading structure; boneyard heading is not a scene', () => {
    expect(ix.preamble.map((e) => e.tag ?? e.kind)).toEqual([
      'page-break',
      'episode-boundary',
      'section',
      'synopsis',
      'action',
    ])
    expect(ix.scenes.some((s) => s.rawHeading.includes('GHOST'))).toBe(false)
    expect(ix.characters.some((c) => c.name === 'GHOST')).toBe(false)
  })

  it('groups elements, notes, parentheticals, transitions, boneyard', () => {
    expect(kinds(0)).toEqual([
      'action',
      'note',
      'cue:MARY',
      'parenthetical:MARY',
      'dialogue:MARY',
      'cue:JOHN',
      'dialogue:JOHN',
      'cue:JOHN',
      'dialogue:JOHN',
      'cue:MCCLANE',
      'dialogue:MCCLANE',
      'action', // stray parenthetical outside a dialogue block
      'other', // boneyard
      'transition',
    ])
    const el = ix.scenes[0].elements
    expect(el[1].lineEnd - el[1].lineStart).toBe(1) // multi-line note
    expect(el[6].text).toBe("I'm here.\nAlways.") // multi-line dialogue merged
    expect(el[12].tag).toBe('boneyard')
    expect(el[0].text).toContain('[[check the rain sound]]') // inline note stays in action
  })

  it('cue extensions', () => {
    const cues = ix.scenes[0].elements.filter((e) => e.kind === 'cue')
    expect(cues.map((c) => c.extension)).toEqual([undefined, 'V.O.', "O.S., CONT'D", undefined])
    expect(ix.characters.find((c) => c.name === 'JOHN')?.cueCount).toBe(2)
  })

  it('forced cue is normalised with raw spelling as alias', () => {
    const m = ix.characters.find((c) => c.name === 'MCCLANE')
    expect(m?.aliases).toEqual(['McCLANE'])
  })

  it('dual dialogue', () => {
    const el = ix.scenes[1].elements
    expect(el.map((e) => `${e.kind}:${e.dual ? 'dual' : ''}`)).toEqual([
      'cue:dual',
      'dialogue:dual',
      'cue:',
      'dialogue:',
      'action:',
      'transition:',
    ])
    expect(el[0].speaker).toBe('BRICK')
  })

  it('transitions (including forced >)', () => {
    const el = ix.scenes[1].elements
    expect(el.filter((e) => e.kind === 'transition').map((e) => e.text)).toEqual(['> FADE OUT.'])
    expect(el[4].text).toBe('> BURN TO WHITE <') // centered text is action, not a transition
  })

  it('character summary', () => {
    const mary = ix.characters.find((c) => c.name === 'MARY')
    expect(mary).toMatchObject({ firstSceneIndex: 0, cueCount: 2, scenes: [0, 1] })
    expect(mary?.lineCount).toBe(2)
    const bob = ix.characters.find((c) => c.name === 'BOB')
    expect(bob?.firstSceneIndex).toBe(2)
  })

  it('structural lines before the next heading do not alter sceneHash', () => {
    const edited = src.replace('.FORCED HEADING AT DAWN', '# NEW SECTION\n\n.FORCED HEADING AT DAWN')
    const b = buildScriptIndex(edited)
    expect(b.scenes[0].sceneHash).toBe(ix.scenes[0].sceneHash)
    expect(b.scenes[1].sceneHash).toBe(ix.scenes[1].sceneHash)
  })

  it('sceneHash is position independent and content sensitive', () => {
    const shifted = buildScriptIndex(`INT. NEW - DAY\n\nHello.\n\n${src}`)
    expect(shifted.scenes.slice(1).map((s) => s.sceneHash)).toEqual(ix.scenes.map((s) => s.sceneHash))
    const changed = buildScriptIndex(src.replace('Always.', 'Never.'))
    expect(changed.scenes[0].sceneHash).not.toBe(ix.scenes[0].sceneHash)
    expect(changed.scenes[1].sceneHash).toBe(ix.scenes[1].sceneHash)
  })

  it('slice property', () => checkSlices(ix, src))
})

describe('ScriptIndex: no title page', () => {
  it('does not swallow a first-line heading as title page', () => {
    const src = fx('script-index-noheader.fountain')
    const ix = buildScriptIndex(src)
    expect(ix.titlePage).toEqual([])
    expect(ix.scenes).toHaveLength(1)
    expect(ix.scenes[0].headingLine).toBe(1)
    expect(ix.scenes[0].elements.map((e) => e.kind)).toEqual(['cue', 'dialogue', 'transition'])
    checkSlices(ix, src)
  })
})

describe('ScriptIndex: CRLF and blank-line variants', () => {
  const lf = fx('script-index-edge.fountain')
  const crlf = lf.replace(/\n/g, '\r\n')
  it('CRLF yields same structure with exact source slices', () => {
    const a = buildScriptIndex(lf)
    const b = buildScriptIndex(crlf)
    expect(b.scenes.map((s) => [s.rawHeading, s.location, s.timeOfDay, s.lineStart, s.lineEnd])).toEqual(
      a.scenes.map((s) => [s.rawHeading, s.location, s.timeOfDay, s.lineStart, s.lineEnd]),
    )
    expect(b.characters.map((c) => [c.name, c.cueCount, c.lineCount])).toEqual(
      a.characters.map((c) => [c.name, c.cueCount, c.lineCount]),
    )
    for (const e of allElements(b)) expect(e.text.endsWith('\r')).toBe(false)
    checkSlices(b, crlf)
  })
  it('whitespace-only lines and extra blanks behave as blank', () => {
    const src = 'INT. A - DAY\n   \n\n\nAL\nHi.\n \t \nBO\nYo.\n'
    const ix = buildScriptIndex(src)
    expect(ix.scenes[0].elements.map((e) => `${e.kind}:${e.speaker ?? ''}`)).toEqual([
      'cue:AL',
      'dialogue:AL',
      'cue:BO',
      'dialogue:BO',
    ])
    checkSlices(ix, src)
  })
  it('astral characters use UTF-16 offsets', () => {
    const src = 'INT. A - DAY\n\nAL\n😀 hi 😀\n\nShe grins 😀.\n'
    const ix = buildScriptIndex(src)
    const d = ix.scenes[0].elements[1]
    expect(d.text).toBe('😀 hi 😀')
    expect(d.to - d.from).toBe(8) // 2 + 4 + 2
    checkSlices(ix, src)
  })
  it('empty and heading-less documents', () => {
    expect(buildScriptIndex('').scenes).toEqual([])
    const ix = buildScriptIndex('Just some action.\n')
    expect(ix.scenes).toEqual([])
    expect(ix.preamble[0].kind).toBe('action')
  })
})

describe('ScriptIndex: line helpers', () => {
  const src = fx('script-index-edge.fountain')
  const ix = buildScriptIndex(src)
  it('sceneAtLine / elementAtLine / textAtLines', () => {
    const s1 = ix.scenes[1]
    expect(sceneAtLine(ix, 1)).toBeNull()
    expect(sceneAtLine(ix, ix.scenes[0].headingLine)?.index).toBe(0)
    expect(sceneAtLine(ix, s1.lineStart)?.index).toBe(1)
    expect(sceneAtLine(ix, s1.lineEnd)?.index).toBe(1)
    expect(sceneAtLine(ix, 10_000)).toBeNull()
    const hit = elementAtLine(ix, s1.elements[1].lineStart)
    expect(hit?.element.kind).toBe('dialogue')
    expect(hit?.scene?.index).toBe(1)
    expect(elementAtLine(ix, s1.headingLine)).toBeNull()
    expect(elementAtLine(ix, 15)?.scene ?? null).toBeNull() // preamble
    expect(textAtLines(ix, src, s1.headingLine, s1.headingLine)).toBe(s1.rawHeading)
    const e = ix.scenes[0].elements[6]
    expect(textAtLines(ix, src, e.lineStart, e.lineEnd)).toBe(e.text)
    expect(textAtLines(ix, src, 5, 4)).toBe('')
  })
  it('textAtLines respects CRLF and EOF', () => {
    const crlf = 'INT. A - DAY\r\n\r\nAL\r\nHi.\r\nThere.'
    const c = buildScriptIndex(crlf)
    expect(textAtLines(c, crlf, 3, 5)).toBe('AL\r\nHi.\r\nThere.')
    expect(textAtLines(c, crlf, 1, 1)).toBe('INT. A - DAY')
  })
})

function generateScript(pages: number): string {
  const out: string[] = ['Title: BIG', 'Author: Gen', '', '===', '']
  const names = ['ANNA', 'BEN', 'CARLA', 'DEV', 'ELLA']
  let lines = 0
  let s = 0
  while (lines < pages * 55) {
    out.push(`INT. LOCATION ${s % 17} - ${s % 2 ? 'NIGHT' : 'DAY'}`, '')
    out.push('The room hums with a low electric tension that someone has to notice sooner or later.', '')
    for (let d = 0; d < 6; d++) {
      const n = names[(s + d) % names.length]
      out.push(`${n}${d % 3 === 0 ? " (CONT'D)" : ''}`)
      if (d % 2) out.push('(quietly)')
      out.push('A line of dialogue that runs long enough to wrap onto a second line when typeset.', '')
    }
    out.push('CUT TO:', '')
    lines += 22
    s++
  }
  return out.join('\n')
}

describe('ScriptIndex: 120-page scale', () => {
  const src = generateScript(120)
  it('indexes under 150 ms with exact slices', () => {
    buildScriptIndex(src) // warm JIT: the budget is for steady-state editor use
    const t0 = performance.now()
    const ix = buildScriptIndex(src)
    const ms = performance.now() - t0
    expect(ix.scenes.length).toBeGreaterThan(200)
    expect(ix.characters).toHaveLength(5)
    expect(ms).toBeLessThan(150)
    checkSlices(ix, src)
  })
})

it('time of day is found before a trailing qualifier', async () => {
  const { buildScriptIndex } = await import('../src/lib/script-index')
  const ix = buildScriptIndex('EXT. THE GROVE - NIGHT - HALLUCINATION\n\nAction.\n\nEXT. MOUNTAIN VISTA - LATE AFTERNOON - TRANSITION\n\nMore.\n')
  expect(ix.scenes.map((s) => [s.location, s.timeOfDay])).toEqual([
    ['THE GROVE', 'NIGHT'],
    ['MOUNTAIN VISTA', 'AFTERNOON'],
  ])
})
