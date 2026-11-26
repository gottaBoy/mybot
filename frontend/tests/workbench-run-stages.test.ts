import { describe, expect, it } from 'vitest'
import { runStageTitle } from '../src/workbench/run-stages'
describe('actual stage titles', () => {
  const t = (_zh: string, en: string) => en
  it.each([
    ['planning', 'Planning'],
    ['test-0', 'Baseline tests'],
    ['implement-1', 'Implementation · 1'],
    ['test-2', 'Test verification · 2'],
    ['unknown', 'Actual stage'],
  ])('keeps %s separate from positional research labels', (key, title) => {
    expect(runStageTitle({ key, title: 'Actual stage' }, t)).toBe(title)
  })
})
