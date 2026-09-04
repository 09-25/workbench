# work desktop 对抗性安全审查

审查日期：2026-09-03  
范围：`app.js`、`index.html`、Android 打包的静态资源配置。审查覆盖导入文件、浏览器存储、URL 参数、动态 HTML、外链和云同步路径；未发现仓库内的服务器或边缘安全响应头配置。

## WDSK-001：导入文件名可进入 HTML 注入点

- 规则 ID：JS-XSS-001
- 严重性：中
- 位置：`app.js:1520-1524`、`app.js:1770`、`app.js:1793-1795`
- 证据：`impStatus` 以 `el.innerHTML = msg` 渲染状态文字；成功提示把 `label` 拼进 HTML；文件导入时 `label` 包含未经转义的 `f.name`。
- 影响：攻击者若诱导用户选择一个带有 HTML 片段的文件名，文件名可能作为页面标签被解析。Android/Linux 文件系统可创建比 Windows 更宽松的文件名；一旦触发，脚本可读取本页面的本地数据和 Web 版同步 Token。
- 修复：最低限度是在成功提示中使用 `esc(label)`；更稳妥的方案是让状态提示只通过 `textContent` 追加动态文字，把需要加粗的固定内容拆成 DOM 节点。
- 缓解：部署严格 CSP（见 WDSK-004）；导入预览继续保持对所有课程字段调用 `esc`。
- 误报说明：Windows 不允许部分危险文件名字符，但 Android 目标平台和其他来源的 `File` 对象不应依赖该限制。

## WDSK-002：URL 片段可静默接管云同步目标

- 规则 ID：JS-URL-001 / JS-STORAGE-001
- 严重性：高
- 位置：`app.js:2097-2111`
- 证据：页面接受 `#sync=base64({"token":"…","gist":"…"})`，随后直接执行 `localStorage.setItem(TOKEN_KEY, cfg.token)` 并设置 `state.sync.gistId`，没有确认页面或来源校验。
- 影响：Base64 不是加密。攻击者可发送一个含自己 Token 和自己 Gist ID 的链接；用户打开后，应用会静默连接到攻击者控制的 Gist。之后本机数据可能被自动推送过去，造成课程、待办、日志等隐私数据泄露。
- 修复：移除 URL 自动配置 Token 的功能，改为只允许用户在设置页手动粘贴自己创建的 Token。若必须保留快捷配置，至少应先显示不可跳过的确认页，并仅允许预先验证过、用户可见的同步目标；这仍不如手动配置安全。
- 缓解：短期内不要分发带 `#sync=` 的链接，也不要在聊天、截图或文档中保存 Token。
- 误报说明：如果该链接永远不会被分发给其他人，风险会降低；但当前代码没有技术性限制，不能依赖该假设。

## WDSK-003：浏览器本地存储持久化 GitHub Token

- 规则 ID：JS-STORAGE-001
- 严重性：中（独立看为低；与 WDSK-001 组合时升高）
- 位置：`app.js:49`、`app.js:132-133`
- 证据：GitHub Token 存在 `localStorage` 的 `hzx-workbench-token` 键中。
- 影响：同源脚本注入、恶意浏览器扩展或共享电脑上的浏览器访问均可能取走 Token。Token 可访问用户允许的 Gist。
- 修复：Android 本地版继续禁用云同步；Web 版若保留同步，应使用短期、最小权限 Token，并在设置页提供清楚的断开/清除入口。前端纯静态架构无法把长期 Token 彻底保密。
- 缓解：给 Token 只授予 `gist` 权限，定期轮换；绝不把 Token 写入备份 JSON、截图或链接。
- 误报说明：此项目不使用登录会话；该问题仅影响用户主动启用 Web 云同步的场景。

## WDSK-004：未见内容安全策略（CSP）

- 规则 ID：JS-CSP-001
- 严重性：中
- 位置：`index.html:3-11`，以及仓库内未见 HTTP/边缘 CSP 配置
- 证据：HTML 头部没有 `Content-Security-Policy` meta；静态资源仅加载同源 `app.js`，仓库中没有可验证的响应头配置。
- 影响：一旦出现 DOM 注入，浏览器没有策略层阻止内联事件脚本执行；这会放大 WDSK-001 的后果。
- 修复：Web/PWA 部署时优先在 HTTP 响应头设置 CSP。静态托管无法配响应头时，可在 `<head>` 最前部添加经过测试的 meta CSP，`script-src` 限制为 `'self'`，并把 GitHub API 加入 `connect-src`。不要为了兼容性加入 `unsafe-eval`。
- 缓解：保持脚本和样式同源、不要新增第三方脚本；逐步减少 `innerHTML`。
- 误报说明：生产服务器可能在仓库外设置了响应头；需在正式域名的网络响应中复核。

## 已验证的正向控制

- 课程、待办、日志和导入预览等主要用户文本使用 `esc()` 后再进入模板。
- 常用链接只接受 `http:` / `https:`，新窗口链接带有 `rel="noopener"`（`app.js:36`、`app.js:806`）。
- 未发现 `eval`、`new Function`、`document.write`、动态第三方脚本或不受控 `postMessage` 接收器。
- Android 本地版会隐藏云同步界面并禁用同步逻辑，数据默认留在设备上。

本轮为审查报告，以上安全问题尚未随“首次称呼弹窗”功能一并改动，避免在未经确认的情况下改变现有同步方式。
