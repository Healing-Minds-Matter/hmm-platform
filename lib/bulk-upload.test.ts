import { describe, expect, it } from 'vitest'
import { BULK_BATCH_SIZE, batchLines, planBatches } from '@/lib/bulk-upload'
import { BULK_UPLOAD_MAX_ROWS } from '@/lib/csv'

describe('batchLines', () => {
  const form = (lines?: string) => {
    const f = new FormData()
    if (lines !== undefined) f.set('lines', lines)
    return f
  }

  it('means "every row" when no batch is given', () => {
    expect(batchLines(form())).toBeNull()
    expect(batchLines(form(''))).toBeNull()
  })

  it('reads the batch line numbers and ignores junk', () => {
    expect(batchLines(form('2,3,5'))).toEqual(new Set([2, 3, 5]))
    expect(batchLines(form('2,x,4.5,7'))).toEqual(new Set([2, 7]))
  })
})

describe('planBatches', () => {
  it('splits rows into batches of the given size, keeping order', () => {
    expect(planBatches([2, 3, 4, 6, 7, 8, 9], 3)).toEqual([[2, 3, 4], [6, 7, 8], [9]])
    expect(planBatches([], 5)).toEqual([])
  })

  it('keeps a full upload to a handful of short requests', () => {
    const lines = Array.from({ length: BULK_UPLOAD_MAX_ROWS }, (_, i) => i + 2)
    expect(planBatches(lines, BULK_BATCH_SIZE.gatekeepers)).toHaveLength(10)
    expect(planBatches(lines, BULK_BATCH_SIZE.clubs)).toHaveLength(5)
  })
})
