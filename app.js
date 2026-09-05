"use strict";

/* ============================================================
   我的工作台 · 晚自习手账  ——  核心逻辑
   数据全部存在浏览器 localStorage，不上传任何服务器
   ============================================================ */

/* ---------------- 工具 ---------------- */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const IS_NATIVE_APP = Boolean(window.Capacitor?.isNativePlatform?.());
const pad = n => String(n).padStart(2, "0");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const COLOR_N = 8;
const CURRENT_SEMESTER_START = "2026-08-31";
const LEGACY_DEFAULT_SEMESTER_START = "2026-08-24";

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
const CERT_CATS = ["学科竞赛", "科技竞赛", "等级证书", "荣誉称号", "奖学金", "社会实践", "文体活动", "其他"];
const CERT_LEVELS = ["国家级", "省级", "市级", "校级", "院级", "其他"];
const CERT_AWARDS = ["特等奖", "一等奖", "二等奖", "三等奖", "金奖", "银奖", "铜奖", "优秀奖", "合格证书", "其他"];
const CERT_PHOTO_LIMIT = 1200000;   // 压缩后 dataURL 字符上限（约 900KB，防 localStorage 爆仓）
const KEY = "hzx-workbench-v1";
const LEGACY_TOKEN_KEY = "hzx-workbench-token";
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
  return {
    profile: { name: "同学", semesterStart: CURRENT_SEMESTER_START, theme: "paper", namePrompted: false, welcomePromptVersion: 1, updatedAt: 0 },
    slotsUpdatedAt: 0,
    slots: DEFAULT_SLOTS.map(s => ({ ...s })),
    courses: [],   // {id,name,teacher,room,day,slot,sec?,weeks,color,updatedAt}
    todos: [],     // {id,text,done,priority,due,createdAt,updatedAt}
    logs: {},      // date -> {entries:[{id,time,text,updatedAt}], note, entriesUpdatedAt, noteUpdatedAt}
    habits: [],    // {id,name,done:{date:true},updatedAt}
    countdowns: [],// {id,name,date,updatedAt}
    links: [],     // {id,name,url,updatedAt}
    certs: [],     // {id,name,cat,level,award,date,issuer,score,note,photo,createdAt,updatedAt}
    tombstones: [],// {id, at}
    sync: { gistId: "", lastPush: 0, lastPull: 0 },
  };
}

// 2026 秋季学期原先误设为 8 月 24 日；仅迁移该旧默认值，不覆盖用户自己选的日期。
function migrateDefaultSemesterStart(profile) {
  if (profile?.semesterStart === LEGACY_DEFAULT_SEMESTER_START) {
    return { ...profile, semesterStart: CURRENT_SEMESTER_START };
  }
  return profile;
}

// 旧版把演示数据当成“老用户”，导致首次称呼弹窗被静默跳过。
function migrateWelcomePrompt(profile) {
  if ((profile?.welcomePromptVersion || 0) >= 1) return profile;
  return {
    ...profile,
    namePrompted: profile?.name === "Hzx" ? false : Boolean(profile?.namePrompted),
    welcomePromptVersion: 1,
  };
}

// 课程表时间格使用 0-4 下标：第 1-2 节对应第 0 格，第 9-10 节对应第 4 格。
function slotOf(secA) {
  return Math.max(0, Math.min(4, Math.floor((secA - 1) / 2)));
}

// 旧版本曾将教务导入课程整体下移一格。旧数据的节次可能在 sec、课程名或备注中。
function repairLegacyImportedCourseSlot(course) {
  const fixed = { ...course };
  const secText = [fixed.sec, fixed.name, fixed.room].filter(Boolean).join(" ");
  const m = secText.match(/(?:第|\[)?\s*(\d{1,2})(?:\s*[-–~]\s*\d{1,2})?\s*节/);
  if (!m) return fixed;
  const secA = +m[1];
  const legacySlot = Math.max(1, Math.min(5, Math.ceil(secA / 2)));
  const expectedSlot = slotOf(secA);
  if (Number(fixed.slot) === legacySlot && expectedSlot !== legacySlot) {
    fixed.slot = expectedSlot;
    fixed.updatedAt = now_ts();
  }
  return fixed;
}

// 旧版导入器没把“(11 9A111)”一类单周格式认作周次，而是错当教室，导致显示为每周。
function repairLegacyImportedCourseWeeks(course) {
  const fixed = { ...course };
  if (fixed.weeks && fixed.weeks !== "all") return fixed;
  const inferred = specFromEduText(fixed.room);
  if (inferred) {
    fixed.weeks = inferred;
    fixed.updatedAt = now_ts();
  }
  return fixed;
}

function normalizeCourseStyle(course) {
  const fixed = { ...course };
  fixed.style = ["soft", "solid", "outline"].includes(fixed.style) ? fixed.style : "soft";
  return fixed;
}

function normalize(d) {
  const def = defaultState();
  const profile = migrateWelcomePrompt(migrateDefaultSemesterStart({ ...def.profile, ...(d && d.profile || {}) }));
  return {
    profile,
    slotsUpdatedAt: d?.slotsUpdatedAt || 0,
    slots: (Array.isArray(d?.slots) && d.slots.length === 5) ? d.slots : def.slots,
    courses: Array.isArray(d?.courses) ? d.courses.map(repairLegacyImportedCourseSlot).map(repairLegacyImportedCourseWeeks).map(normalizeCourseStyle) : [],
    todos: Array.isArray(d?.todos) ? d.todos : [],
    logs: (d?.logs && typeof d?.logs === "object") ? d.logs : {},
    habits: Array.isArray(d?.habits) ? d.habits : [],
    countdowns: Array.isArray(d?.countdowns) ? d.countdowns : [],
    links: Array.isArray(d?.links) ? d.links : [],
    certs: Array.isArray(d?.certs) ? d.certs.filter(x => x && typeof x === "object" && typeof x.name === "string" && x.name).map(sanitizeCert) : [],
    tombstones: Array.isArray(d?.tombstones) ? d.tombstones : [],
    sync: { ...def.sync, ...(d?.sync || {}) },
  };
}

let state;
let quotaWarned = false;
function save(scheduleSync = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    quotaWarned = false;
  } catch (e) {
    console.warn(e);
    if (!quotaWarned) { quotaWarned = true; toast("本机存储空间已满，这次可能没存上；删几张证书照片再试试", 3200); }
  }
  if (scheduleSync) pushSyncSoon();
}

/* ---------------- GitHub Gist 云同步 ---------------- */
// 同步 Token 只留在当前网页会话内；旧版持久 Token 会在升级后主动清除。
let syncToken = "";
const getToken = () => syncToken;
const setToken = t => { syncToken = String(t || "").trim(); };
try { localStorage.removeItem(LEGACY_TOKEN_KEY); } catch (e) { console.warn(e); }
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
  if (IS_NATIVE_APP || syncing || !getToken() || !state.sync.gistId) return;
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
  if (IS_NATIVE_APP || !getToken() || !state.sync.gistId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushSync, delay);
}

async function pullSync(manual = false) {
  if (IS_NATIVE_APP || syncing || !getToken() || !state.sync.gistId) return;
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
  if (IS_NATIVE_APP) return;
  let token = $("#sync-token").value.trim();
  if (token.startsWith("••••")) token = getToken();          // 会话内未改，沿用当前 Token
  let gistId = $("#sync-gist").value.trim();
  if (!token) { toast("请先粘贴 GitHub Token（下面有申请链接）"); return; }
  const previousToken = getToken();
  setToken(token);                                              // API 校验必须使用本次手动输入的 Token
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
    setToken(previousToken);
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
  el.textContent = on
    ? `● 已连接 · 推送 ${fmtClock(state.sync.lastPush)} · 拉取 ${fmtClock(state.sync.lastPull)} · 本设备「${deviceName()}」`
    : "○ 未连接。本次网页会话内手动配置 Token 后才会同步。";
  const ind = $("#sync-ind");
  if (ind) ind.textContent = on ? "● 已同步" : "";
}

/* ---------------- PWA（https 部署后生效，本地双击打开自动跳过） ---------------- */
/* APK 本地版绝不能留 Service Worker：WebView 里残留的旧 SW 会让覆盖安装后
   仍显示旧版（用户被迫卸载重装）。发现即注销 + 清缓存 + 重载一次。 */
if (IS_NATIVE_APP) {
  (async () => {
    try {
      const regs = (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
        ? await navigator.serviceWorker.getRegistrations() : [];
      for (const r of regs) await r.unregister();
      const ks = (window.caches && caches.keys) ? await caches.keys() : [];
      for (const k of ks) await caches.delete(k);
      if ((regs.length || ks.length) && !sessionStorage.getItem("sw-cleaned")) {
        sessionStorage.setItem("sw-cleaned", "1");
        location.reload();
      }
    } catch (e) { console.warn("sw cleanup:", e); }
  })();
} else if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => { }));
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "SW_UPDATED") toast("🔄 新版本已就绪，正在为你刷新…", 6000);
  });
  /* 新 SW 接管后自动刷新一次，避免用户一直看旧页面 */
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!sessionStorage.getItem("sw-reloaded")) {
      sessionStorage.setItem("sw-reloaded", "1");
      location.reload();
    }
  });
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
  for (const k of ["courses", "todos", "habits", "countdowns", "links", "certs"]) {
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
  s.profile.semesterStart = CURRENT_SEMESTER_START;
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

/* ---------------- 首次称呼设置 ---------------- */
function shouldPromptForName(profile) {
  return !profile?.namePrompted;
}
function dismissWelcomeNameModal() {
  if ($("#welcome-modal").hidden) return;
  state.profile.namePrompted = true;
  state.profile.updatedAt = now_ts();
  save();
  $("#welcome-modal").hidden = true;
}
function showWelcomeNameModal() {
  if (!shouldPromptForName(state.profile)) return;
  $("#welcome-name").value = state.profile.name === "同学" ? "" : state.profile.name || "";
  $("#welcome-modal").hidden = false;
  setTimeout(() => $("#welcome-name").focus(), 30);
}
function saveWelcomeName() {
  const name = $("#welcome-name").value.trim();
  if (name) {
    state.profile.name = name;
    state.profile.updatedAt = now_ts();
  }
  dismissWelcomeNameModal();
  renderCurrent();
  if (name) toast(`你好，${name}！`);
}

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
  // 断开的连续区间保留为教务系统常见格式，如 2-5,7-9 或 1-9,11-16。
  const parts = [];
  for (let i = 0; i < arr.length;) {
    const start = arr[i];
    let end = start;
    while (arr[i + 1] === end + 1) end = arr[++i];
    parts.push(start === end ? String(start) : `${start}-${end}`);
    i++;
  }
  return parts.join(",");
}
/* 从教务文本（"1-17周"、"1-15周(单)"、"第3周"、"单周"…）解析成规范格式 */
function specFromEduText(raw) {
  if (!raw) return null;
  let t = String(raw).replace(/周次|星期|第/g, "").replace(/[（(]\s*([单双])\s*[)）]/g, "$1")
    .replace(/单周/g, "单").replace(/双周/g, "双").replace(/[–~]/g, "-").trim();
  const parity = /单/.test(t) ? "单" : /双/.test(t) ? "双" : "";
  // 教务单元格常见："(2-5,7-9 9A610)"。只取括号/文本开头的周次段，教室号不能参与解析。
  const weekPart = t.match(/(?:^|[（(])\s*(\d{1,2}(?:\s*-\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*-\s*\d{1,2})?)*)/);
  if (weekPart) {
    const s = new Set();
    for (const token of weekPart[1].split(/\s*[,，、]\s*/)) {
      const m = token.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
      if (!m) continue;
      const a = +m[1], b = +(m[2] || m[1]);
      for (let w = Math.min(a, b); w <= Math.min(Math.max(a, b), 30); w++)
        if (w >= 1 && (!parity || (parity === "单" ? w % 2 === 1 : w % 2 === 0))) s.add(w);
    }
    if (s.size) return canonicalWeeks(s);
  }
  if (parity) return parity === "单" ? "odd" : "even";
  return null;
}
const weeksLabel = spec =>
  !spec || spec === "all" ? "每周" :
  spec === "odd" ? "单周" : spec === "even" ? "双周" :
  /^[\d,，-]+$/.test(spec) ? `第${spec}周` :
  spec.replace("单", "周·单").replace("双", "周·双");
function weeksTag(spec) {
  if (!spec || spec === "all") return "";
  if (spec === "odd") return "单周";
  if (spec === "even") return "双周";
  if (/^[\d,，-]+$/.test(spec)) return spec + "周";
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

/* ============================================================
   农历 / 干支 / 节气 / 节日（1900-2100 标准历表算法）
   ============================================================ */
const LUNAR_INFO = [
  0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
  0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
  0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
  0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
  0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
  0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
  0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
  0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
  0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
  0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
  0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
  0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
  0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
  0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
  0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
  0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
  0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
  0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
  0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
  0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,
  0x0d520];
const LUNAR_MONTHS = "正二三四五六七八九十冬腊";
const LUNAR_DAYS = ["初一","初二","初三","初四","初五","初六","初七","初八","初九","初十",
  "十一","十二","十三","十四","十五","十六","十七","十八","十九","二十",
  "廿一","廿二","廿三","廿四","廿五","廿六","廿七","廿八","廿九","三十"];
const GAN = "甲乙丙丁戊己庚辛壬癸", ZHI = "子丑寅卯辰巳午未申酉戌亥";
const ZODIAC = "鼠牛虎兔龙蛇马羊猴鸡狗猪";
const TERM_NAMES = ["小寒","大寒","立春","雨水","惊蛰","春分","清明","谷雨","立夏","小满","芒种","夏至","小暑","大暑","立秋","处暑","白露","秋分","寒露","霜降","立冬","小雪","大雪","冬至"];
const TERM_MS = 31556925974.7 / 24;   // 每个节气的平均毫秒数（近似，误差≤1天）
const SOLAR_FEST = { "1/1": "元旦", "2/14": "情人节", "3/8": "妇女节", "3/12": "植树节", "5/1": "劳动节", "5/4": "青年节", "6/1": "儿童节", "8/1": "建军节", "9/10": "教师节", "10/1": "国庆节", "12/25": "圣诞节" };
const LUNAR_FEST = { "1/1": "春节", "1/15": "元宵节", "2/2": "龙抬头", "5/5": "端午节", "7/7": "七夕节", "8/15": "中秋节", "9/9": "重阳节", "12/8": "腊八节", "12/23": "小年" };

const lunarLeapMonth = y => LUNAR_INFO[y - 1900] & 0xf;
const lunarLeapDays = y => lunarLeapMonth(y) ? ((LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29) : 0;
const lunarMonthDays = (y, m) => (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
function lunarYearDays(y) {
  let s = 348;
  for (let i = 0x8000; i > 0x8; i >>= 1) s += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
  return s + lunarLeapDays(y);
}
function solarToLunar(date) {
  let offset = Math.floor((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(1900, 0, 31)) / 864e5);
  let y = 1900;
  while (y < 2101 && offset >= lunarYearDays(y)) { offset -= lunarYearDays(y); y++; }
  const leap = lunarLeapMonth(y);
  let m = 1, isLeap = false, days = 0;
  while (m < 13 && offset > 0) {
    if (leap > 0 && m === leap + 1 && !isLeap) { --m; isLeap = true; days = lunarLeapDays(y); }
    else days = lunarMonthDays(y, m);
    if (isLeap && m === leap + 1) isLeap = false;
    offset -= days; m++;
  }
  if (offset === 0 && leap > 0 && m === leap + 1) { if (isLeap) { isLeap = false; } else { isLeap = true; --m; } }
  if (offset < 0) { offset += days; --m; }
  const d = offset + 1;
  const gz = GAN[(y - 4) % 10] + ZHI[(y - 4) % 12];
  return {
    year: y, month: m, day: d, isLeap,
    monthName: (isLeap ? "闰" : "") + LUNAR_MONTHS[m - 1] + "月",
    dayName: LUNAR_DAYS[d - 1],
    ganzhi: gz, zodiac: ZODIAC[(y - 4) % 12],
    fest: LUNAR_FEST[m + "/" + d] || "",
    isChuxi: false,
  };
}
function solarTermOf(d) {
  const base = Date.UTC(1900, 0, 6, 2, 5);
  const dayUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n0 = Math.floor((dayUtc - base) / TERM_MS);
  for (const n of [n0 - 1, n0, n0 + 1]) {
    const td = new Date(base + n * TERM_MS);
    if (td.getUTCFullYear() === d.getFullYear() && td.getUTCMonth() === d.getMonth() && td.getUTCDate() === d.getDate())
      return TERM_NAMES[((n % 24) + 24) % 24];
  }
  return "";
}
/* 组装一行日历信息：公历+周几+农历+干支生肖+节气/节日 */
function calendarLine(date, weekTxt) {
  const L = solarToLunar(date);
  const tomorrow = solarToLunar(addDays(date, 1));
  const isChuxi = tomorrow.fest === "春节";
  const fest = L.fest || SOLAR_FEST[(date.getMonth() + 1) + "/" + date.getDate()] || (isChuxi ? "除夕" : "");
  const term = solarTermOf(date);
  const parts = [
    `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekTxt}`,
    `农历${L.monthName}${L.dayName}`,
    `${L.ganzhi}${L.zodiac}年`,
  ];
  if (fest) parts.push(`🏮 ${fest}`);
  else if (term) parts.push(`· ${term}`);
  return parts.join(" · ").replace(" · 🏮", " 🏮").replace(" · · ", " · ");
}
function monthCalendarHTML(date) {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const start = (firstDay + 6) % 7; // Date API 周日开头，月历按周一开头
  const days = new Date(year, month + 1, 0).getDate();
  const today = todayStr(date);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const day = i - start + 1;
    if (day < 1 || day > days) return '<i class="hero-calendar-empty" aria-hidden="true"></i>';
    const dateStr = year + '-' + pad(month + 1) + '-' + pad(day);
    return '<i class="' + (dateStr === today ? 'is-today' : '') + '">' + day + '</i>';
  }).join('');
  return '<div class="hero-calendar-title">' + year + ' 年 ' + (month + 1) + ' 月</div>' +
    '<div class="hero-calendar-week"><i>一</i><i>二</i><i>三</i><i>四</i><i>五</i><i>六</i><i>日</i></div>' +
    '<div class="hero-calendar-days">' + cells + '</div>';
}
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
  const weekInfo = w >= 1 ? ` · 本学期第 ${w} 周（${weekParity(w)}）` : " · 还没开学";
  $("#hero-date").textContent = calendarLine(d, DAYS[d.getDay()]) + weekInfo;
  $("#hero-calendar").innerHTML = monthCalendarHTML(d);
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
        <div class="tl-meta">${[c.room ? "教室：" + c.room : "", c.teacher ? "教师：" + c.teacher : "", c.sec, c.weeks && c.weeks !== "all" ? weeksLabel(c.weeks) : ""].filter(Boolean).join(" · ") || "&nbsp;"}</div>
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
  $("#todo-progress").value = total ? Math.round(done / total * 100) : 0;
  $("#todo-progress-text").textContent = total ? `全部待办 ${done} / ${total}` : "还没有待办";

  /* 倒计时（过期超过 7 天的自动隐藏，避免页面堆僵尸卡片） */
  const cds = state.countdowns.filter(c => isDateStr(c.date) && daysUntil(c.date) >= -7)
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
      <span class="habit-row-meta">
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
        const style = ["soft", "solid", "outline"].includes(c.style) ? c.style : "soft";
        const timeText = `${s.start}–${s.end}`;
        const roomText = c.room ? `教室：${c.room}` : "教室待定";
        return `<div class="chip style-${style}${dim ? " dim" : ""}" data-c="${c.color % COLOR_N}" data-style="${style}"
          data-action="edit-course" data-id="${c.id}" title="${esc([c.teacher, c.room].filter(Boolean).join(" · "))}">
          <b>${esc(c.name)}</b>${wtag}
          <span class="r strong"><span class="chip-time">${timeText}</span><span class="chip-room">${esc(roomText)}</span></span>
          ${c.teacher ? `<span class="r">教师：${esc(c.teacher)}</span>` : ""}</div>`;
      }).join("");
      html += `<div class="tt-cell${showToday && day === thisIdx ? " today" : ""}" data-action="add-course" data-day="${day}" data-slot="${slotIdx}">${inner}</div>`;
    }
  });

  const emptyWeek = weekMode === "week" && shownCount === 0;
  if (emptyWeek) html = `<div class="empty empty-wide"><span class="e-ico">🏖️</span>第 ${week} 周没有课，好好休息</div>`;
  $("#tt-grid").innerHTML = html;
  $("#tt-grid").classList.toggle("tt-empty", emptyWeek);
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
  return `<div class="todo-item${t.done ? " done" : ""}${t.justDone ? " just-done" : ""}">
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
  const L = solarToLunar(d);
  $("#j-title").innerHTML = [`${d.getMonth() + 1} 月 ${d.getDate()} 日`, DAYS[d.getDay()], `${L.monthName}${L.dayName}`]
    .map(t => `<span class="seg">${t}</span>`).join("<span> · </span>");
  $("#j-week").textContent = w >= 1 ? `第 ${w} 周（${weekParity(w)}）`
    : `距开学还有 ${-daysUntil(state.profile.semesterStart)} 天`;
  if ($("#j-date-picker").value !== journalDate) $("#j-date-picker").value = journalDate;

  const log = state.logs[journalDate];
  const entries = (log?.entries || []).slice().reverse();
  $("#entry-list").innerHTML = entries.length ? entries.map(e =>
    `<div class="tl-item"><div class="tl-time entry-time">${esc(e.time)}</div>
      <div class="tl-body"><div class="tl-title entry-text">${esc(e.text)}</div></div>
      <button class="todo-del subtle-delete" data-action="del-entry" data-id="${e.id}" title="删除">✕</button></div>`).join("")
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
let settingsTab = "basic";
function setSettingsTab(t) {
  settingsTab = t;
  $$("#set-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  $$('#page-settings .card[data-group]').forEach(c => { c.hidden = c.dataset.group !== t; });
}

/* ---------------- 证书墙（综测档案） ---------------- */
let certEditId = null;
let certPhotoData = "";             // 表单里暂存的证书照片 dataURL

// 格式像日期且真的存在于日历（拦 2099-13-45 这类）
function isRealDateStr(s) {
  if (!isDateStr(s)) return false;
  const d = parseDate(s);
  return +s.slice(0, 4) === d.getFullYear() && +s.slice(5, 7) === d.getMonth() + 1 && +s.slice(8, 10) === d.getDate();
}

function sanitizeCert(c) {
  const n = +c.score;
  const out = {
    id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : uid(),
    name: String(c.name || "").slice(0, 80),
    cat: CERT_CATS.includes(c.cat) ? c.cat : "其他",
    level: CERT_LEVELS.includes(c.level) ? c.level : "其他",
    award: CERT_AWARDS.includes(c.award) ? c.award : "",
    date: isRealDateStr(c.date) ? c.date : "",
    issuer: typeof c.issuer === "string" ? c.issuer.slice(0, 40) : "",
    note: typeof c.note === "string" ? c.note.slice(0, 100) : "",
    score: isFinite(n) && n > 0 ? Math.min(100, Math.round(n * 10) / 10) : 0,
    createdAt: +c.createdAt || 0,
    updatedAt: +c.updatedAt || 0,
  };
  if (typeof c.photo === "string" && /^data:image\//.test(c.photo) && c.photo.length <= CERT_PHOTO_LIMIT * 2) out.photo = c.photo;
  return out;
}

// 学年：8 月起算新学年，如 2026-09 → "2026-2027"
function schoolYearOf(dateStr) {
  if (!isRealDateStr(dateStr)) return "未标注学年";
  const d = parseDate(dateStr);
  return d.getMonth() >= 7 ? d.getFullYear() + "-" + (d.getFullYear() + 1) : (d.getFullYear() - 1) + "-" + d.getFullYear();
}

let certSelectsFilled = false;
function fillCertSelects() {
  if (certSelectsFilled) return;
  certSelectsFilled = true;
  $("#cert-cat").innerHTML = CERT_CATS.map(c => `<option>${c}</option>`).join("");
  $("#cert-level").innerHTML = CERT_LEVELS.map(c => `<option>${c}</option>`).join("");
  $("#cert-award").innerHTML = '<option value="">（无等级）</option>' + CERT_AWARDS.map(c => `<option>${c}</option>`).join("");
  $("#cert-date").value = todayStr();
}

function certGroupsSorted(list = state.certs) {
  const certs = [...list].sort((x, y) =>
    (y.date || "").localeCompare(x.date || "") || (y.updatedAt || 0) - (x.updatedAt || 0));
  const groups = new Map();
  for (const c of certs) {
    const y = schoolYearOf(c.date);
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(c);
  }
  return groups;
}

function certCard(c) {
  const tags = [
    c.level && c.level !== "其他" ? `<span class="cert-tag lv">${esc(c.level)}</span>` : "",
    c.cat && c.cat !== "其他" ? `<span class="cert-tag">${esc(c.cat)}</span>` : "",
    c.award ? `<span class="cert-tag award">${esc(c.award)}</span>` : "",
    `<span class="cert-date">${esc(c.date || "时间未填")}</span>`,
  ].join("");
  return `<div class="card cert-card">
    ${c.photo ? `<img class="cert-thumb" src="${esc(c.photo)}" data-action="cert-photo-view" data-id="${c.id}" alt="证书照片">` : ""}
    <div class="cert-body">
      <div class="cert-title"><b>${esc(c.name)}</b>${+c.score ? `<span class="cert-score">+${c.score} 分</span>` : ""}</div>
      <div class="cert-tags">${tags}</div>
      ${c.issuer ? `<div class="cert-issuer">颁发：${esc(c.issuer)}</div>` : ""}
      ${c.note ? `<div class="cert-note">${esc(c.note)}</div>` : ""}
    </div>
    <div class="cert-ops">
      <button class="del-mini" data-action="cert-edit" data-id="${c.id}" title="编辑">✎</button>
      <button class="del-mini" data-action="cert-del" data-id="${c.id}" title="删除">✕</button>
    </div>
  </div>`;
}

let certFilter = "all";

RENDERERS.certs = function renderCerts() {
  fillCertSelects();
  const view = certFilter === "all" ? state.certs : state.certs.filter(c => c.cat === certFilter);
  const groups = certGroupsSorted(view);
  const all = [...groups.values()].flat();
  const thisYear = schoolYearOf(todayStr());
  const yearCount = all.filter(c => schoolYearOf(c.date) === thisYear).length;
  const totalScore = all.reduce((t, c) => t + (+c.score || 0), 0);
  const totalAll = state.certs.length;
  $("#cert-filter").innerHTML = ["all", ...CERT_CATS].map(cat => {
    const n = cat === "all" ? totalAll : state.certs.filter(c => c.cat === cat).length;
    const label = cat === "all" ? "全部" : cat;
    return `<button class="cert-chip${certFilter === cat ? " on" : ""}" data-action="cert-filter" data-cat="${cat}">${label}<i>${n}</i></button>`;
  }).join("");
  $("#cert-stats").innerHTML = `
    <div class="cert-stat"><b>${all.length}</b><span>证书总数</span></div>
    <div class="cert-stat"><b>${yearCount}</b><span>${thisYear} 学年</span></div>
    <div class="cert-stat accent"><b>${totalScore}</b><span>综测加分合计</span></div>`;
  $("#cert-list").innerHTML = all.length ? [...groups.entries()].map(([y, arr]) => {
    const sub = arr.reduce((t, c) => t + (+c.score || 0), 0);
    return `<div class="cert-year"><h2>${esc(y)} 学年<i>共 ${arr.length} 项 · 加分 ${sub} 分</i></h2></div>`
      + arr.map(certCard).join("");
  }).join("")
    : (certFilter === "all"
      ? `<div class="empty"><span class="e-ico">🎖️</span>还没有证书。拿了奖、考了证，就从上面收进来～</div>`
      : `<div class="empty"><span class="e-ico">🔍</span>「${esc(certFilter)}」这个类别还没有证书</div>`);
};

function syncCertFormUi() {
  const has = !!certPhotoData;
  $(".cert-photo-clear").hidden = !has;
  $("#cert-photo-hint").textContent = has
    ? "已选照片 约" + Math.round(certPhotoData.length * 3 / 4 / 1024) + "KB"
    : "可选，会压缩后存在本机";
  $(".cert-cancel").hidden = !certEditId;
  $("#cert-submit").textContent = certEditId ? "保存修改" : "收进证书墙";
}

function resetCertForm() {
  certEditId = null;
  certPhotoData = "";
  $("#cert-form").reset();
  $("#cert-date").value = todayStr();
  syncCertFormUi();
}

function compressImage(file, maxW, q) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width);
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.width * scale));
        cv.height = Math.max(1, Math.round(img.height * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL("image/jpeg", q));
      } catch (err) { URL.revokeObjectURL(url); rej(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img load failed")); };
    img.src = url;
  });
}

async function copyTextToClipboard(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

$("#cert-form").addEventListener("submit", e => {
  e.preventDefault();
  fillCertSelects();
  const name = $("#cert-name").value.trim();
  if (!name) { toast("先填证书名称哦"); return; }
  const scoreRaw = parseFloat($("#cert-score").value);
  const data = {
    name: name.slice(0, 80),
    cat: $("#cert-cat").value,
    level: $("#cert-level").value,
    award: $("#cert-award").value,
    date: isDateStr($("#cert-date").value) ? $("#cert-date").value : "",
    issuer: $("#cert-issuer").value.trim().slice(0, 40),
    score: isFinite(scoreRaw) && scoreRaw > 0 ? Math.min(100, Math.round(scoreRaw * 10) / 10) : 0,
    note: $("#cert-note").value.trim().slice(0, 100),
  };
  if (certEditId) {
    const c = state.certs.find(x => x.id === certEditId);
    if (c) {
      Object.assign(c, data, stamp({ photo: certPhotoData || c.photo || "" }));
      toast("已更新证书 ✏️");
    } else toast("这条证书已被删除，没有可更新的");
    certEditId = null;
  } else {
    state.certs.push(sanitizeCert(stamp({ id: uid(), createdAt: now_ts(), ...data, photo: certPhotoData })));
    toast("已收进证书墙 🎖️");
  }
  certPhotoData = "";
  e.target.reset();
  $("#cert-date").value = todayStr();
  syncCertFormUi();
  save(); renderCurrent();
});

$("#cert-photo").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!/^image\//.test(f.type)) { toast("请选择图片文件"); return; }
  try {
    let d = await compressImage(f, 900, 0.62);
    if (d.length > CERT_PHOTO_LIMIT) d = await compressImage(f, 600, 0.5);   // 还超就压更狠
    if (d.length > CERT_PHOTO_LIMIT) { toast("这张照片太大了，存不下；裁小一点再试"); return; }
    certPhotoData = d;
    syncCertFormUi();
  } catch (e2) { toast("这张图片读取失败，换个试试"); }
});

fillCertSelects();

/* —— 机器人悬浮球：可拖动，位置记在本机 —— */
(() => {
  const fab = $(".bot-fab");
  if (!fab) return;
  const FAB_KEY = "hzx-workbench-fab";
  const TABBAR_RESERVE = 74;              // 底部给 tabbar 留的位置
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
  const place = (x, y) => {
    fab.style.left = Math.round(x) + "px";
    fab.style.top = Math.round(y) + "px";
    fab.style.right = "auto";
    fab.style.bottom = "auto";
  };
  const restore = () => {
    try {
      const pos = JSON.parse(localStorage.getItem(FAB_KEY) || "null");
      if (pos && isFinite(pos.x) && isFinite(pos.y)) place(pos.x, pos.y);
    } catch (e) { }
  };
  const clamp = (x, y) => {
    const r = fab.getBoundingClientRect();
    return {
      x: Math.min(Math.max(6, x), Math.max(6, innerWidth - r.width - 6)),
      y: Math.min(Math.max(6, y), Math.max(6, innerHeight - r.height - TABBAR_RESERVE)),
    };
  };
  const start = (x, y) => {
    const r = fab.getBoundingClientRect();
    dragging = true; moved = false;
    sx = x; sy = y; ox = r.left; oy = r.top;
  };
  const move = (x, y) => {
    if (!dragging) return;
    if (!moved && Math.hypot(x - sx, y - sy) > 8) { moved = true; fab.classList.add("dragging"); }
    if (!moved) return;
    const p = clamp(ox + x - sx, oy + y - sy);
    place(p.x, p.y);
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove("dragging");
    if (moved) {
      /* 存布局坐标而非 rect：rect 会被 hover 缩放/旋转变形 */
      try {
        localStorage.setItem(FAB_KEY, JSON.stringify({
          x: parseFloat(fab.style.left) || 0,
          y: parseFloat(fab.style.top) || 0,
        }));
      } catch (e) { }
    }
  };
  fab.addEventListener("touchstart", e => { const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: true });
  fab.addEventListener("touchmove", e => { const t = e.touches[0]; move(t.clientX, t.clientY); if (moved) e.preventDefault(); }, { passive: false });
  fab.addEventListener("touchend", end, { passive: true });
  fab.addEventListener("mousedown", e => start(e.clientX, e.clientY));
  addEventListener("mousemove", e => move(e.clientX, e.clientY));
  addEventListener("mouseup", end);
  /* 拖完松手那一下不当作"点击打开面板" */
  fab.addEventListener("click", e => {
    if (moved) { e.stopImmediatePropagation(); e.preventDefault(); moved = false; }
  }, true);
  addEventListener("resize", () => {
    if (fab.style.left) { const p = clamp(parseFloat(fab.style.left), parseFloat(fab.style.top)); place(p.x, p.y); }
  });
  restore();
})();

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
    : `<p class="hint settings-empty-hint">还没有倒计时，比如「六级笔试」「期末考试周」。</p>`;

  $("#s-links").innerHTML = state.links.length ? state.links.map((l, i) =>
    `<div class="edit-row"><input data-link-name="${i}" placeholder="名称" value="${esc(l.name)}">
      <input data-link-url="${i}" placeholder="网址 https://…" value="${esc(l.url)}">
      <button class="del-mini" data-action="link-del" data-i="${i}">✕</button></div>`).join("")
    : `<p class="hint settings-empty-hint">还没有常用入口，加上教务系统、慕课等网址。</p>`;

  $("#s-habits").innerHTML = state.habits.length ? state.habits.map((h, i) =>
    `<div class="edit-row single"><input data-habit-name="${i}" placeholder="习惯名称，如：背 50 个单词" value="${esc(h.name)}">
      <button class="del-mini" data-action="habit-del" data-i="${i}">✕</button></div>`).join("")
    : `<p class="hint settings-empty-hint">还没有打卡习惯，加一条试试。</p>`;

  renderSyncStatus();
  const syncCard = $(".sync-card");
  const localNote = $("#local-only-note");
  if (syncCard) syncCard.hidden = IS_NATIVE_APP;
  if (localNote) localNote.hidden = !IS_NATIVE_APP;
  const tokenEl = $("#sync-token");
  const saved = getToken();
  if (document.activeElement !== tokenEl) tokenEl.value = saved ? "••••••••（本次会话）" : "";
  $("#sync-gist").value = state.sync.gistId || "";
  setSettingsTab(settingsTab);
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
  customInput.hidden = $("#f-weeks").value !== "custom";
  customInput.value = $("#f-weeks").value === "custom" ? (course?.weeks || "") : "";

  const defColor = course ? course.color % COLOR_N : state.courses.length % COLOR_N;
  $("#f-colors").innerHTML = Array.from({ length: COLOR_N }, (_, i) =>
    `<label><input type="radio" name="f-color" value="${i}" ${i === defColor ? "checked" : ""}>
      <span class="sw-c" data-c="${i}"></span></label>`).join("");

  const style = course?.style || "soft";
  $$('input[name="f-style"]').forEach(input => { input.checked = input.value === style; });

  $("#cm-del").hidden = !course;
  $("#course-modal").hidden = false;
  setTimeout(() => $("#f-name").focus(), 30);
}
function closeCourseModal() { $("#course-modal").hidden = true; editingCourseId = null; }

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function toast(msg, ms = 1800) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.hidden = true, 300); }, ms);
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
    case "save-welcome-name": saveWelcomeName(); break;
    case "skip-welcome-name": dismissWelcomeNameModal(); break;
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
      if (t) {
        t.done = !t.done; t.updatedAt = now_ts(); save();
        if (t.done) t.justDone = true;               // 勾选完成的小动画标记
        renderCurrent();
        delete t.justDone;
      }
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
    case "week-prev": goWeek(-1); break;
    case "week-next": goWeek(1); break;
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
      const changedProfile = state.profile.name !== (name || "同学") || state.profile.semesterStart !== sem || !state.profile.namePrompted;
      state.profile.name = name || "同学";
      state.profile.namePrompted = true;
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

    /* 证书墙 */
    case "cert-del": {
      const c = state.certs.find(x => x.id === el.dataset.id);
      if (!c) break;
      if (!confirm("删除「" + c.name + "」？删除后同步的设备也会删掉")) break;
      state.certs = state.certs.filter(x => x.id !== c.id);
      addTombstone([c.id]);
      if (certEditId === c.id) resetCertForm();
      save(); renderCurrent();
      break;
    }
    case "cert-edit": {
      const c = state.certs.find(x => x.id === el.dataset.id);
      if (!c) break;
      certEditId = c.id;
      certPhotoData = c.photo || "";
      $("#cert-name").value = c.name || "";
      $("#cert-cat").value = c.cat || "其他";
      $("#cert-level").value = c.level || "其他";
      $("#cert-award").value = c.award || "";
      $("#cert-date").value = c.date || "";
      $("#cert-score").value = +c.score || "";
      $("#cert-issuer").value = c.issuer || "";
      $("#cert-note").value = c.note || "";
      syncCertFormUi();
      $(".cert-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
      $("#cert-name").focus();
      break;
    }
    case "cert-edit-cancel": resetCertForm(); break;
    case "cert-filter": certFilter = el.dataset.cat || "all"; renderCurrent(); break;
    case "cert-photo-pick": $("#cert-photo").click(); break;
    case "cert-photo-clear": certPhotoData = ""; syncCertFormUi(); break;
    case "cert-photo-view": {
      const c = state.certs.find(x => x.id === el.dataset.id);
      if (!c || !c.photo) break;
      let ov = $("#cert-photo-overlay");
      if (!ov) {
        ov = document.createElement("div");
        ov.id = "cert-photo-overlay";
        ov.className = "cert-photo-overlay";
        ov.addEventListener("click", () => ov.classList.remove("open"));
        document.body.appendChild(ov);
      }
      ov.innerHTML = `<img src="${esc(c.photo)}" alt="证书照片大图">`;
      ov.classList.add("open");
      break;
    }
    case "cert-copy": {
      const groups = certGroupsSorted();
      const all = [...groups.values()].flat();
      if (!all.length) { toast("还没有证书可导出"); break; }
      const who = state.profile.name && state.profile.name !== "同学" ? state.profile.name + " · " : "";
      const lines = [who + "综测证书清单", ""];
      for (const [y, arr] of groups) {
        const sub = arr.reduce((t, c) => t + (+c.score || 0), 0);
        lines.push(`【${y} 学年】共 ${arr.length} 项，加分合计 ${sub} 分`);
        arr.forEach((c, i) => {
          const parts = [
            c.level && c.level !== "其他" ? c.level : "",
            c.cat && c.cat !== "其他" ? c.cat : "",
            c.award || "",
            `《${c.name}》`,
            c.date || "时间未填",
            c.issuer ? `颁发单位：${c.issuer}` : "",
            +c.score ? `综测加分 ${c.score} 分` : "",
            c.note ? `备注：${c.note}` : "",
          ].filter(Boolean);
          lines.push(`${i + 1}. ${parts.join("，")}`);
        });
        lines.push("");
      }
      copyTextToClipboard(lines.join("\n")).then(ok =>
        toast(ok ? "综测清单已复制，去粘贴吧 📋" : "复制失败，浏览器不支持自动复制"));
      break;
    }

    /* 小助手 */
    case "bot-clear":
      $("#bot-msgs").innerHTML = "";
      botGreet();
      break;
    case "bot-toggle": {
      const panel = $("#bot-panel");
      if (!panel.hidden && botRecording && botRec) {   // 关面板时停止语音
        botRec.onend = () => { botRecording = false; $("#bot-mic").classList.remove("recording"); $("#bot-text").readOnly = false; $("#bot-text").placeholder = "如：明天下午3点交实验报告"; };
        botRec.stop();
      }
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { botGreet(); botStatus("空闲"); updateBotFocusUI(); setTimeout(() => $("#bot-text").focus(), 50); }
      break;
    }
    case "bot-today": botToday(); break;
    case "bot-quick-todo": botQuickTodo(); break;
    case "bot-focus": botFocus(); break;
    case "bot-focus-stop": stopBotFocus(); break;
    case "bot-apply": botApply(el.dataset.id); break;
    case "bot-kind": {
      const p = pendingBot.get(el.dataset.id);
      if (p) { p.kind = el.dataset.k; botRefreshCard(el.dataset.id); }
      break;
    }
    case "set-tab": setSettingsTab(el.dataset.tab); break;

    /* 课表导出日历（.ics，导入手机/电脑系统日历后每次上课系统提醒） */
    case "export-ics": {
      if (!state.courses.length) { toast("课表还是空的，先加课或从教务导入"); break; }
      const escIcs = s => String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
      const start = weekStartDate(1);
      const evs = [];
      state.courses.forEach(c => {
        const set = weekSet(c.weeks);
        const maxW = 25;
        for (let w = 1; w <= maxW; w++) {
          if (set && !set.has(w)) continue;
          const d = addDays(start, (w - 1) * 7 + (c.day - 1));
          const s = state.slots[c.slot] || state.slots[0];
          const dt = t => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${t.replace(":", "")}00`;
          const wkTxt = set ? `（第${w}周）` : "";
          evs.push(`BEGIN:VEVENT\r\nUID:${c.id}-w${w}@workbench\r\nDTSTART:${dt(s.start)}\r\nDTEND:${dt(s.end)}\r\nSUMMARY:${escIcs(c.name)}${wkTxt}\r\nLOCATION:${escIcs(c.room || "")}\r\nDESCRIPTION:${escIcs((c.teacher || "") + " " + (c.sec || ""))}\r\nEND:VEVENT`);
        }
      });
      const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//workbench//CN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:我的课表\r\n` + evs.join("\r\n") + `\r\nEND:VCALENDAR`;
      const blob = new Blob([ics], { type: "text/calendar" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `课表-${state.profile.semesterStart}.ics`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast(`已导出 ${evs.length} 节课到日历文件`);
      break;
    }

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
    style: new FormData($("#course-form")).get("f-style") || "soft",
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
    $("#f-weeks-custom").hidden = e.target.value !== "custom";
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
  else if (!$("#bot-panel").hidden) $("#bot-panel").hidden = true;
  else if (!$("#welcome-modal").hidden) dismissWelcomeNameModal();
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
  el.textContent = msg;
}

/* 单元格 → 纯文本（<br> 与块级标签转行，保留换行结构） */
function cellTextOf(cell) {
  const tmp = document.createElement("div");
  tmp.innerHTML = cell.innerHTML
    .replace(/<br\b[^>]*>/gi, "\n")
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

// EAMS 常把周次写成“(11 9A111)”或“(3-4,6 )”，没有“周”字也必须识别；
// 否则会被误当教室，课程便退化成“每周”。
const WEEK_LINE = /(单周|双周|\d+\s*[-–~]\s*\d+\s*周|\d+\s*周|周.{0,3}\d+|\d{1,2}\s*[,，、]\s*\d+|^[（(]\s*\d{1,2}(?:\s*[-–~]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-–~]\s*\d{1,2})?)*(?=[\s)）]))/;
function roomFromEduWeeksLine(raw) {
  let t = String(raw || "").trim().replace(/^[（(]\s*/, "").replace(/\s*[）)]\s*$/, "").trim();
  t = t.replace(/[（(][^）)]*$/, "").trim();   // "1-14周(双" 这类剥尾括号后的残段

  const prefix = t.match(/^(?:单周|双周|\d{1,2}(?:\s*[-–~]\s*\d{1,2})?(?:\s*[,，、]\s*\d{1,2}(?:\s*[-–~]\s*\d{1,2})?)*)\s*(?:周\s*[单双]?|[单双]\s*周?)?\s*(.*)$/);
  return prefix?.[1]?.trim().replace(/^[;；,，、.。\s]+/, "") || "";
}
function looksTeacherLine(s) {
  const t = s.replace(/^(教师|主讲|老师)[::／/]?\s*/, "").trim()
    .replace(/^[（(]\s*|\s*[）)]$/g, "");
  if (/[场馆楼室厅区]$/.test(t) && t.length <= 8) return false;   // 田径场/体育馆 是教室不是人名
  return /^[\u4e00-\u9fa5·（）()]{2,8}([,，、][\u4e00-\u9fa5·（）()]{2,8})*$/.test(t)
    || /^[A-Za-z][A-Za-z.\s]{2,19}$/.test(t);
}
function looksRoomLine(s) {
  const t = String(s || "").trim();
  if (/^\[[^\]]*\]$/.test(t) || /^(?:第\s*)?\d{1,2}(?:\s*[-–~]\s*\d{1,2})?\s*节$/.test(t)) return false;
  if (/[场馆楼室厅区]$/.test(t) && t.length <= 10) return true;   // 田径场/体育馆/实验楼 这类纯中文场地
  return /\d/.test(t) && t.length <= 18 && !WEEK_LINE.test(t) && !looksTeacherLine(t);
}
/* 一个格子里可能有多门课：按「课程名行」分块 */
function splitBlocks(text) {
  const lines = String(text).split(/\n+/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks = [];
  let cur = [], curHasWeeks = false;
  for (const line of lines) {
    if (/^[-—–]{3,}$/.test(line)) { if (cur.length) blocks.push(cur); cur = []; curHasWeeks = false; continue; }
    const isWeek = WEEK_LINE.test(line) || /^(每周|单周|双周)$/.test(line);
    const isPlace = /[场馆楼室厅区]$/.test(line) && line.length <= 10;   // 田径场/体育馆/实验楼 是教室
    const isMeta = isWeek || looksTeacherLine(line) || looksRoomLine(line) || isPlace;
    if (!isMeta && curHasWeeks && cur.length) { blocks.push(cur); cur = []; curHasWeeks = false; }
    if (isWeek) curHasWeeks = true;
    cur.push(line);
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}
function parseBlock(lines) {
  if (!lines.length) return null;
  // Excel 的课程名行还会带课程号、节次、考核与学时等元数据；名称只保留节次标签之前。
  const name = lines[0].replace(/^【|】$/g, "")
    .replace(/\s*\(\s*\d[\dA-Za-z.]*\s*\)/, "")
    .replace(/\s*\[\s*\d{1,2}\s*[-–~]\s*\d{1,2}\s*节\s*\][\s\S]*$/, "")
    .replace(/\s*[★☆＊*]+\s*$/, "").trim();
  if (!name || name.length > 80) return null;
  let weeks = "all", teacher = "", room = "";
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (weeks === "all" && WEEK_LINE.test(l)) {
      const w = specFromEduText(l);
      if (w) {
        weeks = w;
        const embeddedRoom = roomFromEduWeeksLine(l);
        if (!room && embeddedRoom) room = embeddedRoom;
        continue;
      }
    }
    if (!teacher && looksTeacherLine(l)) {
      teacher = l.replace(/^(教师|主讲|老师)[::／/]?\s*/, "").replace(/^[（(]\s*|\s*[）)]$/g, "").trim();
      continue;
    }
    if (!room && looksRoomLine(l)) { room = l; continue; }
  }
  return { name, weeks, teacher, room };
}

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

/* CSV（引号感知，支持引号内逗号/换行）。教务/WPS 导出的课程表 CSV 是宽表，
   行列结构与 Excel 复制出来的一致，转成 TSV 后复用全部识别管线 */
function parseCSVRows(text) {
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
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  row.push(field);
  if (field || row.length > 1) rows.push(row);
  return rows;
}

function looksLikeCSV(text) {
  if (text.includes("\t")) return false;              // 已是 TSV，走原路
  const rows = parseCSVRows(text).filter(r => r.some(c => c.trim()));
  if (rows.length < 2) return false;
  if (rows.filter(r => r.length >= 5).length < Math.ceil(rows.length * 0.6)) return false;
  return rows.some(r => r.filter(c => dayFromText(c)).length >= 5);   // 必须有星期表头，普通逗号句子不误判
}
const tsvField = v => /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
const csvToTSV = raw => parseCSVRows(raw).map(r => r.map(tsvField).join("\t")).join("\n");

function handleImportRaw(raw, label) {
  if (raw.startsWith("PK")) {
    impStatus(false, "这是真正的 Excel(.xlsx) 二进制文件。请用 Excel 打开 → 全选 → 复制 → 粘贴到上面，或从教务课表网页直接全选复制。");
    return;
  }
  if (raw.slice(0, 2) === "\u00d0\u00cf") {
    impStatus(false, "这是老版 Excel(.xls) 二进制文件。同上：用 Excel 打开后全选复制再粘贴。");
    return;
  }
  const res = /<table|<td|<tr/i.test(raw)
    ? parseImportHTML(raw)
    : raw.includes("\t") ? parseImportTSV(raw)
    : looksLikeCSV(raw) ? parseImportTSV(csvToTSV(raw))
    : null;
  if (!res) { impStatus(false, "内容没认出来：需要包含表格的 HTML、Excel/CSV 表格文本，或直接上传 .xlsx/.csv/.pdf 文件。"); return; }
  if (!res.ok) { impStatus(false, res.msg); return; }
  pendingImport = res.courses;
  impStatus(true, `✅ 从${label}解析出 ${res.courses.length} 门课程。检查预览没问题后点「合并导入」或「替换整个课表」。`);
  renderImportPreview();
}

function renderImportPreview() {
  $("#imp-preview-wrap").hidden = !pendingImport.length;
  if (!pendingImport.length) return;
  $("#imp-count").textContent = `共 ${pendingImport.length} 门`;
  $("#imp-preview").innerHTML = pendingImport.map(c =>
    `<div class="imp-row">
      <i class="imp-dot" data-c="${c.color}"></i>
      <b>${esc(c.name)}</b>
      <span class="muted">周${"一二三四五六日"[c.day - 1]} · ${esc(c.sec)} · ${esc(weeksLabel(c.weeks))}${c.teacher ? " · " + esc(c.teacher) : ""}${c.room ? " · " + esc(c.room) : ""}</span>
      <button class="todo-del faded-delete" data-action="imp-remove" data-id="${c.id}">✕</button>
    </div>`).join("");
}

/* ============================================================
   .xlsx 课表解析（零依赖）：手写 ZIP 解包 + DecompressionStream
   解压 + DOMParser 读 XML，支持教务系统导出的网格课表
   ============================================================ */
async function xlsxInflate(u8) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzipRead(u8, wanted) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  /* 反向找 EOCD；文件数据里可能出现假签名，必须验证中央目录起始处 */
  let eocd = -1, cdStart = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65536); i--) {
    if (dv.getUint32(i, true) !== 0x06054b50) continue;
    const off = dv.getUint32(i + 16, true);
    if (off < u8.length && dv.getUint32(off, true) === 0x02014b50) { eocd = i; cdStart = off; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  const total = dv.getUint16(eocd + 10, true);
  let p = cdStart;
  const out = new Map();
  const dec = new TextDecoder();
  for (let i = 0; i < total && p + 46 <= u8.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;
    if (!wanted.has(name)) continue;
    const lnLen = dv.getUint16(lho + 26, true);
    const leLen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lnLen + leLen;
    const raw = u8.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? raw : await xlsxInflate(raw));
    if (out.size === wanted.size) break;
  }
  return out;
}
function xlsxXmlDom(u8) {
  return new DOMParser().parseFromString(new TextDecoder().decode(u8), "text/xml");
}
function xlsxCellText(c, shared) {
  const t = c.getAttribute("t");
  if (t === "inlineStr") {
    return [...c.querySelectorAll("is > t")].map(x => x.textContent).join("");
  }
  const v = c.querySelector("v");
  if (!v) return "";
  if (t === "s") return shared[+v.textContent] ?? "";
  return v.textContent;
}
const xlsxColIdx = ref => {
  let n = 0;
  for (const ch of ref) {
    if (ch >= "A" && ch <= "Z") n = n * 26 + (ch.charCodeAt(0) - 64);
    else break;
  }
  return n - 1;   // 0-based
};
/* 从课程格文本中挑出课程名：名字折行时按括号平衡拼接；跳过字段行 */
function xlsxPickName(text) {
  const lines = String(text).split(/\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const isField = l => /场地[:：]|教师[:：]|教学班|考核方式|学时|学分|选课备?注|课程学时|周学时|上课时间|^\/|^[(（]\s*\d{1,2}/.test(l);
  if (isField(lines[0])) return "";              // 首行就是字段行 → 无课程名（碎片格），跳过
  const bal = t => (t.match(/[\[［（(]/g) || []).length - (t.match(/[\]］）)]/g) || []).length;
  let name = lines[0].replace(/[★☆＊*]+\s*$/, "");
  for (let i = 1; i < Math.min(lines.length, 4); i++) {
    if (bal(name) <= 0) break;                    // 名字已完整（括号闭合）
    if (isField(lines[i])) break;
    name += lines[i].replace(/[★☆＊*]+\s*$/, "");
  }
  name = name.replace(/[★☆＊*]+\s*$/, "").replace(/\s*[\[［][^\]］]*节[^\]］]*[\]］]\s*$/g, "").trim();
  return name.length >= 2 && name.length <= 30 ? name : "";
}

/* —— 共享：从课程格文本提取字段（xlsx / PDF 通用）—— */
function extractCourseCellFields(text, fbSecA = 0, fbSecB = 0) {
  const joined = String(text).replace(/\n+/g, "");
  let secA = 0, secB = 0;
  const secM = joined.match(/[(（]\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*节[)）]/) || joined.match(/第?\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*节/);
  if (secM) { secA = +secM[1]; secB = +secM[2]; }
  else if (fbSecA) { secA = fbSecA; secB = fbSecB || fbSecA; }
  const weeksM = joined.match(/第?\s*(?:\d{1,2}\s*[-–~]\s*\d{1,2}|\d{1,2})\s*周?\s*(?:[，,、]\s*第?\s*(?:\d{1,2}\s*[-–~]\s*\d{1,2}|\d{1,2})\s*周?\s*)*周/);
  let weeks = "";
  if (weeksM) {
    const toks = weeksM[0].match(/\d{1,2}\s*[-–~]\s*\d{1,2}|\d{1,2}/g) || [];
    weeks = toks.join(",").replace(/\s+/g, "");
    /* "1-14周(双)"/"1-14周单" 这类尾部单双周标记：不能丢掉数字区间 */
    if (/^\d/.test(weeks)) {
      const tail = joined.slice(joined.indexOf(weeksM[0]) + weeksM[0].length, joined.indexOf(weeksM[0]) + weeksM[0].length + 6);
      const sd = tail.match(/^[（(]?\s*(单|双)/);
      if (sd) weeks += sd[1];
    }
  }
  else if (/单周/.test(joined)) weeks = "odd";
  else if (/双周/.test(joined)) weeks = "even";
  let room = (joined.match(/(?:场地|地点|教室)[:：]\s*([^\/\n（(]+)/) || [])[1]?.trim() || "";
  if (!room) {
    const m = joined.match(/[（(][^（）;；]*周[^（）;；]*[;；]([^）()]*)[)）]/);   // (1-17周;教3-201) 形式的后半段
    if (m) room = m[1].trim();
  }
  let teacher = (joined.match(/教师[:：]\s*([^\/\n（(]+)/) || [])[1]?.trim() || "";
  if (!teacher) {
    const lines = String(text).split(/\n/).map(l => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 1; i--) {          // 独立成行的裸姓名，如 (张文丽)；跳过名字行
      const m = lines[i].match(/^[（(]([\u4e00-\u9fa5·]{2,5})[)）]$/);
      if (m) { teacher = m[1]; break; }
    }
  }
  let name = xlsxPickName(text);
  name = name.replace(/\s*[\[［][^\]］]*节[^\]］]*[\]］]\s*$/g, "").trim();   // 去掉挂在名字上的 [1-2节]
  return { name, weeks, teacher, room, secA, secB };
}
function buildCoursesFromEntries(entries) {
  entries.sort((x, y) => x.day - y.day || x.secA - y.secA);
  const list = [];
  const seenKey = new Set();
  for (const c of entries) {
    const key = [c.name, c.day, c.weeks, c.teacher, c.room].join("|");
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    const prev = list[list.length - 1];
    if (prev && prev.name === c.name && prev.day === c.day && prev.weeks === c.weeks
      && prev.teacher === c.teacher && prev.room === c.room && c.secA <= prev.secB + 1) {
      prev.secB = Math.max(prev.secB, c.secB);
      continue;
    }
    list.push({ ...c });
  }
  return list.map(c => ({
    id: uid(), name: c.name, teacher: c.teacher, room: c.room,
    day: c.day, slot: slotOf(c.secA), sec: secLabel(c.secA, c.secB),
    weeks: c.weeks, color: importColor(c.name),
  }));
}

async function parseXlsxBuffer(u8) {
  if (typeof DecompressionStream === "undefined")
    return { ok: false, msg: "这个浏览器版本太旧，不支持解压 .xlsx。请把 Excel 打开后全选复制，粘贴到上面。" };
  const files = await unzipRead(u8, new Set(["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"]));
  if (!files.has("xl/workbook.xml")) return { ok: false, msg: "不是有效的 .xlsx 课表文件。" };

  /* 找第一个工作表的路径（rels 里解析 r:id → target） */
  const wb = xlsxXmlDom(files.get("xl/workbook.xml"));
  const firstSheet = wb.querySelector("sheets > sheet");
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (firstSheet && files.has("xl/_rels/workbook.xml.rels")) {
    const rid = firstSheet.getAttribute("r:id");
    const rels = xlsxXmlDom(files.get("xl/_rels/workbook.xml.rels"));
    for (const rel of rels.querySelectorAll("Relationship")) {
      if (rel.getAttribute("Id") === rid) {
        const tgt = rel.getAttribute("Target").replace(/^\//, "");
        sheetPath = tgt.startsWith("xl/") ? tgt : "xl/" + tgt;
        break;
      }
    }
  }
  const sheetRaw = await unzipRead(u8, new Set([sheetPath]));
  if (!sheetRaw.has(sheetPath)) return { ok: false, msg: "工作表读取失败。" };

  const shared = [...xlsxXmlDom(files.get("xl/sharedStrings.xml") || new TextEncoder().encode("<r/>")).querySelectorAll("si")]
    .map(si => [...si.querySelectorAll("t")].map(t => t.textContent).join(""));
  const sh = xlsxXmlDom(sheetRaw.get(sheetPath));

  /* 原始单元格表 + 合并格展开 */
  const cellMap = new Map();       // "r,c" -> {text, spanR, origin}
  for (const c of sh.querySelectorAll("c")) {
    const ref = c.getAttribute("r") || "";
    const row = (+ref.match(/\d+/)?.[0] || 1) - 1;
    const col = xlsxColIdx(ref);
    const txt = xlsxCellText(c, shared).replace(/\r/g, "");
    if (txt.trim()) cellMap.set(row + "," + col, { text: txt, spanR: 1, origin: true });
  }
  for (const mc of sh.querySelectorAll("mergeCell")) {
    const [a, b] = (mc.getAttribute("ref") || "").split(":");
    if (!a || !b) continue;
    const r1 = (+a.match(/\d+/)[0]) - 1, c1 = xlsxColIdx(a);
    const r2 = (+b.match(/\d+/)[0]) - 1, c2 = xlsxColIdx(b);
    const o = cellMap.get(r1 + "," + c1) || { text: "", spanR: 1, origin: true };
    o.spanR = Math.max(o.spanR, r2 - r1 + 1);
    cellMap.set(r1 + "," + c1, o);
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        if (!(r === r1 && c === c1)) cellMap.set(r + "," + c, { text: o.text, spanR: 1, origin: false });
  }
  const cellAt = (r, c) => cellMap.get(r + "," + c);
  const maxRow = Math.max(0, ...[...cellMap.keys()].map(k => +k.split(",")[0]));
  const maxCol = Math.max(0, ...[...cellMap.keys()].map(k => +k.split(",")[1]));

  /* 表头行：≥5 个“星期X”格；同时找“节次”列 */
  let headRow = -1, secCol = -1;
  const colDay = new Map();
  for (let r = 0; r <= maxRow && headRow < 0; r++) {
    let hits = 0;
    for (let c = 0; c <= maxCol; c++) {
      const t = (cellAt(r, c)?.text || "").trim();
      const d = dayFromText(t);
      if (d) { colDay.set(c, d); hits++; }
      if (/节次|节\/次/.test(t)) secCol = c;
    }
    if (hits >= 5) headRow = r;
  }
  if (headRow < 0 || !colDay.size)
    return { ok: false, msg: "表里没找到「星期一~星期日」表头，无法对齐到周几。请确认是课表格式的 xlsx。" };

  /* 逐格解析课程（origin 格才有正文） */
  const entries = [];
  for (let r = headRow + 1; r <= maxRow; r++) {
    const secCell = secCol >= 0 ? (cellAt(r, secCol)?.text || "") : "";
    const secNum = parseFloat(secCell);
    for (const [c, day] of colDay) {
      const cell = cellAt(r, c);
      if (!cell || !cell.origin || !cell.text.trim()) continue;
      const spanSecB = !isNaN(secNum) ? Math.round(secNum) + cell.spanR - 1 : 0;
      const f = extractCourseCellFields(cell.text, isNaN(secNum) ? 0 : Math.round(secNum), spanSecB);
      if (!f.name || !f.weeks || !f.secA) continue;   // 没名字/周次/节次的当无效格，防止噪音
      entries.push({ day, secA: f.secA, secB: f.secB, name: f.name, weeks: f.weeks, teacher: f.teacher, room: f.room });
    }
  }
  const courses = buildCoursesFromEntries(entries);
  if (!courses.length)
    return { ok: false, msg: "找到表头但没解析出课程。可用 Excel 打开后全选复制，粘贴到上面试试。" };
  return { ok: true, courses };
}

/* ============================================================
   PDF 课表解析：pdf.js 提取文本项坐标 → 重建表格网格 →
   复用 xlsx 的字段提取器（课程名/周次/节次/场地/教师，含周六日）
   ============================================================ */
async function parsePdfBuffer(u8) {
  if (typeof pdfjsLib === "undefined")
    return { ok: false, msg: "PDF 组件未加载（离线首刷未完成？）。刷新一次页面再试。" };
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: u8, isEvalSupported: false }).promise;
    const items = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width || 0, h: it.height || 10 });
      }
    }
    if (!items.length) return { ok: false, msg: "这个 PDF 里没有文字层（可能是扫描件）。请用文字版课表。" };

    /* —— 视觉行聚类：按 y 分组（容差 = 中位字高 × 0.6） —— */
    const heights = items.map(i => i.h).sort((a, b) => a - b);
    const medH = heights[Math.floor(heights.length / 2)] || 10;
    const rowTol = medH * 0.6;
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const visRows = [];                    // [{y, chars:[{ch,x,w}]}]
    for (const it of items) {
      const row = visRows.find(r => Math.abs(r.y - it.y) <= rowTol);
      if (row) row.items.push(it);
      else visRows.push({ y: it.y, items: [it] });
    }
    visRows.sort((a, b) => b.y - a.y);
    /* 每行展开成字符流（记录每个字的 x 区间），拼接时按字距补空格 */
    for (const r of visRows) {
      r.items.sort((a, b) => a.x - b.x);
      r.chars = [];
      for (const it of r.items) {
        const cw = Math.min((it.w || it.str.length * medH) / it.str.length, medH * 1.05);   // item.width 尺度不可信，钳到字高附近
        for (let i = 0; i < it.str.length; i++) {
          const x0 = it.x + i * cw;
          const prev = r.chars[r.chars.length - 1];
          const gap = prev ? x0 - prev.xEnd : 0;
          const needSpace = prev && gap > medH * 0.25 && /[A-Za-z0-9,.:;()%]$/.test(prev.ch) && /^[A-Za-z0-9(]/.test(it.str[i]);
          if (needSpace) r.chars.push({ ch: " ", x: x0 - gap, xEnd: prev.xEnd + 0.01 });   // 空格不占几何宽，避免桥接切段间隙
          r.chars.push({ ch: it.str[i], x: x0, xEnd: x0 + cw });
        }
      }
      r.text = r.chars.map(c => c.ch).join("");
    }

    /* —— 表头：行文本含 ≥4 个「星期X」；列带 = 相邻表头中心的中线（数据段按段中心归属） —— */
    let headRow = null, dayBands = [], secBand = null;
    for (const r of visRows) {
      const hits = [...r.text.matchAll(/星期\s*[一二三四五六日天]/g)].map(m => {
        const c0 = r.chars[m.index], c1 = r.chars[m.index + m[0].length - 1];
        return { d: dayFromText(m[0]), left: c0.x, right: c1.xEnd, cx: (c0.x + c1.xEnd) / 2 };
      });
      if (hits.length < 4) continue;
      hits.sort((a, b) => a.cx - b.cx);
      const medGap = (hits[hits.length - 1].cx - hits[0].cx) / (hits.length - 1);
      for (let i = 0; i < hits.length; i++) {
        dayBands.push({
          day: hits[i].d,
          left: i === 0 ? hits[0].cx - medGap / 2 : (hits[i - 1].cx + hits[i].cx) / 2,
          right: i === hits.length - 1 ? Infinity : (hits[i].cx + hits[i + 1].cx) / 2,
        });
      }
      secBand = { left: 0, right: dayBands[0].left };
      headRow = r;
      break;
    }
    if (!headRow || !dayBands.length)
      return { ok: false, msg: "PDF 里没找到「星期一~星期日」表头。请确认是教务导出的课表 PDF。" };

    /* —— 逐视觉行：按字距切成原子片段（段中心落哪个表头带就整体归哪列，绝不拆段） —— */
    const entries = [];
    const acc = dayBands.map(() => null);   // 每列带一个正在积累的格 {text, secHint}
    const lastEntry = dayBands.map(() => null);
    const flushBand = bi => {
      const a = acc[bi];
      if (!a) return;
      const f = extractCourseCellFields(a.text, a.secHint, a.secHint);
      if (window.__PDF_DEBUG__) console.log('[pdf flush]', '周' + dayBands[bi].day, JSON.stringify(a.text.slice(0, 55)), '→ name:', JSON.stringify(f.name), 'weeks:', f.weeks, 'secA:', f.secA);
      if (f.name && f.weeks && f.secA) {
        const entry = { day: dayBands[bi].day, secA: f.secA, secB: f.secB, name: f.name, weeks: f.weeks, teacher: f.teacher, room: f.room, text: a.text };
        entries.push(entry);
        lastEntry[bi] = entry;
      } else if (lastEntry[bi]) {
        const tm = a.text.trim().match(/^[（(]([\u4e00-\u9fa5·]{2,5})[)）]$/);   // 掉队的裸教师行
        if (tm && !lastEntry[bi].teacher) lastEntry[bi].teacher = tm[1];
      }
      acc[bi] = null;
    };
    for (const r of visRows) {
      if (r === headRow) continue;
      if (r.y > headRow.y) continue;                 // 只处理表头之后的数据行（跳过标题等）
      /* 行内切段：间隙 > 半字高即分界（段 = 格子文字片段，原子分配） */
      const segs = [];
      let cur = null;
      for (const c of r.chars) {
        if (cur && c.x - cur.xEnd > medH * 0.5) { segs.push(cur); cur = null; }
        if (!cur) cur = { text: "", left: c.x, xEnd: c.xEnd };
        cur.text += c.ch;
        cur.xEnd = Math.max(cur.xEnd, c.xEnd);
      }
      if (cur) segs.push(cur);
      for (const s of segs) s.cx = (s.left + s.xEnd) / 2;

      const secSegs = segs.filter(s => s.left < secBand.right);
      const secJoin = secSegs.map(s => s.text).join(" ");
      const rowSecNo = secNoFromText(secJoin.trim())?.a || (parseFloat(secJoin) ? Math.round(parseFloat(secJoin)) : 0);
      dayBands.forEach((b, bi) => {
        const text = segs.filter(s => s.cx >= b.left && s.cx < b.right && s.left >= secBand.right - 0.1).map(s => s.text).join(" ").trim();
        if (!text) { flushBand(bi); return; }               // 该带空行 = 格边界
        const secNo = rowSecNo || 0;
        if (acc[bi] && secNo && acc[bi].secHint && secNo > acc[bi].secHint + 1) flushBand(bi);  // 节次跳号 = 新格
        if (!acc[bi]) acc[bi] = { text, secHint: secNo || 0 };
        else { acc[bi].text += "\n" + text; if (secNo && !acc[bi].secHint) acc[bi].secHint = secNo; }
      });
    }
    for (let bi = 0; bi < dayBands.length; bi++) flushBand(bi);
    const courses = buildCoursesFromEntries(entries);
    if (!courses.length)
      return { ok: false, msg: "PDF 里找到了表头但没解析出课程。把这个 PDF 发给开发者看看吧。" };
    return { ok: true, courses };
  } catch (e) {
    console.warn("pdf parse failed:", e);
    return { ok: false, msg: "PDF 解析失败：文件可能损坏或加密。" };
  }
}

async function readImportFile(f) {
  const buf = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(f);
  });
  const u8 = new Uint8Array(buf);
  if (u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {   // %PDF
    const res = await parsePdfBuffer(u8);
    if (!res.ok) { impStatus(false, res.msg); return; }
    pendingImport = res.courses;
    impStatus(true, `✅ 从「${f.name}」解析出 <b>${res.courses.length} 门课程</b>。检查预览没问题后点「合并导入」或「替换整个课表」。`);
    renderImportPreview();
    return;
  }
  if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b) {            // PK → zip（xlsx）
    try {
      const res = await parseXlsxBuffer(u8);
      if (!res.ok) { impStatus(false, res.msg); return; }
      pendingImport = res.courses;
      impStatus(true, `✅ 从「${f.name}」解析出 <b>${res.courses.length} 门课程</b>。检查预览没问题后点「合并导入」或「替换整个课表」。`);
      renderImportPreview();
    } catch (e) {
      console.warn("xlsx parse failed:", e);
      impStatus(false, "这个 .xlsx 解析失败：文件可能损坏或加密。可用 Excel 打开 → 全选 → 复制 → 粘贴到上面。");
    }
    return;
  }
  if (u8.length > 4 && u8[0] === 0xD0 && u8[1] === 0xCF) {            // 老版 .xls 二进制
    impStatus(false, "这是老版 Excel(.xls) 格式。请用 Excel/WPS 打开后「另存为 .xlsx」，或全选复制粘贴到上面。");
    return;
  }
  let s = new TextDecoder("utf-8").decode(u8);
  if (s.includes("\uFFFD")) s = new TextDecoder("gbk").decode(u8);    // utf-8 乱码 → GBK（国内教务常见）
  handleImportRaw(s, `文件「${f.name}」`);
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
  else impStatus(false, "粘贴内容里没有表格。请在教务系统课表页面 Ctrl+A 全选后再复制，或从 Excel 全选复制。");
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
   小助手：自然语言速记（本地规则解析，离线可用）
   支持：待办（默认）/ 临时课程（节次+周几）/ 倒计时（日期）
   ============================================================ */
const dstrOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pendingBot = new Map();   // 待确认卡片
let botSeq = 0;
let botFocusState = "idle";
let botFocusRemaining = 25 * 60;
let botFocusTimer = null;

function botStatus(text) {
  const el = $("#bot-status");
  if (el) el.textContent = text;
}

function focusClockText(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${pad(mins)}:${pad(secs)}`;
}

function updateBotFocusUI() {
  const stateEl = $("#bot-focus-state");
  const button = $("#bot-focus");
  if (!stateEl || !button) return;
  const label = $("b", button);
  const hint = $("small", button);
  const stop = $("#bot-focus-stop");
  if (botFocusState === "idle") {
    stateEl.hidden = true;
    if (label) label.textContent = "开始专注";
    if (hint) hint.textContent = "25 分钟";
    if (stop) stop.hidden = true;
    return;
  }
  stateEl.hidden = false;
  stateEl.textContent = botFocusState === "done"
    ? "专注完成 · 做得很好"
    : `${botFocusState === "paused" ? "已暂停" : "专注中"} ${focusClockText(botFocusRemaining)}`;
  if (label) label.textContent = botFocusState === "running" ? "暂停专注" : botFocusState === "paused" ? "继续专注" : "再来一轮";
  if (hint) hint.textContent = botFocusState === "done" ? "25 分钟" : "点击切换";
  if (stop) stop.hidden = botFocusState === "done";
}

function clearBotFocusTimer() {
  if (botFocusTimer) { clearInterval(botFocusTimer); botFocusTimer = null; }
}

function finishBotFocus() {
  clearBotFocusTimer();
  botFocusRemaining = 0;
  botFocusState = "done";
  botStatus("空闲");
  updateBotFocusUI();
  botSay("🎉 25 分钟专注完成，起来喝口水吧！");
}

function startBotFocusTimer() {
  clearBotFocusTimer();
  botFocusTimer = setInterval(() => {
    if (botFocusState !== "running") return;
    botFocusRemaining -= 1;
    if (botFocusRemaining <= 0) finishBotFocus();
    else updateBotFocusUI();
  }, 1000);
}

function botFocus() {
  if (botFocusState === "idle" || botFocusState === "done") {
    botFocusRemaining = 25 * 60;
    botFocusState = "running";
    botStatus("专注中");
    startBotFocusTimer();
    botSay("⏱️ 专注开始，接下来 25 分钟只做这一件事。");
  } else if (botFocusState === "running") {
    botFocusState = "paused";
    clearBotFocusTimer();
    botStatus("空闲");
    botSay("⏸️ 已暂停，准备好后再点“继续专注”。");
  } else if (botFocusState === "paused") {
    botFocusState = "running";
    botStatus("专注中");
    startBotFocusTimer();
    botSay("▶️ 继续专注，加油！");
  }
  updateBotFocusUI();
}

function stopBotFocus() {
  if (botFocusState === "idle") return;
  clearBotFocusTimer();
  botFocusState = "idle";
  botFocusRemaining = 25 * 60;
  botStatus("空闲");
  updateBotFocusUI();
  botSay("已结束本轮专注，下次准备好再开始。");
}

function botToday() {
  const list = todayCourses();
  botStatus("执行中");
  if (!list.length) {
    botSay("🌤️ 今天没有排课，适合安排一点自己的事。");
    botStatus("空闲");
    return;
  }
  const rows = list.map(c => {
    const s = state.slots[c.slot];
    return `<div class="bot-schedule-row"><b>${esc(c.name)}</b><span>${s.start}–${s.end} · ${esc(c.room ? "教室：" + c.room : "教室待定")}</span></div>`;
  }).join("");
  botSay(`<b>今天的 ${list.length} 节课</b>${rows}`);
  botStatus("空闲");
}

function botQuickTodo() {
  const input = $("#bot-text");
  if (!input) return;
  input.placeholder = "快速记一条待办…";
  input.focus();
  botStatus("执行中");
  botSay("📝 写下要做的事，按发送后我会先帮你确认内容。");
  botStatus("空闲");
}

function parseIntent(raw) {
  let t = ' ' + raw.trim() + ' ';
  t = t.replace(/[０-９Ａ-Ｚａ-ｚ：]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));   // 全角→半角
  const cnNum2 = s => {           // 汉字数字（一~三十九）
    if (/^\d+$/.test(s)) return +s;
    const D = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    if (s.startsWith('十')) return 10 + (D[s[1]] || 0);
    if (s.includes('十')) { const p = s.split('十'); return (D[p[0]] || 1) * 10 + (D[p[1]] || 0); }
    return D[s] || 0;
  };
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = { kind: 'todo', title: '', due: '', time: '', priority: 2, day: 0, secA: 0, secB: 0, weeks: '', room: '', raw: raw.trim() };

  if (/重要|紧急|必须|优先/.test(t)) out.priority = 3;

  /* 相对日期（明晚/今晚 额外标记晚上语境，供时间推算） */
  for (const [w, off] of [['大后天', 3], ['后天', 2], ['明晚', 1], ['明天', 1], ['明日', 1], ['今晚', 0], ['今天', 0], ['今日', 0]]) {
    if (t.includes(w)) {
      out.date = addDays(today0, off);
      if (w.includes('晚')) out.pmHint = true;
      t = t.split(w).join(' '); break;
    }
  }
  /* 周X / 下周X */
  if (!out.date) {
    const m = t.match(/(下个?|下)?\s*(?:周|礼拜|星期)([一二三四五六日天])/);
    if (m) {
      let d = addDays(mondayOf(now), '一二三四五六日天'.indexOf(m[2]));
      if (m[1] || d < today0) d = addDays(d, 7);
      out.date = d; t = t.replace(m[0], ' ');
    }
  }
  /* X月X日/X号（半角、全角、汉字数字都支持） */
  if (!out.date) {
    const md = t.match(/(\d{1,2}|[一二三四五六七八九十]{1,3})月\s*(\d{1,2}|[一二三四五六七八九十]{1,3})[日号]/);
    if (md) {
      const mo = cnNum2(md[1]), dd = cnNum2(md[2]);
      if (mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31) {
        let d = new Date(now.getFullYear(), mo - 1, dd);
        if (d < today0) d = new Date(now.getFullYear() + 1, mo - 1, dd);
        out.date = d; t = t.replace(md[0], ' ');
      }
    }
  }
  /* 时间范围：X点到Y点 */
  const range = t.match(/(上午|早上|中午|下午|晚上|傍晚)?\s*(\d{1,2})[点:：]\s*(半|\d{1,2})?\s*分?\s*(?:到|至|~|－|—)\s*(上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})[点:：]\s*(半|\d{1,2})?\s*分?/);
  if (range) {
    const adj1 = /上午|早上|中午/.test(range[1] || '');
    const adj2 = /上午|早上|中午/.test(range[4] || '');
    let h1 = +range[2] + (!adj1 && (out.pmHint || /下午|晚上|傍晚/.test(range[1] || '')) && +range[2] < 12 ? 12 : 0);
    let h2 = +range[5] + (!adj2 && (out.pmHint || /下午|晚上|傍晚/.test(range[4] || '')) && +range[5] < 12 ? 12 : 0);
    const m1 = range[3] === '半' ? 30 : (+range[3] || 0);
    const m2 = range[6] === '半' ? 30 : (+range[6] || 0);
    if (h1 <= 23 && h2 <= 23) { out.time = `${pad(h1)}:${pad(m1)}-${pad(h2)}:${pad(m2)}`; t = t.replace(range[0], ' '); }
  }
  /* 时间点 */
  if (!out.time) {
    const tm = t.match(/(上午|早上|中午|下午|傍晚|晚上|夜里)?\s*(\d{1,2})[点时:：]\s*(半|\d{1,2})?\s*分?/);
    if (tm) {
      let h = +tm[2];
      const isAm = /上午|早上|中午/.test(tm[1] || '');
      if (!isAm && (out.pmHint || /下午|傍晚|晚上|夜里/.test(tm[1] || '')) && h < 12) h += 12;
      if (h <= 23) {
        const mm = tm[3] === '半' ? 30 : (+tm[3] || 0);
        out.time = `${pad(h)}:${pad(mm)}`;
        t = t.replace(tm[0], ' ');
      }
    }
  }
  /* 节次 */
  const sec = t.match(/第?\s*(1[01]|[1-9])\s*[-–~到]\s*(1[01]|[1-9])?\s*节/);
  if (sec) { out.secA = +sec[1]; out.secB = +(sec[2] || sec[1]); t = t.replace(sec[0], ' '); }
  /* 周次：第X周 / X-Y周 / 单周 / 双周 */
  const wk = t.match(/第?(\d{1,2})(?:\s*[-–~]\s*(\d{1,2}))?\s*周/);
  if (wk) { out.weeks = wk[2] ? `${wk[1]}-${wk[2]}` : wk[1]; t = t.replace(wk[0], ' '); }
  else if (/单周/.test(t)) { out.weeks = 'odd'; t = t.replace('单周', ' '); }
  else if (/双周/.test(t)) { out.weeks = 'even'; t = t.replace('双周', ' '); }
  /* 教室：支持 9A101、9A101/9A611、教三-301、XX实验室 组1 */
  const rm = t.match(/(\d{0,2}[A-Z]\d{3}(?:\s*\/\s*\d{0,2}[A-Z]\d{3})*)|((?:教[一二三四五六七八九十\d]|外语楼|实验楼)\S{0,8})|(\S{2,14}实验室(?:\s*组\d)?)/);
  if (rm) { out.room = rm[0].trim(); t = t.replace(rm[0], ' '); }

  /* 意图判定：节次/补课调课等强信号，或“提到周几+课名带课字” */
  const courseNoun = /课(?!程|表|时|代表|间)/.test(t);
  const courseHint = out.secA > 0 || /补课|调课|加课|换课|蹭课|上课/.test(t) || (out.date && courseNoun);
  if (courseHint) out.kind = 'course';
  else if (out.date && /倒计时|距离|还有几天|考试|测验|竞赛|四六级|期末|期中|月考|模拟考|截止|报名|放假|开学/.test(raw)) out.kind = 'countdown';

  /* 标题清洗 */
  let title = t.replace(/\s+/g, ' ').trim();
  title = title.replace(/^(帮我|麻烦你?|辛苦|记一下|记录下?|添加|加一?个?|提醒我|我要|我需要|安排一?下?)\s*/g, '');
  title = title.replace(/^(一?个?)(待办|任务|事情|事项|课程|课)[：:、，,]*/g, '').trim();
  if (out.kind === 'countdown') title = title.replace(/^(倒计时|距离|记个?|考试?|测试?)[:：]?\s*/g, '').replace(/还有.*$/, '').trim();
  if (out.kind === 'todo' && out.time) title = `${out.time} ${title}`;
  out.title = title || (out.kind === 'course' ? '补课' : out.kind === 'countdown' ? '倒计时' : '待办');
  if (out.kind === 'course') {
    out.day = out.date ? (out.date.getDay() === 0 ? 7 : out.date.getDay()) : 0;
    if (out.weeks === 'odd') out.weeks = 'odd';
    else if (out.weeks === 'even') out.weeks = 'even';
    /* 说了具体日期（如 9月5日）→ 只在日期所在的那一周显示（单次课） */
    if (out.date && !out.weeks) {
      const w = weekOf(dstrOf(out.date));
      if (w >= 1 && w <= 25) out.weeks = String(w);
      else if (w < 1) out.dateBeforeTerm = true;
    }
  }
  if (out.kind === 'todo' && out.date) out.due = dstrOf(out.date);
  if (out.kind === 'countdown') out.due = out.date ? dstrOf(out.date) : '';
  return out;
}

function botSay(html, isUser = false) {
  const box = $("#bot-msgs");
  const div = document.createElement('div');
  div.className = 'bot-msg ' + (isUser ? 'user' : 'bot');
  div.innerHTML = html;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function botGreet() {
  if ($("#bot-msgs").children.length) return;
  botSay('你好呀！先点上面的快捷指令，或者跟我说一句话，我帮你记下来。比如：<br>' +
    '· <b>明天下午3点交实验报告</b><br>' +
    '· <b>周三1-2节补课 高数 9A101</b>（加进课表）<br>' +
    '· <b>倒计时 12月19日 四六级</b><br>' +
    '· <b>后天买教材 重要</b>');
}

function botCardHTML(p, id) {
  const kindTabs = ['todo', 'course', 'countdown'].map(k =>
    `<button class="bot-kind${p.kind === k ? ' on' : ''}" data-action="bot-kind" data-id="${id}" data-k="${k}">${{ todo: '待办', course: '课程', countdown: '倒计时' }[k]}</button>`).join('');
  const priName = { 3: '高优先', 2: '中优先', 1: '低优先' }[p.priority] || '中优先';
  let body = '';
  if (p.kind === 'todo') {
    body = `「${esc(p.title)}」<br>截止：${p.due ? esc(p.due) : '不限'}${p.time ? ' · ' + esc(p.time) : ''} · ${priName}`;
  } else if (p.kind === 'course') {
    if (!p.day) {
      body = `「${esc(p.title)}」<br><span class="bot-warning">没听清日子——带上「周几」（如 周三1-2节）或「X月X日」（如 9月5日1-2节）再发一次</span>`;
    } else {
      const slot = Math.max(0, Math.min(4, Math.ceil((p.secA || 1) / 2) - 1));
      p.slot = slot; p.secA = p.secA || 1; p.secB = p.secB || p.secA + 1;
      p.weeksNorm = p.weeks === 'odd' ? 'odd' : p.weeks === 'even' ? 'even' : (p.weeks || 'all');
      body = `「${esc(p.title)}」<br>周${'一二三四五六日'[p.day - 1]} · ${esc(state.slots[p.slot].label)}（${state.slots[p.slot].start}）· ${p.weeksNorm === 'all' ? '每周' : esc(weeksLabel(p.weeksNorm))}${p.room ? ' · ' + esc(p.room) : ''}`;
    }
  } else {
    body = `「${esc(p.title)}」· ${p.due ? esc(p.due) : '<span class="bot-warning">还差日期，带上「X月X日」再发一次</span>'}`;
  }
  const canApply = !(p.kind === 'course' && !p.day);
  return `<div class="bot-kinds">${kindTabs}</div>识别到 → <b>${{ todo: '待办', course: '课程', countdown: '倒计时' }[p.kind]}</b><br>${body}
    <br><button class="btn btn-primary btn-sm" data-action="bot-apply" data-id="${id}" ${canApply ? '' : 'disabled'}>✓ 确认添加</button>`;
}

function botHandle(raw) {
  botSay(esc(raw), true);
  const p = parseIntent(raw);
  const id = 'bot' + ++botSeq;
  pendingBot.set(id, p);
  const div = document.createElement('div');
  div.className = 'bot-msg bot';
  div.innerHTML = botCardHTML(p, id);
  div.dataset.cardId = id;
  const box = $("#bot-msgs");
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function botRefreshCard(id) {
  const p = pendingBot.get(id);
  const div = $(`#bot-msgs [data-card-id="${id}"]`);
  if (p && div) div.innerHTML = botCardHTML(p, id);
}

function botApply(id) {
  const p = pendingBot.get(id);
  if (!p) return;
  pendingBot.delete(id);
  let doneMsg = '';
  if (p.kind === 'todo') {
    state.todos.push(stamp({ id: uid(), text: p.title, done: false, priority: p.priority, due: p.due, createdAt: Date.now() }));
    doneMsg = `✅ 已添加待办「${esc(p.title)}」${p.due ? '（' + esc(p.due) + '）' : ''}，电脑手机都会同步`;
  } else if (p.kind === 'course') {
    state.courses.push(stamp({
      id: uid(), name: p.title, teacher: '', room: p.room,
      day: p.day, slot: p.slot, sec: `第${p.secA}-${p.secB}节`,
      weeks: p.weeksNorm || 'all', color: importColor(p.title),
    }));
    doneMsg = `✅ 已加进课表：「${esc(p.title)}」 周${'一二三四五六日'[p.day - 1]}${esc(p.sec)}${p.weeksNorm && p.weeksNorm !== 'all' ? '（' + esc(weeksLabel(p.weeksNorm)) + '）' : ''}。去课程表页看看吧`;
  } else {
    state.countdowns.push(stamp({ id: uid(), name: p.title, date: p.due }));
    doneMsg = `✅ 已添加倒计时「${esc(p.title)}」 ${esc(p.due)}`;
  }
  save();
  renderCurrent();
  $$(`#bot-msgs [data-card-id="${id}"]`).forEach(d => {
    d.querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.add("is-applied"); });
  });
  botSay(doneMsg);
  if (window.matchMedia('(min-width: 921px)').matches) $("#bot-text").focus();
}

$("#bot-form").addEventListener("submit", e => {
  e.preventDefault();
  const input = $("#bot-text");
  const v = input.value.trim();
  if (!v) return;
  input.value = "";
  botHandle(v);
  if (window.matchMedia('(min-width: 921px)').matches) input.focus();   // 连续录入不用再点输入框
});

/* —— 语音输入（浏览器原生识别，Edge/Chrome 可用） —— */
let botRec = null, botRecording = false, botFinalText = "";
$("#bot-mic").addEventListener("click", () => {
  if (botRecording) { botRec && botRec.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    botSay('😯 这个浏览器不支持网页语音识别。两个替代办法：<br>1. 点输入框，用<b>输入法自带的语音键</b>（讯飞/搜狗的中文识别很准）<br>2. 直接打字');
    return;
  }
  botRec = new SR();
  botRec.lang = "zh-CN";
  botRec.interimResults = true;
  botFinalText = "";
  botRec.onstart = () => {
    botRecording = true;
    $("#bot-mic").classList.add("recording");
    $("#bot-text").placeholder = "🎤 正在听…请说话";
    $("#bot-text").value = "";
    $("#bot-text").readOnly = true;          // 语音期间锁定输入框，避免互相覆盖
  };
  botRec.onresult = e => {
    let interim = "";
    botFinalText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) botFinalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    $("#bot-text").value = (botFinalText + interim).trim();
  };
  botRec.onerror = e => {
    botRecording = false;
    $("#bot-mic").classList.remove("recording");
    $("#bot-text").readOnly = false;
    $("#bot-text").placeholder = "如：明天下午3点交实验报告";
    if (e.error === "not-allowed") botSay('🎤 麦克风权限被拒绝了。点浏览器地址栏旁边的锁图标 → 允许麦克风，再试一次');
    else if (e.error === "network") botSay('🎤 语音识别服务连不上（网络问题）。可以用输入法的语音键代替，或直接打字');
  };
  botRec.onend = () => {
    botRecording = false;
    $("#bot-mic").classList.remove("recording");
    $("#bot-text").readOnly = false;
    $("#bot-text").placeholder = "如：明天下午3点交实验报告";
    const v = $("#bot-text").value.trim();     // 说完自动交给机器人处理
    if (v) { $("#bot-text").value = ""; botHandle(v); }
  };
  try { botRec.start(); } catch (e) { console.warn(e); }
});

applyTheme();
switchPage("dashboard");
updateClock();
showWelcomeNameModal();
setInterval(updateClock, 1000);
setInterval(() => {                    // 上课状态条每 30 秒刷新
  if (currentPage === "dashboard" && !document.hidden) {
    const el = $("#hero-status");
    if (el) el.textContent = classStatusLine();
  }
}, 30000);

/* 课表页：键盘 ←/→ 翻周 + 手机左右滑动翻周 */
document.addEventListener("keydown", e => {
  if (currentPage !== "timetable") return;
  if (!$("#course-modal").hidden || !$("#import-modal").hidden) return;
  const tag = document.activeElement?.tagName || "";
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === "ArrowLeft") goWeek(-1);
  if (e.key === "ArrowRight") goWeek(1);
});
/* 课表页：翻周统一入口（‹›按钮/键盘方向键）——渲染后把横向滚动归位到周一，
   避免 sticky 时间列残留在周末位置浮在课程上方（贯穿感）。
   注意：网格上横向滑动只用于滚动浏览周四周五等，不再触发翻周。 */
function goWeek(delta) {
  viewWeek = (viewWeek ?? Math.max(weekOf(todayStr()), 1)) + delta;
  renderCurrent();
  const wrap = document.querySelector(".tt-wrap");
  if (wrap) wrap.scrollLeft = 0;
}

if (!IS_NATIVE_APP && getToken() && state.sync.gistId) {
  pullSync(false);
  setInterval(() => { if (!document.hidden) pullSync(false); }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getToken() && state.sync.gistId) pullSync(false);
  });
}

/* Android 返回键：先关闭当前浮层，再回概览，最后交给系统退出 */
if (IS_NATIVE_APP && window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener("backButton", () => {
    if (!$("#course-modal").hidden) { closeCourseModal(); return; }
    if (!$("#import-modal").hidden) { $("#import-modal").hidden = true; return; }
    if (!$("#bot-panel").hidden) { $("#bot-panel").hidden = true; return; }
    if (!$("#welcome-modal").hidden) { dismissWelcomeNameModal(); return; }
    if (currentPage !== "dashboard") { switchPage("dashboard"); return; }
    window.Capacitor.Plugins.App.exitApp();
  });
}
