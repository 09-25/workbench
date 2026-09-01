# Android 本地版

这是一个不使用服务器的 Android 应用：课程表、待办、日志等数据仅保存在用户自己的手机上。请在应用内定期导出 JSON 备份。

## 安装测试版

将 `android/app/build/outputs/apk/debug/app-debug.apk` 发送到 Android 手机，打开文件并允许“安装未知应用”后即可安装。测试版使用默认调试签名，适合自己和小范围体验。

## 重新打包

电脑需安装 Node.js、Android SDK 和 Java 21。随后在项目目录运行：

```powershell
npm install
npm run android:build
```

生成位置：`android/app/build/outputs/apk/debug/app-debug.apk`。

## 面向公开发布

公开发给更多同学时，请使用独立的发布签名证书生成 Release APK 或 AAB，不能使用测试版签名。`npm run android:release` 会要求填写该证书信息。
