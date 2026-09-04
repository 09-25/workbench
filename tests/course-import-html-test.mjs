import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
if (!/\.replace\(\/<br\\b\[\^>\]\*\>\/gi, "\\n"\)/.test(app)) {
  throw new Error('HTML 导入必须识别带属性的 br 换行');
}

const specFromEduText = raw => {
  const m = String(raw).match(/(?:^|[（(])\s*(\d{1,2}(?:\s*[-–~]\s*\d{1,2})?)/);
  return m ? m[1].replace(/\s+/g, '') : null;
};
const parser = app.match(/const WEEK_LINE = [\s\S]*?function parseBlock\(lines\) \{[\s\S]*?\n\}/)?.[0];
if (!parser) throw new Error('未找到 HTML 课表解析函数');
const { parseBlock } = Function(`const specFromEduText = ${specFromEduText.toString()}; ${parser}; return { parseBlock };`)();
const parsed = parseBlock([
  '通信原理        (22093601.01)',
  '[1-2节]', '[考试]', '[学分:3.5]', '[总学时:62]', '[讲授学时:62]',
  '(张文丽)', '(1-2  9A110(南区))',
]);
if (parsed.name !== '通信原理') throw new Error(`课程编号未剥离：${parsed.name}`);
if (parsed.teacher !== '张文丽') throw new Error(`教师识别错误：${parsed.teacher}`);
if (parsed.room !== '9A110(南区)') throw new Error(`教室识别错误：${parsed.room}`);
if (parsed.weeks !== '1-2') throw new Error(`周次识别错误：${parsed.weeks}`);
console.log('PASS  教务 HTML 课程名称、教师、教室和周次正确分离');
