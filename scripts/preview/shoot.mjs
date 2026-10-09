// Screenshots the client at 800x480 against the stub server, which must be
// running. Each shot presses keys, then waits for the page to settle.
//
//   node scripts/preview/shoot.mjs <outDir> <name>=<keys> [<name>=<keys> ...]
//
// <keys> is a comma-separated list of key names (Playwright names: 1, 2, 3,
// 4, Enter, Escape, m) and `swipeL` / `swipeR` / `wheel` / `wheelUp`.
// Example: node scripts/preview/shoot.mjs out sports=2,2,2 calendar=3
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    // Cloud sessions have it installed globally, not in this repo.
    const globalRoot = execSync('npm root -g').toString().trim()
    return createRequire(path.join(globalRoot, 'x'))('playwright')
  }
}

const [outDir, ...shots] = process.argv.slice(2)
if (!outDir || shots.length === 0) {
  console.error('usage: shoot.mjs <outDir> <name>=<keys> ...')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

const { chromium } = await loadPlaywright()
const browser = await chromium.launch({
  // A horizontal touch swipe would otherwise navigate "back".
  args: ['--disable-features=OverscrollHistoryNavigation']
})

const url = 'http://localhost:4180/usr/share/qt-superbird-app/webapp/'

async function swipe(page, dx) {
  const cdp = await page.context().newCDPSession(page)
  const point = x => [{ x, y: 240 }]
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(400)
  })
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(400 + (dx * i) / 10)
    })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  })
}

for (const shot of shots) {
  const [name, keys = ''] = shot.split('=')
  const page = await browser.newPage({
    viewport: { width: 800, height: 480 },
    hasTouch: true
  })
  await page.goto(url)
  await page.waitForTimeout(1500)
  for (const key of keys.split(',').filter(Boolean)) {
    if (key === 'swipeL') await swipe(page, -300)
    else if (key === 'swipeR') await swipe(page, 300)
    else if (key === 'wheel') await page.mouse.wheel(0, 100)
    else if (key === 'wheelUp') await page.mouse.wheel(0, -100)
    else await page.keyboard.press(key)
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(600)
  const file = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(file)
  await page.close()
}

await browser.close()
