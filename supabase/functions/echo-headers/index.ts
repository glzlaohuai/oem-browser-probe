// Supabase Edge Function: echo-headers
// 目的：回显 HTTP 请求头（JS 读不到的 X-Requested-With / 服务器实际收到的 Sec-CH-UA 全系列 /
//       Accept-Language 等）。这是 WebView 伪装成厂商浏览器时验证"改动是否生效"的裁判位。
// 高熵 CH 的协商由承载页 probe-page 的导航响应负责（见 probe-page/index.ts）——本函数不设 Accept-CH：
//   subresource fetch 响应上的 Accept-CH 会被浏览器忽略，设了也无用。
// 为何用 Edge Function：同 *.supabase.co 域名——已验证不被 OEM 浏览器广告拦截（webhook.site 被拦才弃用）。
//   部署为 public（--no-verify-jwt），前端裸奔 fetch 采到最干净的头。
// 局限：Deno 标准 Request 的 req.headers 是 Headers 对象，遍历顺序被字母序规整化，
//   拿不到原始 header ordering（只拿到头的"值"，足够验证 X-Req / Sec-CH-UA 变没变）。

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// 此端点 public 开放，剔除敏感头，避免沦为 header 反射/凭据泄露工具（本调查也不关心这些头）。
const REDACT = new Set([
  "authorization", "cookie", "set-cookie", "apikey", "x-api-key", "proxy-authorization",
]);

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers) {
    headers[k] = REDACT.has(k.toLowerCase()) ? "[redacted]" : v;
  }

  const body = JSON.stringify({
    headers,          // 请求头（值；顺序已被规整，见文件头局限；敏感头已 [redacted]）
    method: req.method,
    url: req.url,
    ts: new Date().toISOString(),
  });

  return new Response(body, {
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
