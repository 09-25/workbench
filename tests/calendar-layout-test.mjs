import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '..', 'styles.css'), 'utf8');
const heroDate = css.match(/\.hero-date\s*\{([^}]*)\}/)?.[1] || '';
if (!/white-space\s*:\s*nowrap/.test(heroDate)) {
  throw new Error('日期/农历信息必须保持横向单行排列');
}
if (!/overflow-x\s*:\s*auto/.test(heroDate)) {
  throw new Error('窄屏下日期/农历信息需要支持横向查看');
}

console.log('PASS  手机端日期与农历信息横向排列');
