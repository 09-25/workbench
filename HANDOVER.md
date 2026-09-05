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
- **版本**：web sw.js 缓存 workbench-v1.6；Android versionCode 8 / versionName 1.0.7（与 1.0.4-1.0.6 同签名，可覆盖安装）
- 测试：.tools/wb-test/cert-test.js（38项）+ adversarial-cert-test.js（20项对抗）已入常驻回归
- 农历 +1 天 bug 仍未修（见上文排查方向）

## 2026-09-05 第二轮（覆盖安装修复 + 证书筛选 + 动效 + 悬浮球拖动）

- **覆盖安装不更新的根因**：APK 页面跑在 https://localhost，PWA Service Worker 把旧资源缓存在 WebView（覆盖安装不清应用数据）。修复：APK（IS_NATIVE_APP）内**不再注册 SW**，启动时发现残留 SW/caches 立即注销清空并一次性 reload；web 端 register 加 `updateViaCache:"none"`，新 SW 接管（controllerchange）后自动刷新一次
- **证书墙筛选**：类别 chips（全部+8类，带数量），筛选后统计卡/列表联动；空类别有专属空态；「复制综测清单」始终导出全部
- **悬浮球可拖动**：触摸/鼠标拖动机器人（8px 内算点击、超出手势），位置存 localStorage(hzx-workbench-fab) 刷新还原，边界钳制（底部留 74px 给 tabbar，resize 重钳）；拖完松手不触发打开面板
- **按钮动效**：btn hover 上浮+按压缩放、icon/del 缩放、侧边栏 hover 右移、tabbar 选中图标 tabPop 弹跳、课程格/便利贴 hover 阴影、主题点旋转；prefers-reduced-motion 全部关闭
- 测试：.tools/wb-test/polish-test.js（24 项）已入常驻回归
