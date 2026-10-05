import { describe, expect, it } from 'vitest'
import { SCENE_ROW, SIDEBAR_MAX, SIDEBAR_MIN, computeFitWidth, splitSlugline } from './sidebar-fit'

describe('computeFitWidth', () => {
  const chrome = Object.values(SCENE_ROW).reduce((a, b) => a + b, 0)
  it('adds number column, padding and scrollbar to the text width', () => {
    expect(computeFitWidth(250)).toBe(250 + chrome)
  })
  it('clamps to min and max', () => {
    expect(computeFitWidth(10)).toBe(SIDEBAR_MIN)
    expect(computeFitWidth(2000)).toBe(SIDEBAR_MAX)
  })
  it('rounds fractional measurements up', () => {
    expect(computeFitWidth(250.2)).toBe(251 + chrome)
  })
})

describe('splitSlugline', () => {
  it('dims the INT./EXT. prefix and keeps case', () => {
    expect(splitSlugline('INT. KITCHEN - DAY')).toEqual({ prefix: 'INT. ', rest: 'KITCHEN - DAY' })
    expect(splitSlugline('ext. Lake - night')).toEqual({ prefix: 'ext. ', rest: 'Lake - night' })
    expect(splitSlugline('INT./EXT. CAR - DAY')).toEqual({ prefix: 'INT./EXT. ', rest: 'CAR - DAY' })
    expect(splitSlugline('I/E. CAR')).toEqual({ prefix: 'I/E. ', rest: 'CAR' })
  })
  it('leaves forced headings untouched', () => {
    expect(splitSlugline('THE ROOF')).toEqual({ prefix: '', rest: 'THE ROOF' })
  })
})
