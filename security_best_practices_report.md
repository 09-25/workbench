# work desktop 对抗性安全审查与安装包哈希检验

审查日期：2026-09-04  
范围：`app.js`、`index.html`、Android 配置与 `work-desktop-v1.0.3.apk`。未修改业务代码。

## 修复后复核（2026-09-04，v1.0.4）

以下原审查项已在 `1.0.4` 中处理并重新验证：

- WDSK-001：已移除 `#sync=` URL 自动配置；同步仅能在设置页手工发起。
- WDSK-002：导入状态改用 `textContent`，文件名不再被当作 HTML 解析。
- WDSK-003：GitHub Token 仅保留在当前网页会话内；升级时会清除旧版 localStorage Token。
- WDSK-004：已改为专用 3072-bit RSA Release 签名，构建改用 `assembleRelease`，产物不再带 `application-debuggable`。
- WDSK-005：已在资源加载前加入不允许内联脚本或 eval 的 CSP；网页托管时仍建议在服务器响应头额外部署 CSP 与 `frame-ancestors`。
- WDSK-006：已禁用 Android 系统备份，并将 FileProvider 缩小为应用缓存的 `shared/` 子目录。

`work-desktop-v1.0.4.apk`：SHA-256 `0A2CBCC92AD8036F8F678A0EC562E36AF7ADC3CC649FEAC2B16F90EEC09F7A3D`；v2 签名验证通过；包名 `com.hzx.workbench`，版本 `1.0.4`（versionCode 5），无危险权限。当前 Release 证书 SHA-256 为 `c54fb0f7f3efe69712063105d29f298667c448398dfe9628fbf05bd5390ce074`。

## 结论摘要

本地 Android 版默认不启用 GitHub 云同步、禁止明文网络，且安装包只声明了应用内部动态接收器权限；这条默认离线链路的风险面较小。

但网页版本仍有 1 项高风险隐私问题：带 `#sync=` 的链接可以静默把本机同步到攻击者控制的 Gist。另有 3 项中风险问题，包括导入文件名进入 HTML、网页端长期 Token 存于 localStorage、当前分发包为可调试的 Debug APK。若准备面向大量用户分发，应先处理高风险项并改为 Release 签名。

## 安装包完整性

- 文件：`work-desktop-v1.0.3.apk`
- 包名：`com.hzx.workbench`
- 版本：`1.0.3`（`versionCode=4`）
- SHA-256：`9FFF829305A6C123DB19DF476F678867DBF8567FB7725E698C08D171BF3BACB6`
- APK 签名：v2 验证通过；签名证书 SHA-256：`9da8cebbd1db9aa5a68fd475127049260e48c5bb953a2bf850e9aedab81b473a`
- 与 `1.0.2` 的签名证书相同，且 `versionCode` 由 3 升至 4，因此 Android 可以覆盖更新。
- 已比对 `app.js` 源文件、`dist/app.js` 与 APK 内 `assets/public/app.js`；三者 SHA-256 均为 `0499EB3419ADAB991A9C59D4AE8481E695E8B8546DC5223AD5DE2DCF6492DCF2`。
- `npm audit --omit=dev --audit-level=low`：0 个已知依赖漏洞。

哈希只能证明“拿到的文件与这份文件相同”；校验值本身应通过独立可信渠道获取，不能和不可信下载链接放在同一处。

## 高风险

### WDSK-001：URL 片段可静默接管网页端同步目标

- 规则 ID：JS-URL-001、JS-STORAGE-001
- 严重性：高（仅网页/PWA 版；Android 本地版会跳过此段逻辑）
- 位置：`app.js:2286-2300`
- 证据：

  ```js
  const m = location.hash.match(/#sync=([A-Za-z0-9+/=_-]+)/);
  ...
  localStorage.setItem(TOKEN_KEY, cfg.token);
  state.sync.gistId = cfg.gist;
  ...
  setTimeout(() => { pullSync(true); switchPage("timetable"); }, 600);
  ```

- 影响：攻击者可发送含自身 Token 与 Gist ID 的链接。用户访问后，页面无需确认便建立到攻击者 Gist 的同步；随后自动推送可能上传本机课表、待办和日志。
- 修复：移除 URL 自动写入 Token 的功能，只允许用户在设置页手工输入。若确有快捷配对需求，至少先展示不可跳过的确认页面，明确显示 Gist 所属账号与目标，并在确认前禁止推送。
- 缓解：不要分发或打开带 `#sync=` 的链接；不要把 Token 放进聊天记录、文档或二维码。
- 误报说明：Android 本地包以 `IS_NATIVE_APP` 提前返回，不受该入口影响。

## 中风险

### WDSK-002：导入文件名进入 HTML 注入点

- 规则 ID：JS-XSS-001
- 严重性：中
- 位置：`app.js:1571-1575`、`app.js:1827-1850`、`app.js:1859-1867`
- 证据：

  ```js
  function impStatus(ok, msg) { ... el.innerHTML = msg; }
  ...
  impStatus(true, `✅ 从${label}解析出 <b>${res.courses.length} 门课程</b>...`);
  ...
  handleImportRaw(s, `文件「${f.name}」`);
  ```

- 影响：恶意文件名可被解析成 HTML。若用户被诱导选择该文件，可能在网页端读取本地数据及已保存的同步 Token。
- 修复：动态部分至少使用 `esc(label)`；更稳妥的做法是让状态容器使用 `textContent`，把固定强调样式拆为独立 DOM 节点。
- 缓解：导入预览中的课程字段已调用 `esc()`，应保持该约束。
- 误报说明：Windows 会限制部分文件名字符，但 Android、Linux 或任意 `File` 来源不应依赖此限制。

### WDSK-003：网页端 GitHub Token 长期存于 localStorage

- 规则 ID：JS-STORAGE-001
- 严重性：中
- 位置：`app.js:170-171`
- 证据：`const getToken = () => localStorage.getItem(TOKEN_KEY) || "";` 与 `setToken()` 直接读写 `hzx-workbench-token`。
- 影响：任何同源脚本注入、恶意浏览器扩展或共享浏览器配置文件均可能读取 Token；Token 具备用户授予的 Gist 权限。
- 修复：Android 离线版继续禁用同步；网页端使用最小权限、可撤销的细粒度 Token，并提供清晰的轮换/断开说明。纯静态前端无法安全保管长期私密 Token。
- 缓解：仅授予 `gist` 权限，定期轮换，不把 Token 放入备份、截图或 URL。
- 误报说明：用户未启用网页同步时不会写入该键。

### WDSK-004：当前分发包为 Debug 构建与 Debug 签名

- 规则 ID：Android 发布基线
- 严重性：中
- 位置：`package.json:8`、`work-desktop-v1.0.3.apk` 的 `aapt dump badging` 与 `apksigner verify --print-certs` 输出
- 证据：构建脚本运行 `assembleDebug`；APK 标记为 `application-debuggable`，证书 DN 为 `CN=Android Debug`。
- 影响：不适合作为面向大量用户的正式发布包，增加 ADB/本机调试面的暴露，也无法建立长期稳定的发布签名信任链。
- 修复：创建专用 release keystore（离线备份，绝不提交仓库），配置 `signingConfigs.release`，以 `assembleRelease` 生成签名的 Release APK/AAB；首次公开发布前固定该签名证书。
- 缓解：当前包只应作测试包分发；不要更换签名密钥，否则已安装用户无法覆盖更新。
- 误报说明：Debug 签名仍能验证“文件未在签名后被篡改”，但不等同于生产级发布。

## 低风险与加固项

### WDSK-005：网页部署未见 CSP

- 规则 ID：JS-CSP-001
- 严重性：低（与 WDSK-002 组合时风险上升）
- 位置：`index.html:1-11`；仓库未见 HTTP/边缘响应头配置
- 证据：无 `Content-Security-Policy` meta，也未发现部署层响应头配置。
- 修复：网页部署优先添加 HTTP CSP，至少限制 `script-src 'self'`、`object-src 'none'`、`base-uri 'self'`，并只将 GitHub API 加入必要的 `connect-src`。不要加入 `unsafe-eval`。
- 误报说明：若正式托管平台在仓库外设置 CSP，需要在真实域名的 Network 响应头复核。

### WDSK-006：Android 备份与 FileProvider 范围过宽

- 规则 ID：最小权限 / 纵深防御
- 严重性：低
- 位置：`android/app/src/main/AndroidManifest.xml:5`、`android/app/src/main/res/xml/file_paths.xml:3-4`
- 证据：`android:allowBackup="true"`；FileProvider 声明 `<external-path ... path="." />`。
- 影响：设备备份策略可能把本地数据带入系统备份；若未来增加分享文件 URI 的功能，宽泛路径会扩大可被授权暴露的文件范围。
- 修复：明确决定是否允许系统备份；若不需要，设为 `false`。FileProvider 只保留实际导出目录的窄路径。当前未发现代码调用 FileProvider，因此这是预防性加固。

## 已验证的正向控制

- 常用链接仅允许 `http:`/`https:`，并带 `rel="noopener"`：`app.js:37`、`app.js:844`。
- 主业务字段在 HTML 模板中普遍通过 `esc()` 处理；机器人接收的原始文本也先转义。
- 未发现 `eval`、`new Function`、`document.write`、动态第三方脚本或不受控网页 `postMessage` 接收器。
- Android 配置了 `android:usesCleartextTraffic="false"` 与 Capacitor `allowMixedContent: false`。
- 当前 APK 仅声明应用内部 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`，未发现相机、定位、通讯录、存储等危险权限。

## 建议优先级

1. 先修复 WDSK-001，禁止 URL 静默配置同步。
2. 修复 WDSK-002，并为关键动态 HTML 路径补充回归测试。
3. 公开分发前完成 WDSK-004 的 Release 签名流程。
4. 再处理 CSP、Token 使用说明与 Android 备份/FileProvider 的纵深防御项。
