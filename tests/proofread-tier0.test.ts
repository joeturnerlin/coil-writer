import { describe, expect, it } from 'vitest'
import { runTier0 } from '../src/lib/proofread-tier0'
import { buildScriptIndex } from '../src/lib/script-index'

const run = (src: string) => runTier0(buildScriptIndex(src), src)

function dialogue(name: string, n: number, line = 'Hold on a second.') {
  return Array.from({ length: n }, () => `${name}\n${line}\n`).join('\n')
}

describe('Tier 0 seeded defects', () => {
  it('flags a MARKUS cue next to the 41-line MARCUS, with counts', () => {
    const src = `INT. KITCHEN - DAY\n\nMarcus pours coffee.\n\n${dialogue('MARCUS', 41)}\nINT. HALL - DAY\n\n${dialogue('MARKUS', 1)}`
    const f = run(src).filter((x) => x.category === 'name-variant')
    expect(f).toHaveLength(1)
    expect(f[0].severity).toBe('warning')
    expect(f[0].claim).toContain('MARCUS (41 lines)')
    expect(f[0].claim).toContain('MARKUS (1 lines)')
  })

  it('flags NIGHT slug + "sunlight" in action', () => {
    const f = run('INT. ROOM - NIGHT\n\nSunlight pours through the blinds.\n').filter((x) => x.category === 'time-cue')
    expect(f).toHaveLength(1)
    expect(f[0].evidence.map((e) => e.quote)).toEqual(['INT. ROOM - NIGHT', 'Sunlight'])
  })

  it('flags DAY slug + "moonlight" in action', () => {
    const f = run('EXT. YARD - DAY\n\nMoonlight glints off the pool.\n').filter((x) => x.category === 'time-cue')
    expect(f).toHaveLength(1)
  })

  it('flags CONTINUOUS after a DAY to NIGHT jump', () => {
    const src = 'INT. A - DAY\n\nHe waits.\n\nINT. B - NIGHT\n\nShe waits.\n\nINT. C - CONTINUOUS\n\nThey wait.\n'
    expect(run(src).filter((x) => x.category === 'continuous-after-jump')).toHaveLength(1)
  })

  it('flags a slugline with no time of day', () => {
    const f = run('INT. ROOM\n\nHe sits.\n').filter((x) => x.category === 'slugline')
    expect(f).toHaveLength(1)
  })

  it('catches punctuation-only name variants (accents/hyphen/spacing) when cues are forced with @', () => {
    const src = 'INT. A - DAY\n\n@JEAN-LUC\nHi.\n\n@JEAN LUC\nHi.\n\n@JEANLUC\nHi.\n'
    expect(run(src).filter((x) => x.category === 'name-variant').length).toBeGreaterThan(0)
  })
})

describe('Tier 0 clean controls', () => {
  it('does not flag "this morning" in dialogue under NIGHT, or day words in dialogue', () => {
    const src = 'INT. ROOM - NIGHT\n\nANN\nI saw the sunlight this morning.\n\nHe nods.\n'
    expect(run(src)).toEqual([])
  })

  it('does not flag a V.O. speaker never introduced in the scene', () => {
    const src = 'INT. ROOM - DAY\n\nHe waits.\n\nRADIO (V.O.)\nStay tuned.\n'
    expect(run(src)).toEqual([])
  })

  it('does not flag CONTINUOUS after a stable time', () => {
    const src = 'INT. A - DAY\n\nHe waits.\n\nINT. B - DAY\n\nShe waits.\n\nINT. C - CONTINUOUS\n\nThey wait.\n'
    expect(run(src)).toEqual([])
  })

  it('reports ANN/ANNA (many lines each) as a note with counts, not a warning', () => {
    const src = `INT. A - DAY\n\n${dialogue('ANN', 12)}\n${dialogue('ANNA', 9)}`
    const f = run(src)
    expect(f).toHaveLength(1)
    expect(f[0].category).toBe('name-variant')
    expect(f[0].severity).toBe('note')
    expect(f[0].claim).toContain('ANN (12 lines)')
    expect(f[0].claim).toContain('ANNA (9 lines)')
  })

  it('does not flag clearly different names', () => {
    const src = `INT. A - DAY\n\n${dialogue('MARCUS', 3)}\n${dialogue('ELEANOR', 3)}`
    expect(run(src)).toEqual([])
  })
})
