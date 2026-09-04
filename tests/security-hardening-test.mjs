import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'app.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const manifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const paths = readFileSync(resolve(root, 'android/app/src/main/res/xml/file_paths.xml'), 'utf8');
const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8');

const check = (name, ok) => {
  if (!ok) throw new Error(name);
  console.log('PASS  ' + name);
};

check('不再接受 URL 片段自动配置同步', !app.includes('location.hash.match(/#sync='));
check('同步 Token 不再写入 localStorage', !app.includes('localStorage.setItem(TOKEN_KEY'));
check('旧版持久 Token 会被清除', app.includes('localStorage.removeItem(LEGACY_TOKEN_KEY)'));
check('同步 Token 只保存在当前会话变量', /let\s+syncToken\s*=\s*["']{2}/.test(app));

const impStatus = app.match(/function impStatus\(ok, msg\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';
check('导入状态使用 textContent', impStatus.includes('el.textContent = msg'));
check('导入状态不再使用 innerHTML', !impStatus.includes('innerHTML'));

check('页面在资源加载前声明 CSP', html.indexOf('http-equiv="Content-Security-Policy"') >= 0 && html.indexOf('http-equiv="Content-Security-Policy"') < html.indexOf('<link rel="manifest"'));
check('CSP 禁止内联脚本与 eval', html.includes("script-src 'self'") && !html.includes("script-src 'unsafe-inline'") && !html.includes('unsafe-eval'));
check('Android 禁止系统备份', manifest.includes('android:allowBackup="false"'));
check('FileProvider 不再暴露整个外部存储', !paths.includes('<external-path') && paths.includes('path="shared/"'));

check('正式构建使用 assembleRelease', pkg.scripts['android:build'].includes('assembleRelease'));
check('Release 构建配置专用签名', gradle.includes('signingConfig signingConfigs.release'));
check('发布密钥不会被 Git 跟踪', ignore.includes('android/release.properties') && ignore.includes('android/keystore/'));

console.log('security hardening tests passed');
