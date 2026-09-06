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
- **版本**：web sw.js 缓存 workbench-v1.19；Android versionCode 21 / versionName 1.0.20（与 1.0.4-1.0.19 同签名，可覆盖安装；app.js 顶部 APP_VERSION 常量须与 gradle versionName 一致，android-package-test 已断言）
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

## 2026-09-05 第九轮（1.0.14：概览月历下方空白 → 手账便签）

- 用户反馈概览页月历卡下方、时钟右侧有空白。新增 `.hero-note`「📌 今日便签」便利贴（微倾黄底纸手账风）：待办完成 x/y、今日打卡 x/y、本周剩余课程数（空数据显示引导语）；hero-right 改为月历+便签竖排列，手机/桌面/夜灯三端适配

## 2026-09-05 第十轮（1.0.15：手机端紧凑课表）

- **用户反馈**：课表网格太大，一屏只能看 2 列，滑很久才看到后面几天
- **手机端（≤920px）紧凑模式**：列宽 96→56px（.tt 总宽 812→530px，一屏约 4.5 列，两屏内看完一周）；课程块只留「课名 + 教室」，起止时间由左侧时间列承担（chip-time 隐藏）、教师收进点击详情（teacher-r 隐藏）、周次角标周视图隐藏/**整学期视图保留**（#tt-grid[data-mode=term]，同格多课靠角标区分——渲染时 gridEl.dataset.mode 标注）
- 时间列 74→46px（第X节+起止 8.5px 两行）；桌面端（>920px）保持详细模式不变
- ui-phash-test 时间列宽度断言阈值 60→44（紧凑列宽）；phash 基线更新

## 2026-09-06 第十一轮（1.0.16：课表日视图——照用户参考图排列）

- 用户给了参考截图（单日时间轴式课表），实现**日视图**：手机端（≤920px）默认进入
  - 顶部**日期条**：月份竖排 + 一~日七天（星期+日期），选中日红色高亮、今天描边；点日子直接切换（日期条显示所选日所在周的七天）
  - **左侧逐节时间轴**：1-2 / 3-4 … 每大节一行（节号+起止时间），有课的节挂彩色课程卡（课名+教室+教师+周次角标，"正在上"标签保留），空节只显示时间
  - 无课日显示"今天没课，去图书馆或运动场吧 🌤️"；今天视图自动滚到正在上的节
  - ‹ › 变成前一天/后一天；「回到本周」复用；「按周看」退出日视图回周网格；周视图有「日视图」按钮进入——三模式 day/week/term 循环切换
  - 底部提示文案按视图切换（日视图不再提"点空格子"）
- 周视图（含紧凑模式）与整学期视图保持不变；桌面端默认周视图、可切日视图
- dayview-verify.js / dayview-desktop.js 验收脚本；ui-phash-test 手机场景先切周视图再测

## 2026-09-06 补（1.0.17：QA P3 课表底部提示避让悬浮球）
- .tt-hint 加 padding-right:78px（与证书空态同款）；390/360 两档验收文字与悬浮球不相交（291<318、254<288）

## 2026-09-06 补（1.0.18：默认周视图 + 日志日期栏放大）
- 课表手机端**默认改回周视图**（用户反馈：日视图不如整周直观）；日视图保留，周视图点「日视图」按钮进入
- **日志页日期栏整体放大一档**（用户要求）：日期行 19px、周次 13.5px、‹›按钮 40px、日期选择器 46px 高
- 测试：dayview-verify 改为「默认周视图」断言；ui-phash/hint-verify 去掉冗余的 wk-mode 点击

## 2026-09-06 补（1.0.19：去除陕理工专属内容，面向多校分发）
- 导入弹窗的「陕理工 EAMS 导入步骤」块删除，换成**通用版**三步引导（不提任何学校/网址）；全局搜净"陕理工/snut/EAMS"字样（app.js 注释同步去专属化）
- 应用现在无任何特定学校耦合：开学日期/节次时间由用户在设置里自己配，教务导入走通用解析

## 2026-09-06 补（1.0.20：修复他校"假xls"课表漏识别）
- 用户同学（西安某高校）的教务导出 .xls 实为 **UTF-8 HTML 伪装**（文件头 `    <ta`），非 OLE2 二进制——HTML 管线本可解析，但课程单元格内格式特殊导致漏课：
  - 单元格多行：`课程名 (060011.01)` / `(教师1,教师2)` / `(1  教3-405(未央))`（**周次与教室空格分隔、无"周"字**、外层括号包内嵌校区括号），且一格多门同课名不同周次
  - **根因**：`looksRoomLine` 把"课程名 (课程号)"行（含数字+≤18字）误判为教室行 → 不切块、课程名进教室字段
  - **修复**：looksRoomLine 排除"4+连续汉字且无场所词（教室/馆/楼/室/厅/区）"的行；周次/教室空格分隔格式被 WEEK_LINE 的"括号纯周次"分支+specFromEduText/roomFromEduWeeksLine 正确消化
- 样本沉淀：sample-xu.xls（真实他校课表），验收=识别出全部课程（含"模式识别基础"5 个周次段：1/2-12/1-8/15-16×2），第2周视图周一/周三模式识别（教2-406）可见- **版本**：web sw.js 缓存 workbench-v2.2；Android versionCode 24 / versionName 2.1.0（新增 .ics 导入的 minor 版；与 1.0.4 起同签名链连续，可覆盖安装；app.js 顶部 APP_VERSION 常量须与 gradle versionName 一致，android-package-test 已断言）

### 2.0.1（课程表单底部弹层选择器）
- 添加课程弹窗的星期/节次/周次从原生 select 换成**底部弹层**：星期/节次大字列表单选，周次=快捷 chips（每周都上/单周/双周/全选）+ 1-22 宫格多选（canonicalWeeks 归一规范 spec）
- 原生 select 转为 .sr-only 数据层：提交逻辑与 feature-test 的 selectOption/value 断言零改动兼容；specToSet 截到 22
- picker-verify.js 整链路验收 ✓（选周六/第7-8节/双周+微调→custom spec→保存落库）

## 2026-09-06 第十三轮（2.1.0：QA 三人实测修复单 + .ics 导入）

QA 三份真实课表实测（何子轩 33/33 ✅、彭璐瑶 18/20、许思涵 26/28）暴露 4 个问题，全部修复：
- **P1 体育V 丢失 ×2**：`looksRoomLine` 新增课程号排除——行内含 5+ 位数字课程号括号（"(230031.30)"）的行是课程名行不是教室；同格多门课（name/教师/周次教室 三行组）切块恢复
- **P2 跨全天节次实验课丢失**：彭璐瑶周日列格子首行是上一门课的尾巴字段行（"学时:48/学分:3.0"），`xlsxPickName` 首行 isField 直接放弃整格 → 改为跳过前导字段行（最多到全字段行才放弃）；"(1-10节)6周,11周" 跨 5 大节课归到起始大节（secA=1）
- **P3 跨行课名截断**：xlsxPickName 续行合并条件原来只看"括号未闭合"，纯课名跨行（"…工艺设
计★"）被断；新增"续行以 ★ 结尾也合并"（★ 是教务标记课名续行的强信号）
- **P2 功能缺口 .ics 导入**：`parseIcsBuffer`（VEVENT 解析：SUMMARY 提课名/去[考核][学分]段并提取[节次]、DTSTART 定星期与起始周、DTEND+slots 匹配兜底节次、RRULE UNTIL（UTC+8h）定结课周、INTERVAL=2 识别单双周、LOCATION 首空格分教室/教师）；accept 加 .ics；handleImportRaw 加 VCALENDAR 分支。WakeUp 样例 50 事件全识别 ✓（sample-wakeup.ics 沉淀）
- 三个样本文件沉淀：sample-xu.xls（许思涵 30 门）、sample-peng.xlsx（彭璐瑶 20 门）、sample-wakeup.ics（50 事件）
- **产品决策项（12 节制）评估结论**：暂不支持任意节数。应用 5 大节模型 + 用户可自编辑的作息时间已覆盖大多数场景；12 节制学校的线上课（11-12 节）会被归并到第 9-10 节显示（星期与课名保留，时间是应用内作息的 19:00-20:50）。后续版本可评估"作息大节数量可配置"。导入后引导用户核对"设置→作息时间"按源文件底部作息表调整
