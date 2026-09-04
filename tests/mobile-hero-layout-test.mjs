import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
const mobile = css.match(/@media \(max-width: 920px\) \{([\s\S]*)\n\}/)?.[1] || '';
if (!/\.hero\s*\{[\s\S]*display:\s*grid/.test(mobile)) {
  throw new Error('手机端首页头部应使用网格布局');
}
if (!/grid-template-areas:\s*["']left calendar["'][\s\n]*["']clock calendar["']/.test(mobile)) {
  throw new Error('手机端应将日期信息、时钟与月历分区排列');
}
if (!/\.hero-clock\s*\{[\s\S]*font-size:\s*34px/.test(mobile)) {
  throw new Error('手机端时钟应缩小');
}
if (!/\.hero-sub\s*\{[\s\S]*white-space:\s*nowrap/.test(mobile)) {
  throw new Error('手机端今日课程摘要不应出现孤立换行');
}

console.log('PASS  手机端首页头部按参考图布局');
