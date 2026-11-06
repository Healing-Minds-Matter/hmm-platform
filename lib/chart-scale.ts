// Y-axis steps for count charts (sheet row 51). Counts are whole numbers, so
// the step is a "nice" whole number (1, 2, 5, 10, 20, 50 …), never 0.5.
export function countTickStep(maxCount: number, ticks = 4): number {
  const rough = maxCount / ticks
  if (rough <= 1) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / magnitude
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return Math.max(1, Math.round(niceNorm * magnitude))
}
