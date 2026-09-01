# Calendar Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add the approved C-style mini calendar, lunar/calendar information, and responsive layout to the dashboard hero.

**Architecture:** Reuse the current dashboard renderer and cross-day clock refresh. Add a presentational calendar host, generate its month grid from the browser-local date, and place its visual rules beside the existing hero rules. No state, sync, or network behavior changes.

**Tech Stack:** Native HTML, CSS, JavaScript; Playwright Core browser scripts run by Node.js.

---

## File map

- E:/gpt杂/my-workbench/index.html — dashboard hero host.
- E:/gpt杂/my-workbench/app.js — pure grid helper and dashboard rendering.
- E:/gpt杂/my-workbench/styles.css — desktop/mobile calendar styles.
- E:/gpt杂/.tools/wb-test/calendar-clock-test.js — focused browser regression test.

### Task 1: Write and prove the failing visual contract

**Files:**

- Create: E:/gpt杂/.tools/wb-test/calendar-clock-test.js
- Modify: none

- [ ] **Step 1: Write the failing browser test**

~~~js
const { chromium } = require('playwright-core');
const URL_ = 'file:///E:/gpt%E6%9D%82/my-workbench/index.html';
const check = (name, ok, detail = '') => {
  if (!ok) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('PASS  ' + name);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL_);
  await page.waitForTimeout(250);

  check('概览有月历容器', await page.locator('#hero-calendar').count() === 1);
  check('月历显示当前年月', /\d{4} 年 \d{1,2} 月/.test(await page.textContent('#hero-calendar')));
  check('月历高亮今天', await page.locator('#hero-calendar .is-today').count() === 1);
  check('日期行含农历信息', (await page.textContent('#hero-date')).includes('农历'));
  check('无 JavaScript 错误', errors.length === 0, errors.join(' | '));

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('手机端无横向溢出', overflow === 0, overflow + 'px');
  await browser.close();
})().catch(e => { console.error('FAIL  ' + e.message); process.exit(1); });
~~~

- [ ] **Step 2: Run the test before implementation**

~~~powershell
node E:/gpt杂/.tools/wb-test/calendar-clock-test.js
~~~

Expected: exit code 1 with the missing calendar-host assertion.

- [ ] **Step 3: Commit the test-only checkpoint**

~~~powershell
git add -- E:/gpt杂/.tools/wb-test/calendar-clock-test.js
git commit -m "test: cover dashboard calendar clock"
~~~

### Task 2: Add the host and grid renderer

**Files:**

- Modify: E:/gpt杂/my-workbench/index.html in the dashboard hero
- Modify: E:/gpt杂/my-workbench/app.js after calendarLine and inside renderDashboard
- Test: E:/gpt杂/.tools/wb-test/calendar-clock-test.js

- [ ] **Step 1: Replace the empty right-side hero element**

~~~html
<div class="hero-right" id="hero-calendar" aria-label="本月日历"></div>
~~~

- [ ] **Step 2: Add this pure calendar helper**

~~~js
function monthCalendarHTML(date) {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const start = (firstDay + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const today = todayStr(date);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - start + 1;
    if (day < 1 || day > days) return '<i class="hero-calendar-empty" aria-hidden="true"></i>';
    const dateStr = year + '-' + pad(month + 1) + '-' + pad(day);
    return '<i class="' + (dateStr === today ? 'is-today' : '') + '">' + day + '</i>';
  }).join('');
  return '<div class="hero-calendar-title">' + year + ' 年 ' + (month + 1) + ' 月</div>' +
    '<div class="hero-calendar-week"><i>一</i><i>二</i><i>三</i><i>四</i><i>五</i><i>六</i><i>日</i></div>' +
    '<div class="hero-calendar-days">' + cells + '</div>';
}
~~~

- [ ] **Step 3: Populate the host in renderDashboard**

~~~js
$("#hero-calendar").innerHTML = monthCalendarHTML(d);
~~~

Place it immediately after the existing hero-date assignment. The existing cross-day clock path then refreshes the calendar too.

- [ ] **Step 4: Run the focused test**

~~~powershell
node E:/gpt杂/.tools/wb-test/calendar-clock-test.js
~~~

Expected: all content assertions pass; only narrow-screen layout may remain before Task 3.

### Task 3: Style the C-style card and phone layout

**Files:**

- Modify: E:/gpt杂/my-workbench/styles.css after hero-right and in the existing max-width 920px media query
- Test: E:/gpt杂/.tools/wb-test/calendar-clock-test.js

- [ ] **Step 1: Add the desktop rules**

~~~css
.hero-right { min-width: 0; }
#hero-calendar { width: max-content; padding: 10px; background: var(--card-2); border: 1px solid var(--line); box-shadow: 3px 3px 0 color-mix(in srgb, var(--accent) 12%, transparent); transform: rotate(1deg); }
.hero-calendar-title { color: var(--accent); font-size: 12px; font-weight: 700; margin-bottom: 6px; }
.hero-calendar-week, .hero-calendar-days { display: grid; grid-template-columns: repeat(7, 18px); gap: 3px; text-align: center; }
.hero-calendar-week { color: var(--ink-3); font-size: 9px; margin-bottom: 3px; }
.hero-calendar-days i, .hero-calendar-week i { font-style: normal; line-height: 18px; font-size: 10px; }
.hero-calendar-days .is-today { background: var(--accent); border-radius: 50%; color: var(--accent-ink); font-weight: 700; }
.hero-calendar-empty { visibility: hidden; }
~~~

- [ ] **Step 2: Add the mobile override**

~~~css
.hero { grid-template-columns: 1fr auto; }
#hero-calendar { padding: 7px; }
.hero-calendar-week, .hero-calendar-days { grid-template-columns: repeat(7, 15px); gap: 2px; }
.hero-calendar-days i, .hero-calendar-week i { line-height: 15px; font-size: 9px; }
~~~

- [ ] **Step 3: Verify green and commit**

~~~powershell
node E:/gpt杂/.tools/wb-test/calendar-clock-test.js
git add -- E:/gpt杂/my-workbench/index.html E:/gpt杂/my-workbench/app.js E:/gpt杂/my-workbench/styles.css
git commit -m "feat: add dashboard calendar clock"
~~~

Expected: every check prints PASS and Node exits with code 0.

### Task 4: Run regressions

**Files:**

- Modify: none
- Test: E:/gpt杂/.tools/wb-test/feature-test.js
- Test: E:/gpt杂/.tools/wb-test/adversarial-test.js
- Test: E:/gpt杂/.tools/wb-test/mobile-audit.js

- [ ] **Step 1: Run complete checks**

~~~powershell
node E:/gpt杂/.tools/wb-test/feature-test.js
node E:/gpt杂/.tools/wb-test/adversarial-test.js
node E:/gpt杂/.tools/wb-test/mobile-audit.js
git status --short --branch
~~~

Expected: feature and adversarial suites exit 0; mobile output contains dashboard horizontal overflow 0px and no JavaScript error; application changes are committed.

