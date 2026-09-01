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
