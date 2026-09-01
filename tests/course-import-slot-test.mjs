import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
const match = app.match(/function slotOf\s*\(secA\)\s*\{\s*return\s+([^;]+);/);
if (!match) throw new Error('未找到导入节次换算函数');
const slotOf = Function('secA', `return (${match[1]});`);

for (const [section, expectedSlot] of [[1, 0], [3, 1], [5, 2], [7, 3], [9, 4]]) {
  const actual = slotOf(section);
  if (actual !== expectedSlot) {
    throw new Error(`第 ${section} 节应导入到时间格 ${expectedSlot}，实际为 ${actual}`);
  }
}

const repairMatch = app.match(/function repairLegacyImportedCourseSlot\(course\)\s*\{[\s\S]*?(?=\n\nfunction normalize)/);
if (!repairMatch) throw new Error('未找到旧导入课表修复函数');
const repairLegacyImportedCourseSlot = Function(
  'slotOf', 'now_ts', `${repairMatch[0]}; return repairLegacyImportedCourseSlot;`,
)(slotOf, () => 0);

if (repairLegacyImportedCourseSlot({ slot: 1, sec: '第1-2节' }).slot !== 0) {
  throw new Error('已导入的第 1-2 节课程没有自动回到第一个时间格');
}
if (repairLegacyImportedCourseSlot({ slot: 0, sec: '第1-2节' }).slot !== 0) {
  throw new Error('正确位置的课程不应被二次移动');
}

console.log('PASS  Excel 节次与课表时间格正确对齐，并能修复旧导入数据');
