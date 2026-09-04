import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const css = readFileSync(resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
for (const value of ['soft', 'solid', 'outline']) {
  if (!html.includes(`value="${value}"`)) throw new Error(`缺少课程样式选项 ${value}`);
}
if (!app.includes('const style = course?.style || "soft"')) throw new Error('课程编辑没有默认柔和样式');
if (!app.includes('data-style="${style}"')) throw new Error('课程卡片没有输出样式');
if (!css.includes('.chip .r.strong')) throw new Error('课程时间/教室缺少醒目样式');
console.log('PASS  课程可单独设置颜色和样式');
