# 交接文档（给下一个 AI / 开发者）

> 本文档由上一个 AI 助手编写于 2026-08-31。用户是陕西理工大学通信 2403 班大三学生，非专业开发者，沟通请用中文。

## 项目是什么

学生的个人工作台 Web 应用：课程表（按周视图+单双周）+ 待办 + 每日日志 + 习惯打卡 + 倒计时 + 🤖自然语言速记小助手 + 语音输入 + 云同步（GitHub Gist）+ PWA 可安装。纯原生 HTML/CSS/JS，**零依赖、无构建步骤**。

## 关键位置

| 东西 | 位置 |
|---|---|
| **项目源码** | `E:\gpt杂\my-workbench\`（index.html / styles.css / app.js / sw.js / manifest.webmanifest / icons/ / 我的课表备份.json） |
| **线上地址** | https://09-25.github.io/workbench/ （GitHub Pages，push 到 main 自动部署，构建约 1 分钟） |
| **GitHub 仓库** | https://github.com/09-25/workbench （账号 09-25，gh CLI 已登录，命令在 `C:\Program Files\GitHub CLI\gh.exe`，Git Bash 里需 `export PATH="$PATH:/c/Program Files/GitHub CLI"`） |
| **云同步 Gist** | id `cbe1eb7d996327db0010f7322fc0f0fa`，文件 workbench-data.json，description 含"我的工作台"（应用靠这个自动发现） |
| **测试脚本** | `E:\gpt杂\.tools\wb-test\`（playwright-core，用本机 Chrome：`C:/Program Files/Google/Chrome/Application/chrome.exe`） |
| **用户手机** | Android，已扫码配置同步（设备名 手机-5q1n）；电脑 Edge 已配置（电脑-hgib） |
| **定时任务** | 每周一早 8 点提醒核对课表（ZCode automation） |

## 部署流程

```bash
cd "E:\gpt杂\my-workbench"
git add -A && git commit -m "..." && git push origin main
# 等 1-2 分钟 GitHub Pages 自动构建；国内网络偶尔抽风，push 失败等几分钟重试
```

## 测试（改完代码必跑）

```bash
cd "E:\gpt杂\.tools\wb-test"
node feature-test.js      # 全功能 67 项
node adversarial-test.js  # 对抗审查 25 项（XSS/坏数据/边界）
node import-test.js       # 教务导入 33 项
node sync-test.js         # 双端同步 22 项（mock GitHub API）
node bot-test.js          # 小助手解析
```
全部应通过、零 JS 报错。注意：测试脚本里的日期断言已动态化，但若改动预置数据（TEST_STATE）需同步检查。

## ⚠️ 当前未完成状态（接手必读）

**农历功能有 +1 天偏移 bug，代码在本地已改但未 commit/push（线上没有此功能）。**

- 已加代码：app.js 里 `solarToLunar()` / `calendarLine()`（LUNAR_INFO 历表算法），概览 hero-date 和日志标题已接入显示
- bug：算出的农历比实际**早一天**（如 2026-02-17 春节被算成"腊月廿九"，2026 中秋 9/25 被算成"八月十四"）
- 测试：`node lunar-test.js`（6 个锚点目前只过 1 个）
- 排查方向：基准日 `new Date(1900, 0, 31)` 与 offset 计算、闰月分支（2026 无闰月也偏，重点查 while 循环边界）
- 修复后：`git add -A && git commit && git push` 部署

如果不想修，可以 `git checkout -- app.js` 回滚农历改动（回滚后概览/日志显示公历+周次，无农历）。

## 用户偏好与约束（改功能时注意）

- 课表数据：通信 2403 班本学期真实课表（33 块，来源教务系统），**没有 EDA 技术和数字图像处理**；开学日 2026-08-31（第 1 周）；作息为八小节制每节 50 分钟（第1-2节 08:00-09:50 / 3-4节 10:10-12:00 / 5-6节 14:00-15:50 / 7-8节 16:10-18:00 / 9-10节 19:00-20:50）
- 浏览器：电脑 Edge、手机 Android Chrome
- 设计风格：「纸上学园手账」（米色点阵纸底、便利贴课程块、荧光笔标题），用户已认可，**不要改成通用后台风格**
- 用户不是程序员，沟通避免术语；他喜欢的功能：按周看课表、小助手语音速记、状态条
- GitHub 国内访问不稳定，push/部署偶尔失败属正常，重试即可

## 小助手（自然语言解析）已支持的写法

日期：今天/明天/后天/周X/下周X/X月X日/X号（含全角数字、汉字"九月五日"）；时间：X点半/晚上X点/X点到Y点；节次：1-2节；周次：第X周/X-Y周/单周/双周；教室：9A101 格式；"重要/紧急"升优先级。意图判定：节次或"补课/调课"等→课程；日期+考/试/竞赛/截止→倒计时；默认→待办。识别卡片上可一键切换类型纠正。

## 数据模型速查

state = { profile{name,semesterStart,theme,updatedAt}, slots[5], slotsUpdatedAt, courses[{id,name,teacher,room,day:1-7,slot:0-4,sec?,weeks,color,updatedAt}], todos[], logs{date:{entries[],note,entriesUpdatedAt,noteUpdatedAt}}, habits[], countdowns[], links[], certs[{id,name,cat,level,award,date,issuer,score,note,photo?,createdAt,updatedAt}], tombstones[{id,at}], sync{gistId,lastPush,lastPull} }
- weeks 规范格式："all"|"odd"|"even"|"1-17"|"1-15单"|"1,3,5"（weekSet() 统一解析，支持逗号混合）
- 多端合并：字段级 LWW（updatedAt）+ 删除墓碑（tombstones，防复活）
- GitHub Token 存 localStorage 单独 key（hzx-workbench-token），不进备份文件

## 2026-09-05 更新（证书墙 + 时间排列修复）

- **新增证书墙页**（桌面侧边栏 + 手机底部 tab 第5个「证书」）：收录证书/奖项，字段为名称、类别、级别、奖项等级、获得日期、综测加分、颁发单位、备注、可选照片（canvas 压缩到 ≤900KB 后存 dataURL）；按学年分组（8月起算新学年），顶部统计卡（总数/本学年/加分合计），「复制综测清单」一键导出纯文本方便填综测表
- **证书同步**：certs 已并入 mergeState 列表（字段级 LWW + 墓碑），与课程/待办同机制
- **数据清洗**：sanitizeCert 白名单字段 + isRealDateStr 真日历校验（拦 2099-13-45）+ photo 必须 data:image/ 前缀 + 分数钳 0-100；恶意 gist 数据不会执行脚本
- **配额保护**：save() 捕获 QuotaExceededError → toast 提醒删照片；照片超 900KB 自动二次压缩，仍超则拒收
- **时间排列修复**：课表页左侧节次时间列 position:sticky（横向滚动不再滑出屏幕）；日志页窄屏日期栏两行排布（日期不再被挤成竖排逐字换行）
- **版本**：web sw.js 缓存 workbench-v1.12；Android versionCode 14 / versionName 1.0.13（与 1.0.4-1.0.12 同签名，可覆盖安装；app.js 顶部 APP_VERSION 常量须与 gradle versionName 一致，android-package-test 已断言）
- 测试：.tools/wb-test/cert-test.js（38项）+ adversarial-cert-test.js（20项对抗）已入常驻回归
- 农历 +1 天 bug 仍未修（见上文排查方向）

## 2026-09-05 第二轮（覆盖安装修复 + 证书筛选 + 动效 + 悬浮球拖动）

- **覆盖安装不更新的根因**：APK 页面跑在 https://localhost，PWA Service Worker 把旧资源缓存在 WebView（覆盖安装不清应用数据）。修复：APK（IS_NATIVE_APP）内**不再注册 SW**，启动时发现残留 SW/caches 立即注销清空并一次性 reload；web 端 register 加 `updateViaCache:"none"`，新 SW 接管（controllerchange）后自动刷新一次
- **证书墙筛选**：类别 chips（全部+8类，带数量），筛选后统计卡/列表联动；空类别有专属空态；「复制综测清单」始终导出全部
- **悬浮球可拖动**：触摸/鼠标拖动机器人（8px 内算点击、超出手势），位置存 localStorage(hzx-workbench-fab) 刷新还原，边界钳制（底部留 74px 给 tabbar，resize 重钳）；拖完松手不触发打开面板
- **按钮动效**：btn hover 上浮+按压缩放、icon/del 缩放、侧边栏 hover 右移、tabbar 选中图标 tabPop 弹跳、课程格/便利贴 hover 阴影、主题点旋转；prefers-reduced-motion 全部关闭
- 测试：.tools/wb-test/polish-test.js（24 项）已入常驻回归

## 2026-09-05 第三轮（翻周瞬变 / sticky贯穿 / 状态栏遮挡 / 感知哈希检验）

- **翻周瞬变**：根因是上一轮给课程格加的 `:active` 按压缩放，手机滑动翻周时手指按下瞬间误触发 scale(.98) 再弹回，看起来"大小突变"。已移除 .tt-cell/.chip 的按压缩放，hover 效果包进 `@media (hover:hover)`（触屏不粘滞）
- **sticky 时间列贯穿**：翻周统一走 goWeek()（手势/键盘/按钮全部），渲染后 `.tt-wrap.scrollLeft` 归位到周一——时间列永远完整可见，不再浮在周末课程上方；时间列右缘加了 3px 渐变分隔
- **状态栏遮字**：APK 全面屏（targetSdk 35）内容顶进状态栏。修法：MainActivity 给根容器加 statusBars+displayCutout 的顶部 padding（insets 监听），styles.xml 加 `windowOptOutEdgeToEdgeEnforcement`（Android 15 双保险）
- **感知哈希检验**：.tools/wb-test/phash.js（纯JS实现 32x32 DCT pHash + 9x8 dHash + 汉明距离），ui-phash-test.js 8 项全绿：翻周前后 pHash 距离 22（同版式）、翻完瞬间 vs 稳定距离 0（无二次跳动）、页面间距离 28（可区分）、语义指纹（布局几何 JSON，问候语 top=79 > 状态栏38px）。基线存档 `_qa/phash-baseline.json`

## 2026-09-05 第四轮（导入识别8缺陷修复 + CSV支持 + 触控优化 + 感知哈希基线）

- **导入识别修复**（黄金样本 .tools/wb-test/import-accuracy-test.js 13 项零误差全绿，三格式 HTML/TSV/CSV 同一网格逐字段对比）：
  1. 复合格式 `(1-17周;9A110)` 教室分号残留 → roomFromEduWeeksLine 吃掉前导分隔符
  2. 课程名 ★ 尾缀残留 → parseBlock 去 ★☆＊*
  3. `1-15单周` 的「周」字被当教室 → 单双/周任意顺序匹配
  4. 「田径场」被当教师名 → looksTeacherLine 排除场所后缀（场馆楼室厅区）
  5. `1-14周(双)` 剥尾括号残段 `(双` 进教室 → 未闭合括号段清理（语义 1~14 双周=2-14双 正确保留）
  6. 普通逗号句子误判为课表 CSV → looksLikeCSV 必须有≥5列星期表头
  7. CSV 单元格内换行破坏行列结构 → tsvField 引号转义后转 TSV
  8. **新增 CSV 文件格式**（accept 加 .csv；引号感知；BOM/GBK 自动识别），与 HTML/TSV/xlsx/PDF 并列
- **触控优化**：todo-check/todo-del/icon-btn/del-mini/theme-dot 热区 ::after 外扩 9px（视觉零变化，有效命中 39~54px）；手机端 .btn 42px 高、.btn-sm 40px、输入框 42px、cert-chip 加大
- 感知哈希基线更新：_qa/phash-baseline.json（pHash/dHash + 布局语义指纹）

## 2026-09-05 第五轮（移除滑动翻周手势）

- **用户反馈**：课表页想滑动浏览周三周四周五，被手势判定成翻周，轻轻一划就跳第二周
- **修复**：整体删除网格滑动翻周手势（touchstart/touchend 监听已移除）。翻周只走 ‹› 按钮（goWeek）和键盘方向键；网格横向滑动交给浏览器原生滚动，自由浏览周内的任意几天
- swipe-test.js 已改为验证「滑动不翻周」

## 2026-09-05 第七/八轮合并（ScheduleRemote 学习改造 + QA 修复单 v1.0.13）

### 第七轮（1.0.12，学习他人 APK 的设置与课表界面）
- **设置页新增「关于」tab**：关于卡（logo+APP_VERSION+数据本地化隐私说明）、更新卡（PWA 自动更新说明+check-update 按钮；APK 覆盖安装指引）、小提示卡（pdf.js 致谢）。APP_VERSION 常量在 app.js 头部，须与 gradle 同步
- **课表页顶部周次横滑条**（第1~22周 chips 直达任意周，当前周红色高亮自动居中，week-jump 归位）；课程块圆角 12px；设置 tabs 手机端横滑
- 悬浮球 restore() 按当前窗口 clamp（换设备/旋转屏不出屏）

### 第八轮（1.0.13，QA 修复单）
- **P1 农历早一天（连续四版）三根因全修**：①offset 两端 Date.UTC（1900 年中国 LMT+8:05:43 历史时区陷阱）②solarToLunar 重构为 lunarFromOffset 逐月表驱动 ③solarTermOf 精确节气表（2024-2027 内置）。**lunar-check2.js 9/9**（春节/中秋/除夕/立秋/冬至/国庆/七月廿四/八月初一/七月初一），2025 闰六月初一扩展自检 ✓。⚠️ lunar-check2 读 dist/，改源码后必须 npm run build:web 再验收
- solarToLunar 的 fest 合并公历节日与除夕（明天正月初一→今天 fest=除夕）
- **P3 夜灯主题按钮**：预览改文字前 12px 小色点（不再盖字）
- **P3 证书墙空态**：#cert-list .empty padding-right:78px 避让悬浮球（文字右缘 296 < 球左 318）
- **P3 概览副标题重复**：空课日改「明天预告」；hero-date 手机端允许换行（360px 农历不裁尾）
- **P1(v1.0.12 回归) 周次条撑爆文档**：.page-head 首子层与 .week-chips 加 min-width:0（flex 子项 min-width:auto 默认被 chips max-content 撑到 1443px、tabbar 顶出屏幕）；验收 390/360 溢出=0、tabbar 回底、6 页可切
