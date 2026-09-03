import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
const model = app.match(/function weekSet\(spec\)[\s\S]*?(?=const weeksLabel)/)?.[0];
if (!model) throw new Error('未找到周次解析函数');
const { specFromEduText, weekSet } = Function(`${model}; return { specFromEduText, weekSet };`)();

const cases = [
  ['(2-5,7-9 9A610(南区))', '2-5,7-9', [2, 3, 4, 5, 7, 8, 9]],
  ['(1-9,11-16 9A615(南区))', '1-9,11-16', [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16]],
  ['(9,12-18 9A202(南区))', '9,12-18', [9, 12, 13, 14, 15, 16, 17, 18]],
  ['(11 9A220(南区))', '11', [11]],
];

for (const [raw, expectedSpec, expectedWeeks] of cases) {
  const spec = specFromEduText(raw);
  if (spec !== expectedSpec) throw new Error(`${raw} 应解析为 ${expectedSpec}，实际为 ${spec}`);
  const actualWeeks = [...weekSet(spec)].sort((a, b) => a - b);
  if (actualWeeks.join(',') !== expectedWeeks.join(',')) {
    throw new Error(`${raw} 上课周应为 ${expectedWeeks.join(',')}，实际为 ${actualWeeks.join(',')}`);
  }
}

console.log('PASS  多段周次与教室号正确分离');
