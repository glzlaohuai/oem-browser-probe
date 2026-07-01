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

GitHub Pages 是静态托管、收不了 POST，结果存到 **Supabase**（Postgres 表 `probe_results`）。选它是因为：
- **不被 OEM 浏览器广告拦截**——小米/vivo/OPPO 自带内容拦截会封 `webhook.site` 这类 webhook/exfil 域名，导致上报（连 `no-cors`）静默失败；`*.supabase.co` 是后端服务域名，不在黑名单。
- **正常回 CORS 头**——请求能读回执，页面状态如实显示，无 “Failed to fetch” 误报。
- **持久入库、可 SQL 查询**——跨组合对比方便，不像 webhook.site 只留 7 天。

配置（换成你自己的项目）：

1. 建表 + RLS（SQL Editor 里跑）——只给 `anon` 角色 INSERT、不给读：
   ```sql
   create table if not exists public.probe_results (
     id bigint generated always as identity primary key,
     created_at timestamptz not null default now(),
     src text, ua text, has_chrome boolean, payload jsonb
   );
   alter table public.probe_results enable row level security;
   create policy "anon can insert" on public.probe_results
     for insert to anon with check (true);
   grant insert on table public.probe_results to anon;
   ```
2. `index.html` 里填 `SUPABASE_URL` 和 `SUPABASE_ANON`（**anon key 只能 INSERT，公开无妨**；RLS 挡住读/改/删）。
3. 读取用 **service_role** key（**切勿进仓库**）：
   ```
   curl 'https://<ref>.supabase.co/rest/v1/probe_results?select=*&order=created_at.desc' \
     -H "apikey: <service_role>" -H "Authorization: Bearer <service_role>"
   ```

> 注：`X-Requested-With` 这类请求头 JS 读不到、Supabase 也不入表；WebView 是否带该头（宿主包名）需另用能记录请求头的端点验证——本项目该结论已在 survey 报告确认，此处不再依赖。

## 背景

详见调查报告 `dynamic_h5_apic/docs/superpowers/2026-06-30-oem-browser-webview-survey.md`（同项目）。
