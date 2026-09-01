# Android 本地版实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 将现有工作台打包为 Android 8.0+ 本地 APK，所有业务数据和后续本地 OCR 均留在用户手机，不建设作者数据服务器。

**Architecture:** Capacitor 将现有原生网页资源封装进 Android WebView，业务逻辑继续由 app.js 驱动。发布构建通过本地配置关闭 GitHub Gist 同步，只保留 localStorage 与 JSON 导入/导出；Android 原生层只处理返回键、文件选择和应用元数据。

**Tech Stack:** HTML/CSS/JavaScript, Node.js, Capacitor, Android Gradle Plugin, Android SDK, JDK 17+, Playwright Core.

---

## 文件与职责

- E:/gpt杂/my-workbench/package.json — Android 打包依赖和 npm scripts。
- E:/gpt杂/my-workbench/capacitor.config.json — App ID、名称、webDir 和 Android 配置。
- E:/gpt杂/my-workbench/scripts/build-web.mjs — 将网页资源复制到 Capacitor 的 dist 目录。
- E:/gpt杂/my-workbench/app.js — 本地版开关、Android 返回键桥接和设置页本地模式文案。
- E:/gpt杂/my-workbench/index.html — 本地版同步卡片/隐私文案及必要的原生文件入口。
- E:/gpt杂/my-workbench/android/ — Capacitor 生成并维护的 Android 工程。
- E:/gpt杂/my-workbench/tests/android-package-test.mjs — 构建配置和资源完整性回归测试。
- E:/gpt杂/my-workbench/ANDROID-README.md — 安装、备份、更新和权限说明。

### Task 1: 建立失败的打包契约测试

**Files:**

- Create: E:/gpt杂/my-workbench/tests/android-package-test.mjs
- Modify: none

- [ ] **Step 1: Write the failing test**

~~~js
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = name => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const check = (name, ok, detail = '') => {
  if (!ok) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('PASS  ' + name);
};

check('Capacitor 配置存在', existsSync(resolve(root, 'capacitor.config.json')));
const config = readJson('capacitor.config.json');
check('App ID 正确', config.appId === 'com.hzx.workbench');
check('网页目录配置正确', config.webDir === 'dist');
check('Android 本地模式开关存在', readFileSync(resolve(root, 'app.js'), 'utf8').includes('IS_NATIVE_APP'));
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
  check('发布资源存在: ' + file, existsSync(resolve(root, 'dist', file)));
}
check('Android 工程存在', existsSync(resolve(root, 'android', 'settings.gradle')));
~~~

- [ ] **Step 2: Run it to confirm the expected failure**

Run:

~~~powershell
node E:/gpt杂/my-workbench/tests/android-package-test.mjs
~~~

Expected: exit code 1，首先提示 capacitor.config.json 不存在；此时不能修改生产代码来绕过测试。

- [ ] **Step 3: Commit the test checkpoint**

~~~powershell
git add -- tests/android-package-test.mjs
git commit -m "test: define Android package contract"
~~~

### Task 2: 增加本地发布配置和网页资源构建脚本

**Files:**

- Create: E:/gpt杂/my-workbench/package.json
- Create: E:/gpt杂/my-workbench/capacitor.config.json
- Create: E:/gpt杂/my-workbench/scripts/build-web.mjs
- Modify: E:/gpt杂/my-workbench/.gitignore
- Test: E:/gpt杂/my-workbench/tests/android-package-test.mjs

- [ ] **Step 1: Add npm configuration**

Create package.json with Capacitor packages and deterministic scripts:

~~~json
{
  "name": "my-workbench-android",
  "private": true,
  "scripts": {
    "build:web": "node scripts/build-web.mjs",
    "android:sync": "npm run build:web && npx cap sync android",
    "android:open": "npm run android:sync && npx cap open android",
    "android:build": "npm run android:sync && npx cap build android"
  },
  "dependencies": {
    "@capacitor/android": "^7.0.0",
    "@capacitor/app": "^7.0.0",
    "@capacitor/core": "^7.0.0",
    "@capacitor/filesystem": "^7.0.0",
    "@capacitor/cli": "^7.0.0"
  },
  "type": "module"
}
~~~

Use one Capacitor major version for every package. If npm resolves a newer compatible patch, keep package-lock.json.

- [ ] **Step 2: Add Capacitor configuration**

Create capacitor.config.json:

~~~json
{
  "appId": "com.hzx.workbench",
  "appName": "我的工作台",
  "webDir": "dist",
  "bundledWebRuntime": false,
  "android": {
    "allowMixedContent": false
  }
}
~~~

- [ ] **Step 3: Add the resource copy script**

Create scripts/build-web.mjs. It must remove and recreate only the generated dist directory, then copy the exact runtime files and icons:

~~~js
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'icons'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js']) {
  await cp(resolve(root, file), resolve(dist, file));
}
for (const file of ['icon-192.png', 'icon-512.png']) {
  await cp(resolve(root, 'icons', file), resolve(dist, 'icons', file));
}
console.log('web assets copied to ' + dist);
~~~

- [ ] **Step 4: Ignore generated and local Android output**

Append these entries to .gitignore without removing existing rules:

~~~gitignore
node_modules/
dist/
android/.gradle/
android/build/
android/app/build/
android/capacitor-cordova-android-plugins/
~~~

- [ ] **Step 5: Install dependencies and generate the Android project**

Run:

~~~powershell
npm install
npm run build:web
npx cap add android
~~~

Expected: package-lock.json, dist/, and android/ are created. If the machine lacks JDK, Android SDK, or Gradle tooling, stop and report the missing prerequisite instead of changing the project structure.

- [ ] **Step 6: Run the contract test**

Run:

~~~powershell
node tests/android-package-test.mjs
~~~

Expected: it may still fail only on the native local-mode marker until Task 3; configuration and resource checks must pass.

### Task 3: Make the web app explicitly local-only inside the APK

**Files:**

- Modify: E:/gpt杂/my-workbench/app.js near runtime initialization and sync actions
- Modify: E:/gpt杂/my-workbench/index.html around the sync card
- Modify: E:/gpt杂/my-workbench/styles.css for the local-only notice
- Test: E:/gpt杂/my-workbench/tests/android-package-test.mjs

- [ ] **Step 1: Add a native-app runtime flag**

Near the top-level constants in app.js add:

~~~js
const IS_NATIVE_APP = Boolean(window.Capacitor?.isNativePlatform?.());
~~~

- [ ] **Step 2: Disable cloud-sync controls in native builds**

In the existing initialization/render path, when IS_NATIVE_APP is true:

~~~js
if (IS_NATIVE_APP) {
  const syncCard = document.querySelector('.sync-card');
  if (syncCard) syncCard.hidden = true;
}
~~~

Also guard sync entry points so an old local token cannot trigger network activity:

~~~js
async function pushSync() {
  if (IS_NATIVE_APP || syncing || !getToken() || !state.sync.gistId) return;
  // keep the existing body below this guard
}
~~~

Apply the same IS_NATIVE_APP guard to pullSync, fullSync, testAndSaveSync, and the final automatic pull interval.

- [ ] **Step 3: Add a clear local-mode message**

Add one small notice in the data/settings area:

~~~html
<p class="local-only-note" id="local-only-note" hidden>
  Android 本地版：数据只保存在这台手机，不会上传服务器。请定期导出 JSON 备份。
</p>
~~~

Show it during settings rendering only when IS_NATIVE_APP is true; hide the old GitHub sync card in that case. Keep export/import controls visible.

- [ ] **Step 4: Run the focused web regressions**

Run:

~~~powershell
npm run build:web
node tests/android-package-test.mjs
node E:/gpt杂/.tools/wb-test/feature-test.js
node E:/gpt杂/.tools/wb-test/adversarial-test.js
~~~

Expected: package contract, 67-item feature test and 25-item adversarial test all exit 0; no network request is made by a native-mode test fixture.

### Task 4: Add Android lifecycle and metadata behavior

**Files:**

- Modify: E:/gpt杂/my-workbench/android/app/src/main/AndroidManifest.xml
- Modify: E:/gpt杂/my-workbench/android/app/src/main/java/com/hzx/workbench/MainActivity.java
- Modify: E:/gpt杂/my-workbench/android/app/build.gradle
- Modify: E:/gpt杂/my-workbench/capacitor.config.json
- Test: E:/gpt杂/my-workbench/tests/android-package-test.mjs

- [ ] **Step 1: Configure SDK and version**

Set compile/target SDK to the installed Android SDK level, minSdk to 26 (Android 8.0), and versionName to 1.0.0. Keep appId com.hzx.workbench consistent with Capacitor config and Android package directory.

- [ ] **Step 2: Implement the back-button priority**

In MainActivity.java register Capacitor's App plugin listener or Android back dispatcher so the order is:

1. close course/import modal or bot panel if open;
2. if current page is not dashboard, navigate to dashboard;
3. otherwise let Android finish the activity.

Expose one small JavaScript bridge event if the native listener cannot inspect the DOM directly. Do not duplicate the page navigation logic in two places.

- [ ] **Step 3: Add file/image permissions only when required**

Use Android's system file picker through Capacitor Filesystem or a document picker. Do not request broad storage permission. The app must accept user-selected JSON now; image selection is reserved for local OCR.

- [ ] **Step 4: Add metadata**

Set the launcher icon from existing icons, label as 我的工作台, orientation portrait, and a network security policy that does not permit cleartext traffic. No INTERNET permission is needed for the local-only build unless a future optional sync build explicitly adds it.

- [ ] **Step 5: Extend the contract test**

Add assertions that Android manifest contains minSdk 26, the label 我的工作台, and that MainActivity exists. Run:

~~~powershell
node tests/android-package-test.mjs
~~~

Expected: all package and native metadata checks pass.

### Task 5: Build and verify the APK

**Files:**

- Create: E:/gpt杂/my-workbench/ANDROID-README.md
- Modify: none
- Test: Android build and manual smoke test

- [ ] **Step 1: Run the release build**

~~~powershell
npm run android:build
~~~

Expected: Gradle exits 0 and produces a release APK under android/app/build/outputs/apk/release/. If signing is not configured, produce an unsigned or debug APK for the first device test and document that it is not a public release artifact.

- [ ] **Step 2: Install on an Android 8+ device**

~~~powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
~~~

Expected: installation succeeds, app opens to a blank/local demo workspace, and no login screen appears.

- [ ] **Step 3: Run the device smoke checklist**

Verify on-device:

- app launches with airplane mode enabled;
- dashboard, timetable, todos, journal and settings switch correctly;
- Android back button closes modal/bot before leaving the page;
- adding and deleting a course persists after force-close and relaunch;
- JSON export and import preserve data;
- native settings show local-only notice and no GitHub Token controls;
- no cleartext/network request is generated during normal use.

- [ ] **Step 4: Write user-facing instructions**

ANDROID-README.md must explain:

~~~text
安装：下载 APK → 允许安装未知来源应用 → 点击安装。
数据：课程、待办和日志只存在本机。
备份：设置 → 同步与数据 → 导出备份；换手机前先导出，再在新手机导入。
更新：安装新版本前先导出备份；覆盖安装通常会保留本地数据。
限制：第一版只支持 Android，不含账号、云同步和 iPhone 版本。
~~~

- [ ] **Step 5: Commit the Android packaging work**

~~~powershell
git add -- package.json package-lock.json capacitor.config.json scripts/build-web.mjs app.js index.html styles.css android ANDROID-README.md tests/android-package-test.mjs .gitignore
git commit -m "feat: package workbench as local Android app"
~~~

### Task 6: Final regression and artifact report

**Files:**

- Modify: none
- Test: all existing browser tests plus Android smoke checklist

- [ ] **Step 1: Run browser regressions**

~~~powershell
npm run build:web
node tests/android-package-test.mjs
node E:/gpt杂/.tools/wb-test/feature-test.js
node E:/gpt杂/.tools/wb-test/adversarial-test.js
node E:/gpt杂/.tools/wb-test/import-test.js
node E:/gpt杂/.tools/wb-test/mobile-audit.js
~~~

Expected: all scripts exit 0; existing project tests report 67/67 and 25/25; mobile audit reports zero horizontal overflow and no JavaScript errors.

- [ ] **Step 2: Check APK artifact**

~~~powershell
Get-Item android/app/build/outputs/apk/debug/app-debug.apk
Get-FileHash android/app/build/outputs/apk/debug/app-debug.apk -Algorithm SHA256
git status --short --branch
~~~

Expected: APK exists, hash is recorded in the release note, and only intentionally ignored build output or the visual-companion directory remains outside version control.

- [ ] **Step 3: Report the deliverable**

Report the APK path, version, minimum Android version, installation caveat, backup workflow, test results, and the fact that no author server is involved.

