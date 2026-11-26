import type { Copy } from './state'
export function runStageTitle(stage: { key: string; title: string }, t: Copy) {
  const titles: Record<string, string> = {
    planning: t('规划', 'Planning'),
    research: t('研究', 'Research'),
    synthesis: t('汇总', 'Synthesis'),
  }
  if (titles[stage.key]) return titles[stage.key]
  if (stage.key === 'test-0') return t('基线测试', 'Baseline tests')
  if (/^test-[1-3]$/.test(stage.key))
    return t(
      `测试验证 · ${stage.key.at(-1)}`,
      `Test verification · ${stage.key.at(-1)}`,
    )
  if (/^implement-[1-3]$/.test(stage.key))
    return t(
      `代码实现 · ${stage.key.at(-1)}`,
      `Implementation · ${stage.key.at(-1)}`,
    )
  return stage.title
}
