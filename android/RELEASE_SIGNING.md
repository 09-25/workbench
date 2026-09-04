# Release 签名资产

正式包使用 `keystore/work-desktop-release.p12` 与同目录上级的 `release.properties` 签名。

- 这两个文件均被 Git 忽略，绝不能提交、发到聊天记录或上传公开网盘。
- 更换电脑前，将这两个文件一起离线备份；丢失它们会导致以后无法为已安装用户提供覆盖更新。
- 构建正式包使用 `npm run android:build`，产物为 `android/app/build/outputs/apk/release/app-release.apk`。

## 一次性签名迁移

`1.0.1` 至 `1.0.3` 是 Debug 签名包，无法直接覆盖安装新的 Release 签名包。用户首次升级到 `1.0.4` 前应在旧包中导出 JSON 备份，卸载旧包后安装 `1.0.4` 并导入备份；从 `1.0.4` 起，后续使用同一 Release 签名的版本可以直接覆盖更新。
