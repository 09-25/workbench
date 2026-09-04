import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
if (!app.includes('c.room ? "教室：" + c.room : ""')) {
  throw new Error('课表卡片必须明确显示教室');
}
if (!app.includes('c.teacher ? "教师：" + c.teacher : ""')) {
  throw new Error('课表卡片必须明确显示教师');
}

console.log('PASS  课程卡片明确显示教室');
