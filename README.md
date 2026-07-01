# OEM Browser / WebView Probe

探测 Android 各家浏览器 / WebView 的 JS 环境（用于反检测 / 指纹调查）。纯静态页，部署到 GitHub Pages 即可用真实公网 https 访问。

## 用法

1. 部署到 GitHub Pages（Settings → Pages → 从 main 分支根目录）。
2. 在目标浏览器 / WebView 里访问：
   `https://<user>.github.io/<repo>/?src=<标签>`
   `src` 用来区分来源，例如：
   - `?src=xiaomi-dev_mi-browser`
   - `?src=xiaomi-dev_webview`
   - `?src=vivo-dev_vivo-browser`
3. 页面会：枚举 `window` 全部全局 + 深度内省关键对象，采集 UA / Client Hints / `window.chrome` / `window.android`(Media Integrity) / OEM 注入全局，**显示在页面上**，并 **POST 到收集器**。
4. 页面按钮可**免键盘 eval**（`window.MiWebViewDetector` 等）；内置 **Eruda** 页内控制台（release OEM 浏览器 chrome://inspect 看不到时用）。

## 探测项

- `navigator.userAgent` / `userAgentData`(brands + 高熵 `getHighEntropyValues`) / platform / plugins
- `window.chrome`（`//chrome` 层标志：Chrome / 三星 fork 有，WebView 类没有）
- `window.android`（WebView **Media Integrity API**，引擎内置 WebIDL，约 WebView M121–130 引入）
- `MiWebViewDetector` / 各 OEM 注入的自有 JS 全局
- feature/API 表、WebGL unmasked vendor/renderer、窗口尺寸

## 收集器

GitHub Pages 是静态托管、收不了 POST，所以结果 POST 到 **webhook.site**（`index.html` 里的 `COLLECTOR`）。
- 换成你自己的：`curl -X POST https://webhook.site/token` 建一个，把返回的 uuid 填进 `COLLECTOR`。
- 读取收到的数据：`GET https://webhook.site/token/<uuid>/requests`。
- WebView 会在这个 POST 上带 `X-Requested-With: <宿主包名>`，收集器能一并记录（用来验证是不是被 app 嵌的 WebView）。

## 背景

详见调查报告 `dynamic_h5_apic/docs/superpowers/2026-06-30-oem-browser-webview-survey.md`（同项目）。
