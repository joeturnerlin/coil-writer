import { describe, expect, it } from 'vitest'
import herosJourney from './heros-journey.json'
import savetheCat from './save-the-cat.json'
import sequence from './sequence.json'
import storyStructure from './story-structure.json'

const frameworks = [savetheCat, herosJourney, storyStructure, sequence]

describe('framework JSONs', () => {
  for (const fw of frameworks) {
    describe(fw.id, () => {
      it('has no duplicate beat IDs', () => {
        const ids = fw.beats.map((b) => b.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('positions sum to <= 1.0', () => {
        const maxPos = Math.max(...fw.beats.map((b) => b.typical_position + b.position_tolerance))
        expect(maxPos).toBeLessThanOrEqual(1.05)
      })

      it('all tolerances > 0', () => {
        for (const b of fw.beats) {
          expect(b.position_tolerance).toBeGreaterThan(0)
        }
      })

      it('positions are monotonically non-decreasing', () => {
        for (let i = 1; i < fw.beats.length; i++) {
          expect(fw.beats[i].typical_position).toBeGreaterThanOrEqual(fw.beats[i - 1].typical_position)
        }
      })
    })
  }
})
