import { describe, expect, it } from 'vitest'
import { countTickStep } from '@/lib/chart-scale'

// Sheet row 51: "Active Gatekeepers by Club" showed 0.5, 1.5 ticks.
describe('countTickStep', () => {
  it('never goes below 1 for small counts', () => {
    for (const max of [0, 1, 2, 3, 4]) expect(countTickStep(max)).toBe(1)
  })
  it('gives whole, nice steps for larger counts', () => {
    expect(countTickStep(6)).toBe(2)
    expect(countTickStep(18)).toBe(5)
    expect(countTickStep(37)).toBe(10)
    expect(countTickStep(130)).toBe(50)
  })
  it('ticks are all whole numbers and cover the maximum', () => {
    for (let max = 0; max <= 500; max++) {
      const step = countTickStep(max)
      expect(Number.isInteger(step)).toBe(true)
      expect(step * 4).toBeGreaterThanOrEqual(max)
    }
  })
})
