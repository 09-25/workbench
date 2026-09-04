import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const app = readFileSync(resolve(import.meta.dirname, '..', 'app.js'), 'utf8');
for (const action of ['bot-today', 'bot-quick-todo', 'bot-focus']) {
  if (!html.includes(`data-action="${action}"`)) throw new Error(`缺少机器人快捷操作 ${action}`);
}
if (!app.includes('botFocusState')) throw new Error('缺少专注状态');
if (!app.includes('function botToday')) throw new Error('缺少今日课表命令');
if (!app.includes('function botQuickTodo')) throw new Error('缺少快速待办命令');
if (!app.includes('function botFocus')) throw new Error('缺少专注命令');
console.log('PASS  机器人指令中枢结构存在');
