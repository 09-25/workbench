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
check('应用显示名正确', config.appName === 'work desktop');
check('网页目录配置正确', config.webDir === 'dist');
check('Android 本地模式开关存在', readFileSync(resolve(root, 'app.js'), 'utf8').includes('IS_NATIVE_APP'));
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']) {
  check('发布资源存在: ' + file, existsSync(resolve(root, 'dist', file)));
}
check('Android 工程存在', existsSync(resolve(root, 'android', 'settings.gradle')));
const variables = readFileSync(resolve(root, 'android', 'variables.gradle'), 'utf8');
check('最低 Android 版本为 8.0', /minSdkVersion\s*=\s*26/.test(variables));
const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8');
check('本次 Android 更新版本号正确', /versionCode\s+7/.test(gradle) && /versionName\s+"1\.0\.6"/.test(gradle));
const manifest = readFileSync(resolve(root, 'android', 'app/src/main/AndroidManifest.xml'), 'utf8');
check('Android 应用名称正确', manifest.includes('android:label="@string/app_name"'));
const strings = readFileSync(resolve(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
check('Android 标题正确', strings.includes('<string name="app_name">work desktop</string>'));
check('自定义应用图标存在', existsSync(resolve(root, 'assets', 'work-desktop-icon.png')));
check('返回键桥接存在', readFileSync(resolve(root, 'app.js'), 'utf8').includes('backButton'));
check('主 Activity 存在', existsSync(resolve(root, 'android/app/src/main/java/com/hzx/workbench/MainActivity.java')));
