"use strict";

/* ============================================================
   我的工作台 · 晚自习手账  ——  核心逻辑
   数据全部存在浏览器 localStorage，不上传任何服务器
   ============================================================ */

/* ---------------- 工具 ---------------- */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const COLOR_N = 8;

const DEFAULT_SLOTS = [
  { label: "第1-2节",  start: "08:00", end: "09:50" },
  { label: "第3-4节",  start: "10:10", end: "12:00" },
  { label: "第5-6节",  start: "14:00", end: "15:50" },
  { label: "第7-8节",  start: "16:10", end: "18:00" },
  { label: "第9-10节", start: "19:00", end: "20:50" },
];

const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const minutesOf = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const isDateStr = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const isTimeStr = s => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const safeUrl = u => { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : "#"; };

/* 学期第几周（以学期开始日所在周为第 1 周） */
function weekOf(dateStr) {
  if (!isDateStr(state.profile.semesterStart)) return 0;
  const a = mondayOf(parseDate(state.profile.semesterStart));
  const b = mondayOf(parseDate(dateStr));
  return Math.floor((b - a) / (7 * 864e5)) + 1;
}
const weekParity = w => (w % 2 === 1 ? "单周" : "双周");

/* ---------------- 数据 ---------------- */
const KEY = "hzx-workbench-v1";
const TOKEN_KEY = "hzx-workbench-token";     // GitHub token 单独存，不进备份文件
const now_ts = () => Date.now();
const stamp = obj => { obj.updatedAt = now_ts(); return obj; };
function stampAll(s) {                        // 整体替换类操作后，把所有条目标为"刚变更"
  const t = now_ts();
  s.courses.forEach(c => c.updatedAt = t);
  s.todos.forEach(c => c.updatedAt = t);
  s.habits.forEach(c => c.updatedAt = t);
  s.countdowns.forEach(c => c.updatedAt = t);
  s.links.forEach(c => c.updatedAt = t);
  Object.values(s.logs).forEach(l => { l.entriesUpdatedAt = t; l.noteUpdatedAt = t; });
  s.profile.updatedAt = t;
  s.slotsUpdatedAt = t;
  return s;
}
function addTombstone(ids, t = now_ts()) {
  for (const id of ids) if (id) state.tombstones.push({ id, at: t });
  if (state.tombstones.length > 500)           // 墓碑只留最近 30 天，防无限膨胀
    state.tombstones = state.tombstones.filter(x => x.at > t - 30 * 864e5);
}

function defaultState() {
  const thisMonday = mondayOf(new Date());
  return {
    profile: { name: "同学", semesterStart: todayStr(thisMonday), theme: "paper", updatedAt: 0 },
    slotsUpdatedAt: 0,
    slots: DEFAULT_SLOTS.map(s => ({ ...s })),
    courses: [],   // {id,name,teacher,room,day,slot,sec?,weeks,color,updatedAt}
    todos: [],     // {id,text,done,priority,due,createdAt,updatedAt}
    logs: {},      // date -> {entries:[{id,time,text,updatedAt}], note, entriesUpdatedAt, noteUpdatedAt}
    habits: [],    // {id,name,done:{date:true},updatedAt}
    countdowns: [],// {id,name,date,updatedAt}
    links: [],     // {id,name,url,updatedAt}
    tombstones: [],// {id, at}
    sync: { gistId: "", lastPush: 0, lastPull: 0 },
  };
}

function normalize(d) {
  const def = defaultState();
  return {
    profile: { ...def.profile, ...(d && d.profile || {}) },
    slotsUpdatedAt: d?.slotsUpdatedAt || 0,
    slots: (Array.isArray(d?.slots) && d.slots.length === 5) ? d.slots : def.slots,
    courses: Array.isArray(d?.courses) ? d.courses : [],
    todos: Array.isArray(d?.todos) ? d.todos : [],
    logs: (d?.logs && typeof d?.logs === "object") ? d.logs : {},
    habits: Array.isArray(d?.habits) ? d.habits : [],
    countdowns: Array.isArray(d?.countdowns) ? d.countdowns : [],
    links: Array.isArray(d?.links) ? d.links : [],
    tombstones: Array.isArray(d?.tombstones) ? d.tombstones : [],
    sync: { ...def.sync, ...(d?.sync || {}) },
  };
}

let state;
function save(scheduleSync = true) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  if (scheduleSync) pushSyncSoon();
}

/* ---------------- GitHub Gist 云同步 ---------------- */
const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
const setToken = t => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
function deviceName() {
  let d = localStorage.getItem("hzx-workbench-device");
  if (!d) {
    d = (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "手机" : "电脑") + "-" + Math.random().toString(36).slice(2, 6);
    localStorage.setItem("hzx-workbench-device", d);
  }
  return d;
}
let syncing = false;
async function ghApi(path, opts = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + getToken(),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const hint = res.status === 401 ? "：token 无效或过期"
      : res.status === 403 ? "：权限不足或触发限流（token 需勾选 gist 权限）"
      : res.status === 404 ? "：Gist ID 不存在，或 token 没有 gist 权限"
      : "";
    throw new Error(`GitHub API ${res.status}${hint}`);
  }
  return res.json();
}

async function pushSync() {
  if (syncing || !getToken() || !state.sync.gistId) return;
  syncing = true;
  try {
    const payload = JSON.stringify({ ...state, syncedAt: now_ts(), device: deviceName() });
    await ghApi(`/gists/${state.sync.gistId}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { "workbench-data.json": { content: payload } } }),
    });
    state.sync.lastPush = now_ts();
    save(false);
    renderSyncStatus();
  } catch (e) {
    console.warn("push failed:", e.message);
    toast("云同步推送失败：" + e.message);
  } finally { syncing = false; }
}
let pushTimer = null;
function pushSyncSoon(delay = 3000) {
  if (!getToken() || !state.sync.gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, delay);
}

async function pullSync(manual = false) {
  if (syncing || !getToken() || !state.sync.gistId) return;
  syncing = true;
  try {
    const gist = await ghApi(`/gists/${state.sync.gistId}`);
    const file = gist.files && gist.files["workbench-data.json"];
    if (!file || file.truncated) throw new Error("云端数据文件异常");
    const remote = JSON.parse(file.content);
    if (remote.device !== deviceName() || manual) {
      const remoteHasData = (remote.courses?.length || remote.todos?.length || remote.habits?.length) > 0;
      if (isPristineDemo(state) && remoteHasData) {
        // 全新设备（还是初始示例数据）：直接采用云端，避免示例混入真实数据
        state = normalize(remote);
        state.sync.gistId = state.sync.gistId || gist.id;
        save();
        applyTheme(); renderCurrent();
        toast("已从云端载入数据");
      } else {
        const { merged, changes } = mergeState(state, remote);
        if (changes > 0) {
          state = merged;
          save();                       // 合并结果回写云端
          applyTheme(); renderCurrent();
          toast(`已从云端合并 ${changes} 处更新`);
        } else if (manual) toast("云端没有新内容");
      }
    }
    state.sync.lastPull = now_ts();
    save(false);
    renderSyncStatus();
  } catch (e) {
    if (manual) toast("云同步拉取失败：" + e.message); else console.warn("pull failed:", e.message);
  } finally { syncing = false; }
}

/* 判断是否还是"纯初始示例"状态（所有条目都是内置示例 / 或为空） */
function isPristineDemo(s) {
  const allDemo = arr => arr.every(x => String(x.id || "").startsWith("demo-"));
  const logsDemo = Object.values(s.logs).every(l => (l.entries || []).every(e => String(e.id || "").startsWith("demo-")));
  return allDemo(s.courses) && allDemo(s.todos) && allDemo(s.habits) && allDemo(s.countdowns) && allDemo(s.links) && logsDemo;
}
async function fullSync() { await pullSync(true); await pushSync(); }

async function testAndSaveSync() {
  let token = $("#sync-token").value.trim();
  if (token.startsWith("••••")) token = getToken();          // 占位未改，沿用已存 token
  let gistId = $("#sync-gist").value.trim();
  if (!token) { toast("请先粘贴 GitHub Token（下面有申请链接）"); return; }
  try {
    if (gistId) {
      await ghApi(`/gists/${gistId}`);
    } else {
      // 先找这个账号里已有的同步 Gist（保证电脑和手机自动汇合到同一个），没有才新建
      const gists = await ghApi("/gists?per_page=100");
      const mine = (Array.isArray(gists) ? gists : []).find(g =>
        g.description && g.description.includes("我的工作台") && g.files && g.files["workbench-data.json"]);
      if (mine) {
        gistId = mine.id;
      } else {
        const gist = await ghApi("/gists", {
          method: "POST",
          body: JSON.stringify({
            description: "我的工作台 · 数据同步（自动生成，勿删）",
            public: false,
            files: { "workbench-data.json": { content: JSON.stringify({ syncedAt: 0, device: "init" }) } },
          }),
        });
        gistId = gist.id;
      }
      $("#sync-gist").value = gistId;
    }
    setToken(token);
    state.sync.gistId = gistId;
    state.sync.lastPush = 0; state.sync.lastPull = 0;
    save(false);
    renderSyncStatus();
    toast("✅ 云同步已连接");
    fullSync();
  } catch (e) {
    toast("连接失败：" + e.message);
  }
}
function disconnectSync() {
  if (!confirm("断开后将停止自动同步（云端数据保留，可随时重连）。确定吗？")) return;
  setToken("");
  state.sync = { gistId: "", lastPush: 0, lastPull: 0 };
  save(false); renderSyncStatus(); toast("已断开云同步");
}
const fmtClock = ts => ts ? new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—";
function renderSyncStatus() {
  const el = $("#sync-status"); if (!el) return;
  const on = !!getToken() && !!state.sync.gistId;
  el.innerHTML = on
    ? `<span style="color:var(--green)">● 已连接</span>&nbsp; 推送 ${fmtClock(state.sync.lastPush)} · 拉取 ${fmtClock(state.sync.lastPull)} · 本设备「${deviceName()}」`
    : `○ 未连接。配置 Token 后，电脑和手机的数据将自动同步。`;
}

/* ---------------- PWA（https 部署后生效，本地双击打开自动跳过） ---------------- */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
}

/* ---------------- 多端合并（字段级 LWW + 删除墓碑） ---------------- */
function mergeList(a, b, tomb) {
  const tmap = new Map(tomb.map(x => [x.id, x.at]));
  const map = new Map();
  for (const x of a) map.set(x.id, x);
  for (const y of b) {
    const cur = map.get(y.id);
    if (!cur || (y.updatedAt || 0) > (cur.updatedAt || 0)) map.set(y.id, y);
  }
  const out = [];
  for (const x of map.values()) {
    const tombAt = tmap.get(x.id);
    if (tombAt && tombAt >= (x.updatedAt || 0)) continue;   // 删除发生晚于最后修改 → 保持已删
    out.push(x);
  }
  return out;
}

function mergeState(localRaw, remoteRaw) {
  const a = normalize(localRaw), b = normalize(remoteRaw);
  let changes = 0;
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

  const tm = new Map();
  for (const t of a.tombstones) if (!tm.has(t.id) || tm.get(t.id).at < t.at) tm.set(t.id, t);
  for (const t of b.tombstones) if (!tm.has(t.id) || tm.get(t.id).at < t.at) tm.set(t.id, t);
  const tombstones = [...tm.values()];

  const lists = {};
  for (const k of ["courses", "todos", "habits", "countdowns", "links"]) {
    const merged = mergeList(a[k], b[k], tombstones);
    if (!eq(a[k], merged)) changes++;
    lists[k] = merged;
  }

  const dates = new Set([...Object.keys(a.logs), ...Object.keys(b.logs)]);
  const logs = {};
  for (const d of dates) {
    const la = a.logs[d], lb = b.logs[d];
    if (!la) { logs[d] = lb; if (lb && (lb.entries.length || lb.note)) changes++; continue; }
    if (!lb) { logs[d] = la; continue; }
    const mergedLog = {
      entries: mergeList(la.entries || [], lb.entries || [], tombstones),
      note: (lb.noteUpdatedAt || 0) > (la.noteUpdatedAt || 0) ? lb.note : la.note,
      entriesUpdatedAt: Math.max(la.entriesUpdatedAt || 0, lb.entriesUpdatedAt || 0),
      noteUpdatedAt: Math.max(la.noteUpdatedAt || 0, lb.noteUpdatedAt || 0),
    };
    if (!eq(la, mergedLog)) changes++;
    logs[d] = mergedLog;
  }

  const profile = (b.profile.updatedAt || 0) > (a.profile.updatedAt || 0) ? b.profile : a.profile;
  if (!eq(profile, a.profile)) changes++;
  const slots = (b.slotsUpdatedAt || 0) > (a.slotsUpdatedAt || 0) ? b.slots : a.slots;
  if (!eq(slots, a.slots)) changes++;

  const merged = normalize({
    ...a, ...lists, logs, profile, slots,
    slotsUpdatedAt: Math.max(a.slotsUpdatedAt || 0, b.slotsUpdatedAt || 0),
    tombstones,
  });
  merged.sync = a.sync;
  return { merged, changes };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return null;
}

state = load();
if (!state) {                       // 首次使用：自动放入一份示例数据，方便上手
  state = defaultState();
  seedDemo(state);
  save();
}

const getLog = date => (state.logs[date] ||= { entries: [], note: "" });
const daysUntil = dateStr => Math.round((parseDate(dateStr) - parseDate(todayStr())) / 864e5);
function habitStreak(h) {
  let n = 0, d = new Date();
  if (!h.done[todayStr(d)]) d = addDays(d, -1);
  while (h.done[todayStr(d)]) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------------- 示例数据（固定 id：两端各自的示例在同步时会自动去重） ---------------- */
function seedDemo(s) {
  s.profile.name = "Hzx";
  s.profile.semesterStart = "2026-08-24";
  const C = (i, name, teacher, room, day, slot, weeks, color) =>
    ({ id: "demo-c" + i, name, teacher, room, day, slot, weeks, color });
  s.courses = [
    C(1, "操作系统", "王老师", "教三-301", 1, 0, "all",  0),
    C(2, "计算机网络", "李老师", "教三-105", 1, 1, "all",  2),
    C(3, "数据库系统", "张老师", "教五-402", 2, 0, "all",  3),
    C(4, "大学英语", "Miss 陈", "外语楼-201", 2, 1, "odd",  6),
    C(5, "软件工程", "刘老师", "教三-201", 3, 0, "all",  1),
    C(6, "机器学习导论", "赵老师", "线上一流", 3, 1, "even", 5),
    C(7, "编译原理", "孙老师", "教四-302", 4, 0, "all",  4),
    C(8, "算法设计与分析", "周老师", "教三-108", 4, 1, "all",  7),
    C(9, "体育·网球", "吴老师", "田径场", 5, 1, "all",  2),
  ];
  const T = (i, text, done, priority, due) =>
    ({ id: "demo-t" + i, text, done, priority, due, createdAt: Date.now() });
  s.todos = [
    T(1, "复习操作系统第 2 章，整理进程调度笔记", false, 3, todayStr()),
    T(2, "交软件工程小组的需求分析文档", false, 3, todayStr(addDays(new Date(), 1))),
    T(3, "预习计算机网络实验，装好 Wireshark", false, 2, ""),
    T(4, "报名 12 月的英语六级", false, 2, "2026-09-15"),
    T(5, "给爸妈打个电话", false, 1, ""),
    T(6, "把上学期的书卖掉", true, 1, ""),
  ];
  s.habits = [
    { id: "demo-h1", name: "背 50 个单词", done: {} },
    { id: "demo-h2", name: "运动 30 分钟", done: {} },
    { id: "demo-h3", name: "23:30 前睡觉", done: {} },
  ];
  s.countdowns = [
    { id: "demo-cd1", name: "英语六级笔试", date: "2026-12-19" },
    { id: "demo-cd2", name: "期末考试周", date: "2027-01-11" },
  ];
  const L = (i, name, url) => ({ id: "demo-l" + i, name, url });
  s.links = [
    L(1, "中国大学MOOC", "https://www.icourse163.org"),
    L(2, "Bilibili", "https://www.bilibili.com"),
    L(3, "GitHub", "https://github.com"),
    L(4, "学校教务系统", "https://example.com"),
  ];
  s.logs[todayStr()] = {
    entries: [
      { id: "demo-e1", time: nowHM(), text: "开学第一周，领了新教材", updatedAt: now_ts() },
      { id: "demo-e2", time: nowHM(), text: "把课表录进工作台，顺手加了几个待办", updatedAt: now_ts() },
    ],
    note: "新学期 flag：不翘早八，坚持背单词。",
    entriesUpdatedAt: now_ts(),
    noteUpdatedAt: now_ts(),
  };
  s.profile.updatedAt = now_ts();
  s.slotsUpdatedAt = now_ts();
  s.courses.forEach(c => c.updatedAt = now_ts());
  s.todos.forEach(t => t.updatedAt = now_ts());
  s.habits.forEach(h => h.updatedAt = now_ts());
  s.countdowns.forEach(c => c.updatedAt = now_ts());
  s.links.forEach(l => l.updatedAt = now_ts());
}

/* ---------------- 视图状态 ---------------- */
let currentPage = "dashboard";
let todoFilter = "open";
let journalDate = todayStr();
let editingCourseId = null;
let editingCourseDay = null;
let editingCourseSlot = null;

/* ---------------- 页面切换 ---------------- */
const RENDERERS = {};
function switchPage(name) {
  currentPage = name;
  $$("#nav .nav-item, #tabbar a").forEach(el =>
    el.classList.toggle("active", el.dataset.page === name));
  $$(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + name));
  renderCurrent();
}
function renderCurrent() { RENDERERS[currentPage]?.(); }

/* ---------------- 主题 ---------------- */
function applyTheme() { document.documentElement.dataset.theme = state.profile.theme || "paper"; }

/* ============================================================
   概览
   ============================================================ */
function todayCourses() {
  const w = weekOf(todayStr());
  const dayIdx = new Date().getDay() === 0 ? 7 : new Date().getDay();
  return state.courses
    .filter(c => c.day === dayIdx && courseShown(c, w).show)
    .sort((a, b) => a.slot - b.slot);
}
/* ============ 周次模型 ============
   规范格式："all" | "odd" | "even" | "a-b" | "a-b单" | "a-b双" | "1,3,5"
   均可被 weekSet 解释为「上课周集合」，null 表示每周都上 */
function weekSet(spec) {
  if (!spec || spec === "all") return null;
  if (spec === "odd")  return new Set(Array.from({ length: 15 }, (_, i) => i * 2 + 1));
  if (spec === "even") return new Set(Array.from({ length: 15 }, (_, i) => i * 2 + 2));
  // 通用解析：逗号分隔的 token，每个 token = "a"、"a-b"、"a-b单/双"（可混合）
  const s = new Set();
  let matched = false;
  for (const t of String(spec).split(/[，,\s]+/)) {
    const m = t.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?([单双])?$/);
    if (!m) continue;
    matched = true;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let w = Math.min(a, b); w <= Math.min(Math.max(a, b), 30); w++)
      if (!m[3] || (m[3] === "单" ? w % 2 === 1 : w % 2 === 0)) s.add(w);
  }
  if (!matched) return null;
  return s.size ? s : new Set([999]);
}
function canonicalWeeks(set) {
  if (!set) return "all";
  const arr = [...set].filter(n => n >= 1 && n <= 30).sort((a, b) => a - b);
  if (!arr.length) return "all";
  if (arr.length === 1) return String(arr[0]);
  if (arr.length >= 12 && arr.every(n => n % 2 === 1)) return "odd";
  if (arr.length >= 12 && arr.every(n => n % 2 === 0)) return "even";
  const step2 = arr.every((n, i) => i === 0 || n === arr[i - 1] + 2);
  if (step2) {
    const p = arr[0] % 2 === 1 ? "单" : "双";
    return arr[0] === 1 && arr[arr.length - 1] >= 23 ? (p === "单" ? "odd" : "even")
      : `${arr[0]}-${arr[arr.length - 1]}${p}`;
  }
  const step1 = arr.every((n, i) => i === 0 || n === arr[i - 1] + 1);
  if (step1) return arr[0] === 1 && arr[arr.length - 1] >= 23 ? "all" : `${arr[0]}-${arr[arr.length - 1]}`;
  return arr.join(",");
}
/* 从教务文本（"1-17周"、"1-15周(单)"、"第3周"、"单周"…）解析成规范格式 */
function specFromEduText(raw) {
  if (!raw) return null;
  let t = String(raw).replace(/周次|星期|第/g, "").replace(/[（(]\s*([单双])\s*[)）]/g, "$1")
    .replace(/单周/g, "单").replace(/双周/g, "双").replace(/[–~]/g, "-").replace(/\s+/g, "");
  const parity = /单/.test(t) ? "单" : /双/.test(t) ? "双" : "";
  const range = t.match(/(\d+)-(\d+)/);
  if (range) {
    const s = new Set();
    for (let w = +range[1]; w <= Math.min(+range[2], 30); w++)
      if (!parity || (parity === "单" ? w % 2 === 1 : w % 2 === 0)) s.add(w);
    return canonicalWeeks(s);
  }
  const nums = (t.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 30);
  if (nums.length) {
    const s = new Set(nums.filter(n => !parity || (parity === "单" ? n % 2 === 1 : n % 2 === 0)));
    return canonicalWeeks(s.size ? s : new Set([999]));
  }
  if (parity) return parity === "单" ? "odd" : "even";
  return null;
}
const weeksLabel = spec =>
  !spec || spec === "all" ? "每周" :
  spec === "odd" ? "单周" : spec === "even" ? "双周" :
  /^[\d,]+$/.test(spec) && !spec.includes("-") ?
    (spec.includes(",") ? `第${spec.replace(/,/g, ",")}周` : `第${spec}周`) :
  spec.replace("单", "周·单").replace("双", "周·双").replace(/^(\d+-\d+)$/, "$1周");
function weeksTag(spec) {
  if (!spec || spec === "all") return "";
  if (spec === "odd") return "单周";
  if (spec === "even") return "双周";
  return spec;                       // 完整显示周次（如 1-3,6-9,11-12），不截断
}

function courseShown(c, week) {
  if (week < 1) return { show: true, dim: false };
  const set = weekSet(c.weeks);
  if (!set) return { show: true, dim: false };
  return { show: set.has(week), dim: !set.has(week) };
}
function slotOngoing(slotIdx) {
  const s = state.slots[slotIdx]; if (!s) return false;
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  return m >= minutesOf(s.start) && m < minutesOf(s.end);
}
function greetWord() {
  const h = new Date().getHours();
  if (h < 6)  return "夜深了";
  if (h < 9)  return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/* 今日上课状态：正在上 / 下一节 / 已结束 */
function classStatusLine() {
  const list = todayCourses();
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  const fmt = mins => {
    if (mins >= 60) return `还有 ${Math.floor(mins / 60)} 小时${mins % 60 ? ' ' + (mins % 60) + ' 分钟' : ''}`;
    return `还有 ${mins} 分钟`;
  };
  const cur = list.find(c => { const s = state.slots[c.slot]; return m >= minutesOf(s.start) && m < minutesOf(s.end); });
  if (cur) {
    const left = minutesOf(state.slots[cur.slot].end) - m;
    return `🔔 正在上「${cur.name}」${cur.room ? ' @' + cur.room : ''} · 还剩 ${left} 分钟`;
  }
  const next = list.find(c => minutesOf(state.slots[c.slot].start) > m);
  if (next) {
    const s = state.slots[next.slot];
    return `⏰ 下一节「${next.name}」${s.start} @${next.room || '待定'} · ${fmt(minutesOf(s.start) - m)}`;
  }
  if (list.length) return '✅ 今天的课都上完啦';
  return '🌤️ 今天没有排课，安排点自己的事吧';
}

RENDERERS.dashboard = function renderDashboard() {
  const d = new Date();
  const w = weekOf(todayStr());

  $("#greet").textContent = `${greetWord()}，${state.profile.name || "同学"}`;
  $("#hero-date").textContent =
    `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${DAYS[d.getDay()]}` +
    (w >= 1 ? ` · 本学期第 ${w} 周（${weekParity(w)}）` : " · 还没开学");
  const tc = todayCourses();
  $("#hero-sub").textContent = tc.length
    ? `今天有 ${tc.length} 节课，第一节 ${state.slots[tc[0].slot].start} 开上`
    : "今天没有排课，安排点自己的事吧";
  $("#hero-status").textContent = classStatusLine();

  /* 今日课程 */
  $("#today-courses-count").textContent = tc.length ? `共 ${tc.length} 节` : "";
  $("#today-courses").innerHTML = tc.length ? tc.map(c => {
    const s = state.slots[c.slot];
    const tag = slotOngoing(c.slot) ? `<span class="now-tag">正在上</span>` : "";
    return `<div class="tl-item${slotOngoing(c.slot) ? " now" : ""}">
      <div class="tl-time">${s.start}<br>${s.end}</div>
      <div class="tl-body">
        <div class="tl-title">${esc(c.name)}${tag}</div>
        <div class="tl-meta">${[c.teacher, c.room, c.sec, c.weeks && c.weeks !== "all" ? weeksLabel(c.weeks) : ""].filter(Boolean).join(" · ") || "&nbsp;"}</div>
      </div></div>`;
  }).join("") : `<div class="empty"><span class="e-ico">🌤️</span>今天没课，去图书馆或运动场吧</div>`;

  /* 今日待办 */
  const t0 = todayStr();
  const relevant = state.todos
    .filter(t => !t.done && (!t.due || t.due <= t0))
    .sort((a, b) => (b.priority || 2) - (a.priority || 2) || (a.due || "9999").localeCompare(b.due || "9999"));
  const shown = relevant.slice(0, 6);
  $("#today-todos").innerHTML = shown.length ? shown.map(todoItemHTML).join("")
    : `<div class="empty"><span class="e-ico">🍃</span>今天没有待办，轻松～</div>`;
  const total = state.todos.length, done = state.todos.filter(t => t.done).length;
  $("#todo-progress").style.width = total ? `${Math.round(done / total * 100)}%` : "0";
  $("#todo-progress-text").textContent = total ? `全部待办 ${done} / ${total}` : "还没有待办";

  /* 倒计时 */
  const cds = state.countdowns.filter(c => isDateStr(c.date))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  $("#countdowns").innerHTML = cds.length ? cds.map(c => {
    const n = daysUntil(c.date);
    const cls = n < 0 ? "past" : "";
    const txt = n > 0 ? `还有 ${n} 天` : n === 0 ? "就是今天！" : `已过 ${-n} 天`;
    return `<div class="cd-item"><span class="cd-name">${esc(c.name)}</span><span class="cd-days ${cls}">${txt}</span></div>`;
  }).join("") : `<div class="empty"><span class="e-ico">⏳</span>在设置里添加考试倒计时</div>`;

  /* 打卡总览 */
  $("#habit-summary").innerHTML = state.habits.length ? state.habits.map(h => {
    let dots = "";
    for (let i = 6; i >= 0; i--) {
      const ds = todayStr(addDays(new Date(), -i));
      const on = !!h.done[ds];
      dots += `<i class="hab-dot${on ? " on" : ""}${i === 0 ? " today" : ""}"></i>`;
    }
    const st = habitStreak(h);
    return `<div class="hab-row"><span class="hab-name">${esc(h.name)}</span>
      <span style="display:flex;align-items:center;gap:8px">
        ${st ? `<span class="hab-streak">🔥${st}天</span>` : ""}
        <span class="hab-week">${dots}</span>
      </span></div>`;
  }).join("") : `<div class="empty"><span class="e-ico">🌱</span>在设置里添加要坚持的小事</div>`;

  /* 常用入口 */
  $("#quick-links").innerHTML = state.links.length ? state.links.map(l =>
    `<a class="link-item" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">
      <span class="favicon">${esc((l.name || "?").trim().charAt(0))}</span>${esc(l.name)}</a>`).join("")
    : `<div class="empty"><span class="e-ico">🔗</span>添加常用网站入口</div>`;
};

let lastDateStr = todayStr();
function updateClock() {
  const el = $("#clock"); if (!el) return;
  const d = new Date();
  el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ds = todayStr(d);
  if (ds !== lastDateStr) {             // 跨天了：刷新"今天"的课程/待办，避免挂机串数据
    lastDateStr = ds;
    journalDate = ds;
    renderCurrent();
  }
}

/* ============================================================
   课程表（单周视图 / 整学期视图）
   ============================================================ */
let weekMode = "week";     // 'week' 按周看 | 'term' 整学期总览
let viewWeek = null;       // null = 跟随本周
const todayIdx = () => (new Date().getDay() === 0 ? 7 : new Date().getDay());

function weekStartDate(week) {   // 第 week 周的周一
  const base = mondayOf(parseDate(state.profile.semesterStart || todayStr()));
  return addDays(base, (week - 1) * 7);
}

RENDERERS.timetable = function renderTimetable() {
  const curWeek = weekOf(todayStr());
  if (viewWeek !== null) viewWeek = Math.max(1, Math.min(25, viewWeek));
  const week = weekMode === "term" ? curWeek : (viewWeek ?? Math.max(curWeek, 1));
  const atCurrentWeek = week === curWeek;

  /* —— 周切换器 —— */
  const parity = week % 2 === 1 ? "单周" : "双周";
  $("#wk-label").textContent = weekMode === "term" ? "整学期" : `第 ${week} 周·${parity}`;
  $("#wk-today-btn").hidden = weekMode === "term" || atCurrentWeek;
  $("#wk-mode-btn").textContent = weekMode === "term" ? "按周看" : "整学期";

  const weekStart = weekStartDate(week);
  const rangeTxt = `${weekStart.getMonth() + 1}.${weekStart.getDate()} – ${addDays(weekStart, 6).getMonth() + 1}.${addDays(weekStart, 6).getDate()}`;
  $("#tt-sub").textContent = weekMode === "term"
    ? (curWeek >= 1
        ? `本学期第 ${curWeek} 周 · ${weekParity(curWeek)}（学期开始日：${state.profile.semesterStart}）；淡色 = 本周不上`
        : `还没开学（${state.profile.semesterStart} 开始），课表全部正常显示`)
    : (curWeek >= 1
        ? `${rangeTxt} · 显示这一周要上的课`
        : `还没开学（${state.profile.semesterStart} 开始）· 正在预览第 ${week} 周`);

  const thisIdx = todayIdx();
  const showToday = weekMode === "term" || atCurrentWeek;
  const showChip = c => {
    const sh = courseShown(c, week);
    return weekMode === "term" ? { on: true, dim: sh.dim } : { on: sh.show, dim: false };
  };

  /* —— 网格 —— */
  let html = `<div class="tt-head"></div>`;
  for (let day = 1; day <= 7; day++) {
    const date = addDays(weekStartDate(week), day - 1);
    const isToday = showToday && day === thisIdx;
    html += `<div class="tt-head${isToday ? " today" : ""}"><b>周${"一二三四五六日"[day - 1]}</b><span class="d">${date.getMonth() + 1}.${date.getDate()}</span></div>`;
  }
  let shownCount = 0;
  state.slots.forEach((s, slotIdx) => {
    html += `<div class="tt-time"><b>${esc(s.label)}</b><span>${s.start}<br>${s.end}</span></div>`;
    for (let day = 1; day <= 7; day++) {
      const cellCourses = state.courses.filter(c => c.day === day && c.slot === slotIdx && showChip(c).on);
      shownCount += cellCourses.length;
      const inner = cellCourses.map(c => {
        const sh = courseShown(c, week);
        const dim = weekMode === "term" ? sh.dim : false;
        const wtag = c.weeks && c.weeks !== "all" ? `<span class="w-tag">${weeksTag(c.weeks)}</span>` : "";
        const sub = [c.room, c.teacher].filter(Boolean).join(" ");
        return `<div class="chip${dim ? " dim" : ""}" data-c="${c.color % COLOR_N}"
          data-action="edit-course" data-id="${c.id}" title="${esc([c.teacher, c.room].filter(Boolean).join(" · "))}">
          <b>${esc(c.name)}</b>${wtag}<span class="r">${esc(sub)}</span></div>`;
      }).join("");
      html += `<div class="tt-cell${showToday && day === thisIdx ? " today" : ""}" data-action="add-course" data-day="${day}" data-slot="${slotIdx}">${inner}</div>`;
    }
  });

  const emptyWeek = weekMode === "week" && shownCount === 0;
  if (emptyWeek) html = `<div class="empty" style="grid-column:1/-1"><span class="e-ico">🏖️</span>第 ${week} 周没有课，好好休息</div>`;
  $("#tt-grid").innerHTML = html;
  $("#tt-grid").style.display = emptyWeek ? "block" : "";
};

/* ============================================================
   待办
   ============================================================ */
function todoItemHTML(t) {
  const t0 = todayStr();
  const overdue = !t.done && t.due && t.due < t0;
  const priName = { 3: "高优先", 2: "中优先", 1: "低优先" }[t.priority || 2];
  let dueBadge = "";
  if (t.due) {
    const cls = overdue ? "overdue" : t.due === t0 ? "due" : "";
    const label = overdue ? `逾期 · ${t.due.slice(5).replace("-", "/")}` : t.due === t0 ? "今天到期" : `${t.due.slice(5).replace("-", "/")} 截止`;
    dueBadge = `<span class="badge ${cls}">${label}</span>`;
  }
  return `<div class="todo-item${t.done ? " done" : ""}">
    <button class="todo-check" data-action="toggle-todo" data-id="${t.id}" title="完成 / 取消">✓</button>
    <div class="todo-body">
      <div class="todo-text">${esc(t.text)}</div>
      <div class="todo-meta">
        <span class="badge p${t.priority || 2}">${priName}</span>${dueBadge}
      </div>
    </div>
    <button class="todo-del" data-action="del-todo" data-id="${t.id}" title="删除">✕</button>
  </div>`;
}

RENDERERS.todos = function renderTodos() {
  const t0 = todayStr();
  const open = state.todos.filter(t => !t.done);
  const todayN = open.filter(t => t.due && t.due <= t0).length;
  $("#todo-sub").textContent = `${open.length} 个未完成${todayN ? `，其中 ${todayN} 个今天到期` : ""}`;

  const counts = { open: open.length, today: todayN, all: state.todos.length, done: state.todos.length - open.length };
  $("#todo-tabs").innerHTML = [
    ["open", "未完成"], ["today", "今天"], ["all", "全部"], ["done", "已完成"],
  ].map(([k, label]) => `<button data-action="todo-filter" data-filter="${k}" class="${todoFilter === k ? "on" : ""}">${label}<span class="n">${counts[k]}</span></button>`).join("");

  let list = state.todos.slice();
  if (todoFilter === "open") list = list.filter(t => !t.done);
  else if (todoFilter === "done") list = list.filter(t => t.done);
  else if (todoFilter === "today") list = list.filter(t => !t.done && t.due && t.due <= t0);
  else list = list.slice();

  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if ((a.priority || 2) !== (b.priority || 2)) return (b.priority || 2) - (a.priority || 2);
    return (a.due || "9999").localeCompare(b.due || "9999") || (b.createdAt - a.createdAt);
  });

  $("#todo-list").innerHTML = list.length ? list.map(todoItemHTML).join("")
    : `<div class="empty"><span class="e-ico">✅</span>${todoFilter === "done" ? "还没有完成过待办" : "没有待办，加一条吧"}</div>`;
};

/* ============================================================
   日志
   ============================================================ */
RENDERERS.journal = function renderJournal() {
  const d = parseDate(journalDate);
  const w = weekOf(journalDate);
  $("#j-title").textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${DAYS[d.getDay()]}`;
  $("#j-week").textContent = w >= 1 ? `第 ${w} 周（${weekParity(w)}）`
    : `距开学还有 ${-daysUntil(state.profile.semesterStart)} 天`;
  if ($("#j-date-picker").value !== journalDate) $("#j-date-picker").value = journalDate;

  const log = state.logs[journalDate];
  const entries = (log?.entries || []).slice().reverse();
  $("#entry-list").innerHTML = entries.length ? entries.map(e =>
    `<div class="tl-item"><div class="tl-time entry-time">${esc(e.time)}</div>
      <div class="tl-body"><div class="tl-title" style="font-weight:400;font-size:14px">${esc(e.text)}</div></div>
      <button class="todo-del" style="opacity:.6" data-action="del-entry" data-id="${e.id}" title="删除">✕</button></div>`).join("")
    : `<div class="empty"><span class="e-ico">🗒️</span>这一天还没记录</div>`;

  $("#habit-list").innerHTML = state.habits.length ? state.habits.map(h => {
    const on = !!h.done[journalDate];
    const st = habitStreak(h);
    return `<div class="habit-pill${on ? " on" : ""}" data-action="toggle-habit" data-id="${h.id}">
      <span class="box">✓</span><span class="name">${esc(h.name)}</span>
      ${st ? `<span class="streak">已坚持 ${st} 天</span>` : ""}</div>`;
  }).join("") : `<div class="empty"><span class="e-ico">🌱</span>在设置里添加打卡习惯</div>`;

  const noteEl = $("#j-note");
  if (noteEl.dataset.forDate !== journalDate) {   // 只有切换日期才重置输入框，避免冲掉正在输入的内容
    noteEl.value = log?.note || "";
    noteEl.dataset.forDate = journalDate;
  }
};

/* ============================================================
   设置
   ============================================================ */
RENDERERS.settings = function renderSettings() {
  $("#s-name").value = state.profile.name || "";
  $("#s-semester").value = state.profile.semesterStart || "";
  $$('input[name="s-theme"]').forEach(r => r.checked = r.value === (state.profile.theme || "paper"));

  $("#s-slots").innerHTML = state.slots.map((s, i) =>
    `<div class="slot-row"><b>${esc(s.label || `第${i + 1}节`)}</b>
      <input type="time" data-slot-start="${i}" value="${esc(s.start)}">
      <input type="time" data-slot-end="${i}" value="${esc(s.end)}"></div>`).join("");

  $("#s-countdowns").innerHTML = state.countdowns.length ? state.countdowns.map((c, i) =>
    `<div class="edit-row"><input data-cd-name="${i}" placeholder="名称" value="${esc(c.name)}">
      <input type="date" data-cd-date="${i}" value="${esc(c.date)}">
      <button class="del-mini" data-action="cd-del" data-i="${i}">✕</button></div>`).join("")
    : `<p class="hint" style="margin:0 0 10px">还没有倒计时，比如「六级笔试」「期末考试周」。</p>`;

  $("#s-links").innerHTML = state.links.length ? state.links.map((l, i) =>
    `<div class="edit-row"><input data-link-name="${i}" placeholder="名称" value="${esc(l.name)}">
      <input data-link-url="${i}" placeholder="网址 https://…" value="${esc(l.url)}">
      <button class="del-mini" data-action="link-del" data-i="${i}">✕</button></div>`).join("")
    : `<p class="hint" style="margin:0 0 10px">还没有常用入口，加上教务系统、慕课等网址。</p>`;

  $("#s-habits").innerHTML = state.habits.length ? state.habits.map((h, i) =>
    `<div class="edit-row single"><input data-habit-name="${i}" placeholder="习惯名称，如：背 50 个单词" value="${esc(h.name)}">
      <button class="del-mini" data-action="habit-del" data-i="${i}">✕</button></div>`).join("")
    : `<p class="hint" style="margin:0 0 10px">还没有打卡习惯，加一条试试。</p>`;

  renderSyncStatus();
  const tokenEl = $("#sync-token");
  const saved = getToken();
  if (document.activeElement !== tokenEl) tokenEl.value = saved ? "••••••••（已保存）" : "";
  $("#sync-gist").value = state.sync.gistId || "";
};

/* ============================================================
   课程编辑弹窗
   ============================================================ */
function openCourseModal(course, day, slot) {
  editingCourseId = course ? course.id : null;
  editingCourseDay = course ? course.day : day;
  editingCourseSlot = course ? course.slot : slot;

  $("#cm-title").textContent = course ? "编辑课程" : "添加课程";
  $("#f-name").value = course?.name || "";
  $("#f-teacher").value = course?.teacher || "";
  $("#f-room").value = course?.room || "";

  $("#f-day").innerHTML = [1, 2, 3, 4, 5, 6, 7].map(d =>
    `<option value="${d}">周${"一二三四五六日"[d - 1]}</option>`).join("");
  $("#f-day").value = String(editingCourseDay || 1);

  $("#f-slot").innerHTML = state.slots.map((s, i) =>
    `<option value="${i}">${esc(s.label)} ${s.start}</option>`).join("");
  $("#f-slot").value = String(editingCourseSlot || 0);

  const w = course?.weeks || "all";
  $("#f-weeks").value = ["all", "odd", "even"].includes(w) ? w : "custom";
  const customInput = $("#f-weeks-custom");
  customInput.style.display = $("#f-weeks").value === "custom" ? "" : "none";
  customInput.value = $("#f-weeks").value === "custom" ? (course?.weeks || "") : "";

  const defColor = course ? course.color % COLOR_N : state.courses.length % COLOR_N;
  $("#f-colors").innerHTML = Array.from({ length: COLOR_N }, (_, i) =>
    `<label><input type="radio" name="f-color" value="${i}" ${i === defColor ? "checked" : ""}>
      <span class="sw-c" data-c="${i}"></span></label>`).join("");

  $("#cm-del").hidden = !course;
  $("#course-modal").hidden = false;
  setTimeout(() => $("#f-name").focus(), 30);
}
function closeCourseModal() { $("#course-modal").hidden = true; editingCourseId = null; }

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.hidden = true, 300); }, 1800);
}

/* ============================================================
   事件绑定
   ============================================================ */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) {
    if (e.target === $("#course-modal")) closeCourseModal();
    if (e.target === $("#import-modal")) $("#import-modal").hidden = true;
    return;
  }
  const act = el.dataset.action;

  switch (act) {
    /* 导航 */
    case "goto": switchPage(el.dataset.page); break;
    case "toggle-theme":
      state.profile.theme = (state.profile.theme === "night") ? "paper" : "night";
      state.profile.updatedAt = now_ts();
      save(); applyTheme();
      if (currentPage === "settings") renderCurrent();
      break;

    /* 课程表 */
    case "add-course": openCourseModal(null, +el.dataset.day, +el.dataset.slot); break;
    case "add-course-any": openCourseModal(null, editingCourseDay || 1, 0); break;
    case "edit-course": {
      const c = state.courses.find(x => x.id === el.dataset.id);
      if (c) openCourseModal(c);
      break;
    }
    case "del-course": {
      if (!editingCourseId) break;
      if (!confirm("确定删除这节课吗？")) break;
      state.courses = state.courses.filter(c => c.id !== editingCourseId);
      addTombstone([editingCourseId]);
      save(); closeCourseModal(); renderCurrent(); toast("已删除课程");
      break;
    }
    case "close-modal": closeCourseModal(); break;

    /* 教务导入 */
    case "open-import":
      $("#import-modal").hidden = false;
      if (!pendingImport.length) { $("#imp-status").hidden = true; $("#imp-preview-wrap").hidden = true; }
      break;
    case "close-import": $("#import-modal").hidden = true; break;
    case "pick-import-file": $("#imp-file").click(); break;
    case "imp-clear":
      pendingImport = [];
      $("#imp-preview-wrap").hidden = true;
      $("#imp-status").hidden = true;
      $("#imp-paste").textContent = "";
      break;
    case "imp-remove":
      pendingImport = pendingImport.filter(c => c.id !== el.dataset.id);
      renderImportPreview();
      if (!pendingImport.length) $("#imp-preview-wrap").hidden = true;
      break;
    case "imp-merge": {
      if (!pendingImport.length) break;
      const exist = new Set(state.courses.map(c => [c.name, c.day, c.slot, c.weeks].join("|")));
      const add = pendingImport.filter(c => {
        const k = [c.name, c.day, c.slot, c.weeks].join("|");
        return !exist.has(k);
      });
      add.forEach(c => {                    // 同名课沿用已有颜色，保持课表视觉一致
        const ex = state.courses.find(x => x.name === c.name);
        if (ex) c.color = ex.color;
      });
      stampAll({ courses: add, todos: [], habits: [], countdowns: [], links: [], logs: {}, profile: {}, slots: [] });
      state.courses.push(...add);
      save();
      $("#import-modal").hidden = true;
      switchPage("timetable");
      toast(add.length
        ? `合并导入 ${add.length} 门课程${add.length < pendingImport.length ? `（跳过重复 ${pendingImport.length - add.length} 门）` : ""}`
        : "没有新课程，全部与现有课表重复");
      pushSyncSoon(0);
      break;
    }
    case "imp-replace": {
      if (!pendingImport.length) break;
      if (!confirm(`替换会清空现有 ${state.courses.length} 门课程，确定吗？`)) break;
      addTombstone(state.courses.map(c => c.id));
      pendingImport.forEach(stamp);
      state.courses = pendingImport;
      save();
      $("#import-modal").hidden = true;
      switchPage("timetable");
      toast(`已导入 ${pendingImport.length} 门课程`);
      pushSyncSoon(0);
      break;
    }

    /* 待办 */
    case "toggle-todo": {
      const t = state.todos.find(x => x.id === el.dataset.id);
      if (t) { t.done = !t.done; t.updatedAt = now_ts(); save(); renderCurrent(); }
      break;
    }
    case "del-todo": {
      state.todos = state.todos.filter(x => x.id !== el.dataset.id);
      addTombstone([el.dataset.id]);
      save(); renderCurrent();
      break;
    }
    case "todo-filter": todoFilter = el.dataset.filter; renderCurrent(); break;

    /* 日志 */
    case "j-prev": journalDate = todayStr(addDays(parseDate(journalDate), -1)); renderCurrent(); break;
    case "j-next": journalDate = todayStr(addDays(parseDate(journalDate), 1)); renderCurrent(); break;
    case "j-today": journalDate = todayStr(); renderCurrent(); break;
    /* 周视图切换 */
    case "week-prev": viewWeek = (viewWeek ?? Math.max(weekOf(todayStr()), 1)) - 1; renderCurrent(); break;
    case "week-next": viewWeek = (viewWeek ?? Math.max(weekOf(todayStr()), 1)) + 1; renderCurrent(); break;
    case "week-today": viewWeek = null; renderCurrent(); break;
    case "week-mode": weekMode = weekMode === "week" ? "term" : "week"; renderCurrent(); break;
    case "del-entry": {
      const log = state.logs[journalDate]; if (!log) break;
      log.entries = log.entries.filter(x => x.id !== el.dataset.id);
      addTombstone([el.dataset.id]);
      log.entriesUpdatedAt = now_ts();
      save(); renderCurrent();
      break;
    }
    case "toggle-habit": {
      const h = state.habits.find(x => x.id === el.dataset.id); if (!h) break;
      h.done[journalDate] = !h.done[journalDate];
      if (!h.done[journalDate]) delete h.done[journalDate];
      h.updatedAt = now_ts();
      save(); renderCurrent();
      break;
    }

    /* 设置：增删行 */
    case "add-countdown": state.countdowns.push(stamp({ id: uid(), name: "", date: todayStr() })); save(); renderCurrent(); break;
    case "cd-del": {
      const cd = state.countdowns[+el.dataset.i];
      if (cd) addTombstone([cd.id]);
      state.countdowns.splice(+el.dataset.i, 1); save(); renderCurrent(); break;
    }
    case "add-link": state.links.push(stamp({ id: uid(), name: "", url: "" })); save(); renderCurrent(); break;
    case "link-del": {
      const lk = state.links[+el.dataset.i];
      if (lk) addTombstone([lk.id]);
      state.links.splice(+el.dataset.i, 1); save(); renderCurrent(); break;
    }

    /* 设置：保存 */
    case "save-profile": {
      const name = $("#s-name").value.trim();
      const sem = $("#s-semester").value;
      const changedProfile = state.profile.name !== (name || "同学") || state.profile.semesterStart !== sem;
      state.profile.name = name || "同学";
      if (isDateStr(sem)) {
        state.profile.semesterStart = sem;
        toast("已保存，周次按新日期计算");
      } else toast("已保存称呼（开学日期无效，未修改）");
      if (changedProfile) state.profile.updatedAt = now_ts();
      save(); renderCurrent();
      break;
    }
    case "save-slots": {
      let ok = true;
      state.slots.forEach((s, i) => {
        const st = $(`[data-slot-start="${i}"]`).value;
        const en = $(`[data-slot-end="${i}"]`).value;
        if (isTimeStr(st)) s.start = st; else ok = false;
        if (isTimeStr(en)) s.end = en; else ok = false;
      });
      state.slotsUpdatedAt = now_ts();
      save(); renderCurrent();
      toast(ok ? "作息已保存" : "作息已保存（个别时间格式无效，未修改）");
      break;
    }
    case "save-countdowns": {
      $$("#s-countdowns .edit-row").forEach((row, i) => {
        const c = state.countdowns[i]; if (!c) return;
        c.name = $(`[data-cd-name="${i}"]`, row).value.trim() || "倒计时";
        const dt = $(`[data-cd-date="${i}"]`, row).value;
        if (isDateStr(dt)) c.date = dt;
        c.updatedAt = now_ts();
      });
      state.countdowns = state.countdowns.filter(c => isDateStr(c.date));
      save(); renderCurrent(); toast("倒计时已保存");
      break;
    }
    case "save-links": {
      $$("#s-links .edit-row").forEach((row, i) => {
        const l = state.links[i]; if (!l) return;
        l.name = $(`[data-link-name="${i}"]`, row).value.trim() || "入口";
        let url = $(`[data-link-url="${i}"]`, row).value.trim();
        if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) url = "https://" + url;
        l.url = url;
        l.updatedAt = now_ts();
      });
      state.links = state.links.filter(l => /^https?:\/\//i.test(l.url));
      save(); renderCurrent(); toast("入口已保存");
      break;
    }
    /* 习惯管理 */
    case "add-habit": state.habits.push(stamp({ id: uid(), name: "", done: {} })); save(); renderCurrent(); break;
    case "habit-del": {
      const h = state.habits[+el.dataset.i];
      if (h) addTombstone([h.id]);
      state.habits.splice(+el.dataset.i, 1); save(); renderCurrent(); break;
    }
    case "save-habits": {
      $$("#s-habits .edit-row").forEach((row, i) => {
        const h = state.habits[i]; if (!h) return;
        h.name = $(`[data-habit-name="${i}"]`, row).value.trim() || "习惯";
        h.updatedAt = now_ts();
      });
      state.habits = state.habits.filter(h => h.name);
      save(); renderCurrent(); toast("习惯已保存");
      break;
    }

    /* 云同步 */
    case "sync-connect": testAndSaveSync(); break;
    case "sync-now": fullSync(); break;
    case "sync-disconnect": disconnectSync(); break;

    /* 数据 */
    case "export-data": {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `workbench-backup-${todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast("已导出备份 JSON");
      break;
    }
    case "import-data": $("#import-file").click(); break;
    case "load-demo": {
      if (!confirm("载入示例数据会覆盖当前所有数据，继续吗？")) break;
      state = stampAll({ ...defaultState(), sync: state.sync });
      seedDemo(state);
      save(); applyTheme(); renderCurrent(); toast("已载入示例数据");
      pushSyncSoon(0);
      break;
    }
    case "reset-all": {
      if (!confirm("确定清空全部数据吗？此操作无法撤销（建议先导出备份）。")) break;
      addTombstone([...state.courses.map(c => c.id), ...state.todos.map(t => t.id),
        ...state.habits.map(h => h.id), ...state.countdowns.map(c => c.id), ...state.links.map(l => l.id),
        ...Object.values(state.logs).flatMap(l => (l.entries || []).map(e => e.id))]);
      const syncKeep = state.sync;
      state = { ...defaultState(), tombstones: state.tombstones, sync: syncKeep };
      save(); applyTheme(); renderCurrent(); toast("已清空");
      pushSyncSoon(0);
      break;
    }
  }
});

/* —— 表单提交 —— */
$("#todo-form").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("#todo-text").value.trim();
  if (!text) return;
  state.todos.push(stamp({
    id: uid(), text, done: false,
    priority: +$("#todo-pri").value || 2,
    due: $("#todo-due").value || "",
    createdAt: Date.now(),
  }));
  $("#todo-text").value = "";
  save(); renderCurrent();
  $("#todo-text").focus();
});

$("#entry-form").addEventListener("submit", e => {
  e.preventDefault();
  const text = $("#entry-text").value.trim();
  if (!text) return;
  const log = getLog(journalDate);
  log.entries.push(stamp({ id: uid(), time: nowHM(), text }));
  log.entriesUpdatedAt = now_ts();
  $("#entry-text").value = "";
  save(); renderCurrent();
  $("#entry-text").focus();
});

$("#course-form").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("#f-name").value.trim();
  if (!name) return;
  let weeks = $("#f-weeks").value;
  if (weeks === "custom") {
    const parsed = specFromEduText($("#f-weeks-custom").value);
    weeks = parsed || "all";
    if (!parsed && $("#f-weeks-custom").value.trim()) toast("周次格式没认出来，已按每周处理");
  }
  const data = {
    name,
    teacher: $("#f-teacher").value.trim(),
    room: $("#f-room").value.trim(),
    day: +$("#f-day").value,
    slot: +$("#f-slot").value,
    weeks,
    color: +(new FormData($("#course-form")).get("f-color") || 0),
    updatedAt: now_ts(),
  };
  if (editingCourseId) {
    const c = state.courses.find(x => x.id === editingCourseId);
    if (!(+$("#f-day").value === c.day && +$("#f-slot").value === c.slot)) data.sec = undefined;  // 节次变了就弃用旧细粒度
    Object.assign(c, data);
    toast("课程已更新");
  } else {
    state.courses.push({ id: uid(), ...data });
    toast("已添加课程");
  }
  save(); closeCourseModal(); renderCurrent();
});

/* —— 其他 change / input —— */
document.addEventListener("change", e => {
  if (e.target.id === "f-weeks") {
    $("#f-weeks-custom").style.display = e.target.value === "custom" ? "" : "none";
  }
  if (e.target.id === "j-date-picker" && e.target.value) {
    journalDate = e.target.value; renderCurrent();
  }
  if (e.target.name === "s-theme") {
    state.profile.theme = e.target.value;
    save(); applyTheme();
  }
});

let noteTimer = null;
document.addEventListener("input", e => {
  if (e.target.id === "j-note") {
    const forDate = journalDate;          // 输入时刻就定下日期和内容，防抖期间切日期也不会写串/丢失
    const val = e.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const l = getLog(forDate);
      l.note = val;
      l.noteUpdatedAt = now_ts();
      save();
    }, 400);
  }
});

$("#import-file").addEventListener("change", e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== "object" || !("courses" in data)) throw new Error("bad");
      const keep = { sync: state.sync, tombstones: state.tombstones };   // 本机同步配置/墓碑不因导入丢失
      state = normalize(data);
      state.sync = keep.sync;
      state.tombstones = keep.tombstones;
      stampAll(state);
      save(); applyTheme(); renderCurrent();
      toast("导入成功");
      pushSyncSoon(0);
    } catch {
      toast("导入失败：文件格式不对");
    }
  };
  reader.readAsText(file);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#course-modal").hidden) closeCourseModal();
  else if (!$("#import-modal").hidden) $("#import-modal").hidden = true;
});

/* ============================================================
   从教务导入课表（陕理工 EAMS）
   支持：① 课表网页全选复制粘贴（text/html）② Excel 全选复制（TSV）
        ③ 另存的 .html 网页文件 ④ GBK 编码自动重读
   ============================================================ */
let pendingImport = [];

function impStatus(ok, msg) {
  const el = $("#imp-status");
  el.hidden = false;
  el.className = "imp-status " + (ok ? "ok" : "bad");
  el.innerHTML = msg;
}

/* 单元格 → 纯文本（<br> 与块级标签转行，保留换行结构） */
function cellTextOf(cell) {
  const tmp = document.createElement("div");
  tmp.innerHTML = cell.innerHTML
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th|tr|div|p|li)>/gi, "\n");
  return tmp.textContent.replace(/\u00a0/g, " ");
}

/* 把表格（含 rowspan/colspan）摊平成 grid[r][c] = {text, rows} */
function flattenTable(t) {
  const grid = [];
  const set = (r, c, o) => { (grid[r] ||= [])[c] = o; };
  [...t.rows].forEach((tr, ri) => {
    grid[ri] ||= [];
    let ci = 0;
    [...tr.cells].forEach(cell => {
      while (grid[ri][ci]) ci++;
      const cs = Math.min(cell.colSpan || 1, 8), rs = Math.min(cell.rowSpan || 1, 12);
      const obj = { text: cellTextOf(cell), rows: rs };
      for (let r = ri; r < ri + rs; r++) for (let c = ci; c < ci + cs; c++) set(r, c, obj);
      ci += cs;
    });
  });
  return grid;
}

const DAY_OF = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7 };
function dayFromText(s) {
  const m = String(s || "").match(/星期\s*([一二三四五六日天])|周\s*([一二三四五六日天])/);
  return m ? DAY_OF[m[1] || m[2]] : 0;
}
const CN_NUM = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
function cnNum(s) {
  if (CN_NUM[s]) return CN_NUM[s];
  if (s.length === 2 && s[0] === "十") return 10 + (CN_NUM[s[1]] || 0);
  if (s === "十一") return 11; if (s === "十二") return 12;
  return 0;
}
/* "第3节" / "3-4节" / "第三节" / "3" → {a,b} 节次范围 */
function secNoFromText(s) {
  s = String(s || "").trim();
  let m = s.match(/第?\s*(\d{1,2})\s*[-–~]?\s*(\d{1,2})?\s*节/);
  if (m) return { a: +m[1], b: +(m[2] || m[1]) };
  m = s.match(/第\s*([一二三四五六七八九十]{1,2})\s*[-—~]?\s*([一二三四五六七八九十]{1,2})?\s*节/);
  if (m) { const a = cnNum(m[1]); return { a, b: m[2] ? Math.max(cnNum(m[2]), 1) : a }; }
  if (/^\d{1,2}$/.test(s)) return { a: +s, b: +s };
  return null;
}

const WEEK_LINE = /(单周|双周|\d+\s*[-–~]\s*\d+\s*周|\d+\s*周|周.{0,3}\d+|\d{1,2}\s*[,，、]\s*\d+)/;
function looksTeacherLine(s) {
  const t = s.replace(/^(教师|主讲|老师)[::／/]?\s*/, "").trim();
  return /^[\u4e00-\u9fa5·]{2,4}([,，、][\u4e00-\u9fa5·]{2,4})*$/.test(t)
    || /^[A-Za-z][A-Za-z.\s]{2,19}$/.test(t);
}
function looksRoomLine(s) {
  return /\d/.test(s) && s.length <= 18 && !WEEK_LINE.test(s) && !looksTeacherLine(s);
}
/* 一个格子里可能有多门课：按「课程名行」分块 */
function splitBlocks(text) {
  const lines = String(text).split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks = [];
  let cur = [], curHasWeeks = false;
  for (const line of lines) {
    if (/^[-—–]{3,}$/.test(line)) { if (cur.length) blocks.push(cur); cur = []; curHasWeeks = false; continue; }
    const isWeek = WEEK_LINE.test(line) || /^(每周|单周|双周)$/.test(line);
    const isMeta = isWeek || looksTeacherLine(line) || looksRoomLine(line);
    if (!isMeta && curHasWeeks && cur.length) { blocks.push(cur); cur = []; curHasWeeks = false; }
    if (isWeek) curHasWeeks = true;
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}
function parseBlock(lines) {
  if (!lines.length) return null;
  const name = lines[0].replace(/^【|】$/g, "").trim();
  if (!name || name.length > 30) return null;
  let weeks = "all", teacher = "", room = "";
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (weeks === "all" && WEEK_LINE.test(l)) {
      const w = specFromEduText(l);
      if (w) { weeks = w; continue; }
    }
    if (!teacher && looksTeacherLine(l)) { teacher = l.replace(/^(教师|主讲|老师)[::／/]?\s*/, ""); continue; }
    if (!room && looksRoomLine(l)) { room = l; continue; }
  }
  return { name, weeks, teacher, room };
}

const slotOf = secA => Math.max(1, Math.min(5, Math.ceil(secA / 2)));
const secLabel = (a, b) => a === b ? `第${a}节` : `第${a}-${b}节`;
function importColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % COLOR_N;
}

/* entries: [{day, secA, secB, text}] → 去重 + 相邻节次合并 → course 对象 */
function coursesFromGridTexts(entries) {
  const parsed = [];
  const seen = new Set();
  for (const e of entries) {
    for (const blk of splitBlocks(e.text)) {
      const c = parseBlock(blk);
      if (!c) continue;
      const key = [c.name, e.day, e.secA, c.weeks, c.teacher, c.room].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({ ...c, day: e.day, _secA: e.secA, _secB: e.secB });
    }
  }
  parsed.sort((x, y) => x.day - y.day || x._secA - y._secA);
  const merged = [];
  for (const c of parsed) {
    const prev = merged[merged.length - 1];
    if (prev && prev.name === c.name && prev.day === c.day && prev.weeks === c.weeks
      && prev.teacher === c.teacher && prev.room === c.room && c._secA <= prev._secB + 1) {
      prev._secB = Math.max(prev._secB, c._secB);
      continue;
    }
    merged.push(c);
  }
  return merged.map(c => ({
    id: uid(), name: c.name, teacher: c.teacher, room: c.room,
    day: c.day, slot: slotOf(c._secA), sec: secLabel(c._secA, c._secB),
    weeks: c.weeks, color: importColor(c.name),
  }));
}

function parseImportHTML(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let best = null, bestScore = 0;
  doc.querySelectorAll("table").forEach(t => {
    const rows = [...t.rows];
    if (rows.length < 2) return;
    const txt = t.textContent || "";
    const maxCols = Math.max(...rows.map(r => r.cells.length), 0);
    let score = 0;
    if (/周[一二三四五六日]|星期[一二三四五六日天]/.test(txt)) score += 30;
    if (WEEK_LINE.test(txt)) score += 40;
    score += Math.min(maxCols, 8) + Math.min(rows.length, 14);
    if (maxCols < 4) score -= 60;
    if (score > bestScore) { bestScore = score; best = t; }
  });
  if (!best) return { ok: false, msg: "没找到课表表格。请确认复制的是<b>课表页面</b>的全选内容。" };
  const grid = flattenTable(best);
  let headRow = -1;
  for (let r = 0; r < grid.length; r++) {
    const days = new Set();
    (grid[r] || []).forEach(o => { const d = o && dayFromText(o.text); if (d) days.add(d); });
    if (days.size >= 5) { headRow = r; break; }
  }
  if (headRow < 0) return { ok: false, msg: "表格里没认出「星期」表头，无法对齐到周几。" };
  const colDay = new Map();
  (grid[headRow] || []).forEach((o, c) => {
    if (!o) return;
    const d = dayFromText(o.text);
    if (d && ![...colDay.values()].includes(d)) colDay.set(c, d);
  });
  const entries = [];
  let seqSec = 0;
  for (let r = headRow + 1; r < grid.length; r++) {
    const leadObj = (grid[r] || []).find(Boolean);
    const sec = leadObj ? secNoFromText(leadObj.text) : null;
    const thisSec = sec || { a: seqSec + 1, b: seqSec + 1 };
    seqSec = thisSec.b;
    for (const [c, day] of colDay) {
      const o = (grid[r] || [])[c];
      if (!o || !o.text || !o.text.trim()) continue;
      const startRow = grid.findIndex(row => row && row[c] === o);   // rowspan 起始行
      if (startRow !== r) continue;
      const b = Math.max(thisSec.b, thisSec.a + o.rows - 1);
      entries.push({ day, secA: thisSec.a, secB: b, text: o.text });
    }
  }
  const courses = coursesFromGridTexts(entries);
  if (!courses.length) return { ok: false, msg: "找到表格但没解析出课程，格子内容格式可能比较特殊。" };
  return { ok: true, courses };
}

/* 引号感知的 TSV 解析（Excel 复制的单元格内换行在引号里，不能直接按行拆） */
function parseTSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; continue; }
      if (ch === '"') { inQ = false; continue; }
      field += ch; continue;
    }
    if (ch === '"' && field === "") { inQ = true; continue; }
    if (ch === "\t") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  row.push(field);
  if (field || row.length > 1) rows.push(row);
  return rows;
}

function parseImportTSV(text) {
  const rows = parseTSV(text);
  let head = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].filter(c => dayFromText(c)).length >= 5) { head = i; break; }
  }
  if (head < 0) return { ok: false, msg: "粘贴内容里没找到「星期」表头。请从课表页面全选复制，或从 Excel 全选复制。" };
  const colDay = new Map();
  rows[head].forEach((cell, i) => { const d = dayFromText(cell); if (d) colDay.set(i, d); });
  const entries = [];
  let sec = 0;
  for (let i = head + 1; i < rows.length; i++) {
    const lead = secNoFromText(rows[i][0] || "");
    if (lead) sec = lead.a;
    else sec++;
    for (const [idx, day] of colDay) {
      const t = (rows[i][idx] || "").trim();
      if (t) entries.push({ day, secA: sec, secB: lead ? lead.b : sec, text: t });
    }
  }
  const courses = coursesFromGridTexts(entries);
  if (!courses.length) return { ok: false, msg: "解析出 0 门课程，请确认内容来自课表。" };
  return { ok: true, courses };
}

function handleImportRaw(raw, label) {
  if (raw.startsWith("PK")) {
    impStatus(false, "这是真正的 Excel(.xlsx) 二进制文件。<b>请用 Excel 打开 → 全选 → 复制 → 粘贴到上面</b>，或从教务课表网页直接全选复制。");
    return;
  }
  if (raw.slice(0, 2) === "\u00d0\u00cf") {
    impStatus(false, "这是老版 Excel(.xls) 二进制文件。同上：用 Excel 打开后全选复制再粘贴。");
    return;
  }
  const res = /<table|<td|<tr/i.test(raw)
    ? parseImportHTML(raw)
    : raw.includes("\t") ? parseImportTSV(raw) : null;
  if (!res) { impStatus(false, "内容没认出来：需要包含表格的 HTML，或带制表符（Excel）的表格文本。"); return; }
  if (!res.ok) { impStatus(false, res.msg); return; }
  pendingImport = res.courses;
  impStatus(true, `✅ 从${label}解析出 <b>${res.courses.length} 门课程</b>。检查预览没问题后点「合并导入」或「替换整个课表」。`);
  renderImportPreview();
}

function renderImportPreview() {
  $("#imp-preview-wrap").hidden = !pendingImport.length;
  if (!pendingImport.length) return;
  $("#imp-count").textContent = `共 ${pendingImport.length} 门`;
  $("#imp-preview").innerHTML = pendingImport.map(c =>
    `<div class="imp-row">
      <i class="imp-dot" style="background:var(--n${c.color}-bg)"></i>
      <b>${esc(c.name)}</b>
      <span class="muted">周${"一二三四五六日"[c.day - 1]} · ${esc(c.sec)} · ${esc(weeksLabel(c.weeks))}${c.teacher ? " · " + esc(c.teacher) : ""}${c.room ? " · " + esc(c.room) : ""}</span>
      <button class="todo-del" style="opacity:.7" data-action="imp-remove" data-id="${c.id}">✕</button>
    </div>`).join("");
}

function readImportFile(f) {
  const r = new FileReader();
  r.onload = () => {
    const s = String(r.result);
    if (s.includes("\uFFFD")) {           // utf-8 读出乱码 → 尝试 GBK（国内教务常见编码）
      const r2 = new FileReader();
      r2.onload = () => handleImportRaw(String(r2.result), `文件「${f.name}」`);
      r2.readAsText(f, "gbk");
    } else handleImportRaw(s, `文件「${f.name}」`);
  };
  r.readAsText(f, "utf-8");
}

/* —— 导入弹窗交互 —— */
$("#imp-paste").addEventListener("paste", e => {
  e.preventDefault();
  const cd = e.clipboardData;
  if (!cd) return;
  const html = cd.getData("text/html");
  const text = cd.getData("text/plain");
  $("#imp-paste").textContent = text ? "已收到粘贴内容…" : "";
  if (/<table|<td|<tr/i.test(html || "")) handleImportRaw(html, "粘贴的网页表格");
  else if (text && (text.includes("\t") || WEEK_LINE.test(text))) handleImportRaw(text, "粘贴的表格文本");
  else impStatus(false, "粘贴内容里没有表格。请在教务系统<b>课表页面</b> Ctrl+A 全选后再复制，或从 Excel 全选复制。");
});

$("#imp-file").addEventListener("change", e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) readImportFile(f);
});

const impDrop = $("#imp-drop");
["dragover", "dragenter"].forEach(ev =>
  impDrop.addEventListener(ev, e => { e.preventDefault(); impDrop.classList.add("over"); }));
impDrop.addEventListener("dragleave", () => impDrop.classList.remove("over"));
impDrop.addEventListener("drop", e => {
  e.preventDefault();
  impDrop.classList.remove("over");
  const f = e.dataTransfer?.files?.[0];
  if (f) readImportFile(f);
});

/* ============================================================
   启动
   ============================================================ */

/* 一键配置云同步：#sync=base64({"token":"…","gist":"…"})（配置后立即从 URL 中清除） */
(function () {
  const m = location.hash.match(/#sync=([A-Za-z0-9+/=_-]+)/);
  if (!m) return;
  try {
    const cfg = JSON.parse(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (cfg.token && cfg.gist) {
      localStorage.setItem(TOKEN_KEY, cfg.token);
      state.sync.gistId = cfg.gist;
      state.sync.lastPush = 0;
      state.sync.lastPull = 0;
      save(false);
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(() => { pullSync(true); switchPage("timetable"); }, 600);
    }
  } catch (e) { console.warn("sync config parse failed", e); }
})();

applyTheme();
switchPage("dashboard");
updateClock();
setInterval(updateClock, 1000);
setInterval(() => {                    // 上课状态条每 30 秒刷新
  if (currentPage === "dashboard" && !document.hidden) {
    const el = $("#hero-status");
    if (el) el.textContent = classStatusLine();
  }
}, 30000);

/* 课表页：键盘 ←/→ 翻周 */
document.addEventListener("keydown", e => {
  if (currentPage !== "timetable") return;
  if (!$("#course-modal").hidden || !$("#import-modal").hidden) return;
  const tag = document.activeElement?.tagName || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === "ArrowLeft") { viewWeek = (viewWeek ?? Math.max(weekOf(todayStr()), 1)) - 1; renderCurrent(); }
  if (e.key === "ArrowRight") { viewWeek = (viewWeek ?? Math.max(weekOf(todayStr()), 1)) + 1; renderCurrent(); }
});

if (getToken() && state.sync.gistId) {
  pullSync(false);
  setInterval(() => { if (!document.hidden) pullSync(false); }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getToken() && state.sync.gistId) pullSync(false);
  });
}
