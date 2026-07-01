// Supabase Edge Function: probe-page
// 目的：作为 probe 页的"承载页"，让**顶层导航响应**带 Accept-CH/Critical-CH——
//   这是拿到"服务器实际收到的高熵 Client Hints 头"(sec-ch-ua-model/full-version-list/platform-version)的唯一途径：
//   Accept-CH 仅在顶层导航响应生效（subresource fetch 的 Accept-CH 被浏览器忽略）。
// 机制：浏览器导航到本函数 → 收到 Accept-CH/Critical-CH → 协商高熵 CH → 本页与 echo-headers 同源(supabase.co) →
//   页面内 fetch(echo) 即带高熵 CH。
// 实现：薄代理——运行时拉取 GitHub Pages 上的 index.html（probe 逻辑单一源），仅注入 Accept-CH 响应头后返回。
// 入口：https://<proj>.supabase.co/functions/v1/probe-page?src=<标签>  （部署需 --no-verify-jwt，供匿名导航）

const UPSTREAM = "https://glzlaohuai.github.io/oem-browser-probe/index.html";

// 要在导航时协商的高熵 Client Hints。Critical-CH 让浏览器发现缺失时立即重发导航带齐。
const ACCEPT_CH = [
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-model",
  "sec-ch-ua-platform-version",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "sec-ch-ua-full-version",
  "sec-ch-ua-wow64",
  "sec-ch-ua-form-factors",
].join(", ");

Deno.serve(async (_req: Request) => {
  let html: string;
  try {
    // cachebust 破 GitHub Pages 默认 max-age=600，保证拿到最新 index.html
    const r = await fetch(UPSTREAM + "?cb=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
    html = await r.text();
  } catch (e) {
    return new Response("probe-page upstream fetch failed: " + e, { status: 502 });
  }
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Accept-CH": ACCEPT_CH,
      "Critical-CH": ACCEPT_CH,
      "Cache-Control": "no-store",
    },
  });
});
