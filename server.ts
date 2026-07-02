// server.ts — Deno Deploy：承载 probe 页(+Accept-CH) + 同源 /echo + 导航头入库 nav_headers
// 凭据：仅 anon key（RLS 只允 INSERT）经 env 读取；绝不放 service_role。

const REDACT = new Set([
  "authorization", "cookie", "set-cookie", "apikey", "x-api-key", "proxy-authorization",
]);

/** 遍历请求头为普通对象，敏感头替换为 [redacted]。 */
export function redact(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers) out[k] = REDACT.has(k.toLowerCase()) ? "[redacted]" : v;
  return out;
}

/** 是否已协商到高熵 CH：model（去引号去空格后非空）或 full-version-list 非空。 */
export function hasHighEntropy(headers: Headers): boolean {
  const model = (headers.get("sec-ch-ua-model") ?? "").replace(/"/g, "").trim();
  const fvl = (headers.get("sec-ch-ua-full-version-list") ?? "").trim();
  return model !== "" || fvl !== "";
}

export interface NavRecord {
  request_id: string;
  src: string | null;
  gaid: string | null;
  ua: string | null;
  has_high_entropy: boolean;
  headers: Record<string, string>;
}

/** 从导航请求构造入库记录；无 rid 返回 null（硬前置：不写库）。 */
export function buildNavRecord(url: URL, headers: Headers): NavRecord | null {
  const rid = url.searchParams.get("rid");
  if (!rid) return null;
  return {
    request_id: rid,
    src: url.searchParams.get("src"),
    gaid: url.searchParams.get("gaid"),
    ua: headers.get("user-agent"),
    has_high_entropy: hasHighEntropy(headers),
    headers: redact(headers),
  };
}
