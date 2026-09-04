# Robot Command Hub and Course Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the offline robot into a dark command hub with three local quick actions, and let each course choose its own color/style while emphasizing time and room.

**Architecture:** Keep the existing vanilla HTML/CSS/JS structure and localStorage data model. Add a small command layer in `app.js` that calls existing render/save paths, and store a `style` field on each course with a migration default of `soft`. Extend the existing course edit modal rather than introducing a second editor.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js static regression tests, Capacitor Android debug build.

---

### Task 1: Lock behavior with regression tests

**Files:**
- Create: `tests/course-style-test.mjs`
- Create: `tests/bot-command-hub-test.mjs`
- Reference: `app.js`, `index.html`, `styles.css`

- [ ] **Step 1: Write the failing course-style test**

Assert the source has a style migration default, three style controls, style-aware chip markup, and emphasized room/time classes:

```js
const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const css = readFileSync(resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
for (const value of ['soft', 'solid', 'outline']) {
  if (!html.includes(`value="${value}"`)) throw new Error(`缺少课程样式选项 ${value}`);
}
if (!app.includes('style: course?.style || "soft"')) throw new Error('课程编辑没有默认柔和样式');
if (!app.includes('data-style="${c.style || \'soft\'}"')) throw new Error('课程卡片没有输出样式');
if (!css.includes('.chip .r.strong')) throw new Error('课程时间/教室缺少醒目样式');
console.log('PASS  课程可单独设置颜色和样式');
```

- [ ] **Step 2: Run the test to verify it fails**

Run `node tests/course-style-test.mjs`; expected failure: `缺少课程样式选项 soft`.

- [ ] **Step 3: Write the failing robot command test**

Check the three command buttons, action names, focus state labels, and local-only wording:

```js
const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
for (const action of ['bot-today', 'bot-quick-todo', 'bot-focus']) {
  if (!html.includes(`data-action="${action}"`)) throw new Error(`缺少机器人快捷操作 ${action}`);
}
if (!app.includes('botFocusState')) throw new Error('缺少专注状态');
if (!app.includes('function botToday')) throw new Error('缺少今日课表命令');
if (!app.includes('function botQuickTodo')) throw new Error('缺少快速待办命令');
if (!app.includes('function botFocus')) throw new Error('缺少专注命令');
console.log('PASS  机器人指令中枢结构存在');
```

- [ ] **Step 4: Run the test to verify it fails**

Run `node tests/bot-command-hub-test.mjs`; expected failure: `缺少机器人快捷操作 bot-today`.

- [ ] **Step 5: Commit the red tests**

```powershell
git add tests/course-style-test.mjs tests/bot-command-hub-test.mjs
git commit -m "test: define robot commands and course styles"
```

### Task 2: Add per-course style editing and data migration

**Files:**
- Modify: `index.html:342-368` (course edit form)
- Modify: `app.js:120-132,1070-1087,1441-1467`
- Modify: `styles.css:624-650`
- Test: `tests/course-style-test.mjs`

- [ ] **Step 1: Add style controls to the course modal**

Insert a radio group after `#f-colors` with values `soft`, `solid`, and `outline`, labels “柔和填充 / 实色强调 / 线框简洁”, and use `data-style` on the preview swatches so the selected course keeps its current style.

- [ ] **Step 2: Normalize legacy courses**

In `normalize`, map each course through a small `normalizeCourseStyle` helper that copies the course and sets `style` to one of `soft|solid|outline`, defaulting invalid/missing values to `soft`. This keeps old imports and synced data compatible without changing their colors.

- [ ] **Step 3: Load and save the selected style**

In `openCourseModal`, set the checked style from `course?.style || "soft"`; in the submit handler add:

```js
style: new FormData($('#course-form')).get('f-style') || 'soft',
```

Keep the existing color radio behavior unchanged.

- [ ] **Step 4: Run the course-style test**

Run `node tests/course-style-test.mjs`; expected output: `PASS  课程可单独设置颜色和样式`.

- [ ] **Step 5: Commit course style editing**

```powershell
git add index.html app.js styles.css tests/course-style-test.mjs
git commit -m "feat: add per-course card styles"
```

### Task 3: Render readable course cards

**Files:**
- Modify: `app.js:900-908` (timetable chip HTML)
- Modify: `styles.css:405-430` (chip styles)
- Test: `tests/course-room-display-test.mjs`, `tests/course-style-test.mjs`

- [ ] **Step 1: Add style-aware chip classes and semantic metadata**

Render each chip with `chip style-${c.style || 'soft'}`, preserve `data-c`, and split metadata into explicit spans:

```js
const timeText = `${s.start}–${s.end}`;
const roomText = c.room ? `教室：${c.room}` : '教室待定';
return `<div class="chip style-${c.style || 'soft'}${dim ? ' dim' : ''}" data-c="${c.color % COLOR_N}" ...>
  <b>${esc(c.name)}</b>${wtag}
  <span class="r strong"><span class="chip-time">${timeText}</span><span class="chip-room">${esc(roomText)}</span></span>
  ${c.teacher ? `<span class="r">教师：${esc(c.teacher)}</span>` : ''}
</div>`;
```

- [ ] **Step 2: Add the three visual presets**

Keep the existing color variables and add:

```css
.chip.style-soft { border-radius: 8px; }
.chip.style-solid { color: var(--accent-ink); filter: saturate(1.08); }
.chip.style-outline { background: transparent; border: 1.5px solid var(--c-bd); box-shadow: none; }
.chip .r.strong { margin-top: 5px; font-size: 12px; font-weight: 700; opacity: 1; }
.chip-time, .chip-room { display: block; }
```

Use a mobile media rule to keep `.chip .r.strong` at least 12px and prevent room text from being visually lost.

- [ ] **Step 3: Run the existing room test and the new style test**

Run `node tests/course-room-display-test.mjs` and `node tests/course-style-test.mjs`; both must pass.

- [ ] **Step 4: Commit the readable cards**

```powershell
git add app.js styles.css tests/course-room-display-test.mjs tests/course-style-test.mjs
git commit -m "feat: emphasize course time and room"
```

### Task 4: Add the dark command hub UI

**Files:**
- Modify: `index.html:374-388` (robot panel)
- Modify: `app.js:1108-1348,1985-2083`
- Modify: `styles.css:729-780`
- Test: `tests/bot-command-hub-test.mjs`

- [ ] **Step 1: Add command buttons and status region**

Inside `#bot-panel`, add a status row with `#bot-status`, a `.bot-commands` group with buttons using `data-action="bot-today"`, `bot-quick-todo`, and `bot-focus`, and a compact `#bot-focus-state` element. Keep `#bot-form`, microphone, and parser messages below the commands.

- [ ] **Step 2: Implement today schedule command**

Add `botToday()` that calls `todayCourses()`, formats each course using the existing `state.slots` data, includes `教室：` when available, and calls `botSay()` with either the list or `今天没有排课`. It must not mutate `state.courses`.

- [ ] **Step 3: Implement quick todo command**

Add `botQuickTodo()` that focuses `#bot-text`, sets its placeholder to `快速记一条待办…`, and adds a short helper message. The existing form submit remains the single persistence path; empty input must return without calling `save()`.

- [ ] **Step 4: Implement the 25-minute focus timer**

Add module state:

```js
let botFocusState = 'idle';
let botFocusRemaining = 25 * 60;
let botFocusTimer = null;
```

Implement `botFocus()` to start from idle/done, pause when running, resume when paused, and clear the interval on done. Update `#bot-focus-state` every second as `专注 24:59`, with buttons changing label to `暂停专注` / `继续专注` / `结束专注`. Never create a second interval while one exists.

- [ ] **Step 5: Wire command actions and status labels**

Extend the central click switch with `bot-today`, `bot-quick-todo`, and `bot-focus`; when the panel opens, set `#bot-status` to `空闲`, and while a command runs use `执行中` or `专注中`. Closing the panel must stop speech input but must not reset a paused focus timer.

- [ ] **Step 6: Run the robot structure test**

Run `node tests/bot-command-hub-test.mjs`; expected output: `PASS  机器人指令中枢结构存在`.

- [ ] **Step 7: Commit command behavior**

```powershell
git add index.html app.js tests/bot-command-hub-test.mjs
git commit -m "feat: add offline robot command hub"
```

### Task 5: Polish the command hub for mobile and desktop

**Files:**
- Modify: `styles.css:732-780`
- Test: `tests/bot-command-hub-test.mjs`

- [ ] **Step 1: Apply the B visual direction**

Use a dark ink panel with warm yellow highlights, a compact header, three equal command tiles, clear pressed/disabled states, and a visible status badge. Keep the existing floating robot button position and z-index so the bottom navigation is not covered.

- [ ] **Step 2: Add responsive layout rules**

At `max-width: 920px`, set panel width to `calc(100vw - 20px)`, right/left margins to 10px, command tiles to a 3-column grid when space permits, and fall back to two columns below 360px. Keep the input row fixed at the panel bottom and the messages scrollable.

- [ ] **Step 3: Run static and layout checks**

Run `node tests/bot-command-hub-test.mjs`, `node tests/mobile-hero-layout-test.mjs`, and `git diff --check`; expected output is PASS for both tests and no diff errors.

- [ ] **Step 4: Commit visual polish**

```powershell
git add styles.css tests/bot-command-hub-test.mjs
git commit -m "style: polish robot command hub"
```

### Task 6: Full verification and Android package

**Files:**
- Modify only if verification reveals a regression: `index.html`, `app.js`, `styles.css`, tests
- Build output: `dist/`, `android/app/src/main/assets/public/`, `work-desktop-v1.0.1.apk`

- [ ] **Step 1: Run the complete regression suite**

Run:

```powershell
$tests = @(
  'tests/bot-command-hub-test.mjs',
  'tests/course-style-test.mjs',
  'tests/course-room-display-test.mjs',
  'tests/course-week-spec-test.mjs',
  'tests/course-import-slot-test.mjs',
  'tests/mobile-hero-layout-test.mjs',
  'tests/calendar-layout-test.mjs',
  'tests/welcome-profile-test.mjs'
)
foreach ($test in $tests) { node $test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
git diff --check
```

All tests must report PASS and `git diff --check` must be clean.

- [ ] **Step 2: Build the web bundle**

Run `npm run build:web`; expected output includes `web assets copied to ...\dist`.

- [ ] **Step 3: Build and verify Android 1.0.1**

Run `npm run android:build`, then verify `android/app/build/outputs/apk/debug/app-debug.apk` with `apksigner verify --verbose`; confirm the package reports `versionCode='2' versionName='1.0.1'`.

- [ ] **Step 4: Refresh the deliverable APK**

Copy the verified APK to `work-desktop-v1.0.1.apk` and confirm the destination length matches the build output.

- [ ] **Step 5: Perform a 390×844 visual smoke check**

Serve the built web files locally and capture the timetable with the course modal and robot panel opened. Confirm the style controls are reachable, room/time are visually prominent, command tiles fit above the bottom navigation, and focus status is readable.

- [ ] **Step 6: Commit verification-only fixes if needed**

```powershell
git status --short
git add index.html app.js styles.css tests
git commit -m "test: verify robot and course styling integration"
```
