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

const importModel = app.match(/const WEEK_LINE =[\s\S]*?(?=const secLabel)/)?.[0];
if (!importModel) throw new Error('未找到教务课表分块函数');
const { splitBlocks, parseBlock } = Function(`${model}; ${importModel}; return { splitBlocks, parseBlock };`)();
const actualCell = [
  '微控制器及应用 (22093701.01) [5-6节] [考试] [学分:3]',
  '(王平)',
  '(11 9A111(南区))',
  '数字信号处理 (22093604.01) [3-4节] [考试] [学分:2.5]',
  '(魏瑞)',
  '(11-18 9A123(南区))',
].join('\n');
const parsedCell = splitBlocks(actualCell).map(parseBlock).filter(Boolean);
if (parsedCell.length !== 2) throw new Error(`一个格子里的两门课应拆成两门，实际为 ${parsedCell.length} 门`);
if (parsedCell[0].weeks !== '11' || parsedCell[1].weeks !== '11-18') {
  throw new Error(`单周与连续周应保留，实际为 ${parsedCell.map(c => c.weeks).join('、')}`);
}
if (parsedCell[0].room !== '9A111(南区)' || parsedCell[1].room !== '9A123(南区)') {
  throw new Error(`教室应从周次括号中分离出来，实际为 ${parsedCell.map(c => c.room || '空').join('、')}`);
}

const migrationModel = app.match(/function repairLegacyImportedCourseWeeks\(course\)[\s\S]*?(?=function normalize)/)?.[0];
if (!migrationModel) throw new Error('未找到旧导入周次修复函数');
const { repairLegacyImportedCourseWeeks } = Function(`${model}; const now_ts = () => 1; ${migrationModel}; return { repairLegacyImportedCourseWeeks };`)();
const migrated = repairLegacyImportedCourseWeeks({ name: '微控制器及应用', weeks: 'all', room: '(11 9A111(南区))' });
if (migrated.weeks !== '11') {
  throw new Error(`旧导入的单周课程应修复为第 11 周，实际为 ${migrated.weeks}`);
}

console.log('PASS  多段周次与教室号正确分离');
