/**
 * 站点能渲染、课程通过本机运行时真实运行，且主要界面没有严重的无障碍问题。
 * 运行前需要 `pnpm build`。
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** 终端面板里的全部文本。 */
async function terminalText(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll('.xterm-rows')].map(rows => (rows as HTMLElement).innerText).join('\n'))
}

async function waitForTerminal(page: Page, text: string, timeout: number) {
  await expect.poll(() => terminalText(page), { timeout, intervals: [2_000] }).toContain(text)
}

/** 预览面板里的流程图。 */
function diagram(page: Page) {
  return page.frameLocator('iframe[title="流程图"]')
}

test('首页进入第一课', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/0-start\/1-agent\/1-one-turn\/?$/)
  await expect(page.getByRole('heading', { level: 1, name: '一个 agent 在做什么' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '查看答案' })).toBeVisible()
})

test('课程在本机运行，查看答案后重新运行', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/1-kernel/1-plugins/4-add-a-tool/')
  // 流程图的步骤列表里出现模型的回答。
  const steps = diagram(page).locator('#side')
  await expect(steps).toContainText('响应 #1 · 我没有可以用的计算工具', { timeout: 60_000 })
  await expect(diagram(page).locator('svg')).toContainText('calculator')
  await expect(diagram(page).locator('svg')).toContainText('agent-loop')

  await page.getByRole('button', { name: '查看答案' }).click()
  // node --watch 在文件变化后重新运行 main.ts，流程图通过 SSE 重新连上。
  await expect(steps).toContainText('tools/execute · add', { timeout: 60_000 })
  await expect(steps).toContainText('响应 #2 · 结果是 3')

  // 终端默认收起，展开后能看到同一次运行的输出。
  await page.getByRole('button', { name: '显示或隐藏终端' }).click()
  await waitForTerminal(page, '[response] #1  调用 add({"a":1,"b":2})', 30_000)
  expect(errors).toEqual([])
})

test('终端标签页是本机课程工作区里的 shell', async ({ page }) => {
  await page.goto('/0-start/1-agent/1-one-turn/')
  await expect(diagram(page).locator('#side')).toContainText('响应 #1', { timeout: 60_000 })
  await page.getByRole('button', { name: '显示或隐藏终端' }).click()
  await page.getByRole('tab', { name: '终端' }).click()
  const shell = page.locator('.xterm').nth(1)
  await shell.click()
  await page.keyboard.type('ls; echo "sum=$((1+2))"')
  await page.keyboard.press('Enter')
  await waitForTerminal(page, 'sum=3', 20_000)
  expect(await terminalText(page)).toContain('main.ts')
})

/**
 * TutorialKit 1.6 自带组件里已知的问题，本项目改不到：终端标签页的 tablist 结构、
 * 面包屑上一课/下一课的图标链接没有名称、CodeMirror 的滚动区域不可聚焦。
 * 按规则和选择器精确排除，其他任何严重问题都会让测试失败。
 */
const knownUpstream: { rule: string; selector: RegExp }[] = [
  { rule: 'aria-required-children', selector: /tablist/ },
  { rule: 'aria-required-parent', selector: /tk-terminal-tab/ },
  { rule: 'listitem', selector: /tablist/ },
  { rule: 'link-name', selector: /breadcrumbs-navButton/ },
  { rule: 'scrollable-region-focusable', selector: /cm-scroller/ },
]

test('课程页没有严重的无障碍问题', async ({ page }) => {
  await page.goto('/2-plugins/2-tool-guard/2-deny/')
  await expect(page.getByRole('heading', { level: 1, name: '短路拒绝' }).first()).toBeVisible()
  // 等流程图画出来，让 axe 连同预览里的流程图一起检查。
  await expect(diagram(page).locator('svg')).toContainText('tool-guard', { timeout: 60_000 })
  const result = await new AxeBuilder({ page }).analyze()
  const serious = result.violations
    .filter(item => item.impact === 'serious' || item.impact === 'critical')
    .flatMap(item => item.nodes
      .map(node => node.target.join(' '))
      .filter(target => !knownUpstream.some(known => known.rule === item.id && known.selector.test(target)))
      .map(target => `${item.id} (${item.impact}): ${item.help} — ${target}`))
  expect(serious).toEqual([])
})
