import { describe, expect, it } from 'vitest'
import {
  isAppCommandSelectionCurrent,
  type AppCommand,
} from '../src/components/ui/Commands'

const commands = new Map<string, AppCommand>([
  [
    'task:one',
    {
      id: 'task:one',
      label: 'One',
      group: 'Tasks',
      onSelect() {},
    },
  ],
])

describe('asynchronous command selection admission', () => {
  it('admits only an ID from the settled current generation', () => {
    expect(
      isAppCommandSelectionCurrent('task:one', '5', 5, false, commands),
    ).toBe(true)
  })
  it.each([
    ['task:one', '5', 5, true],
    ['task:one', '4', 5, false],
    ['task:one', undefined, 5, false],
    ['task:missing', '5', 5, false],
    [undefined, '5', 5, false],
  ] as const)(
    'rejects pending, optimistic or unavailable selection %j %j %j %j',
    (id, generation, current, pending) => {
      expect(
        isAppCommandSelectionCurrent(
          id,
          generation,
          current,
          pending,
          commands,
        ),
      ).toBe(false)
    },
  )
})
