// server.ts — Deno Deploy：承载 probe 页(+Accept-CH) + 同源 /echo + 导航头入库 nav_headers
// 凭据：仅 anon key（RLS 只允 INSERT）经 env 读取；绝不放 service_role。

const REDACT = new Set([
  "authorization", "cookie", "set-cookie", "apikey", "x-api-key", "proxy-authorization",
]);

/** 遍历请求头为普通对象，敏感头替换为 [redacted]。 */
export function redact(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers) out[k] = REDACT.has(k) ? "[redacted]" : v;
  return out;
}

/** 是否已协商到高熵 CH：model（去引号去空格后非空）或 full-version-list 非空。 */
export function hasHighEntropy(headers: Headers): boolean {
  const model = (headers.get("sec-ch-ua-model") ?? "").replace(/"/g, "").trim();
  const fvl = (headers.get("sec-ch-ua-full-version-list") ?? "").replace(/"/g, "").trim();
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

const ACCEPT_CH = [
  "sec-ch-ua-full-version-list", "sec-ch-ua-model", "sec-ch-ua-platform-version",
  "sec-ch-ua-arch", "sec-ch-ua-bitness", "sec-ch-ua-full-version", "sec-ch-ua-wow64",
  "sec-ch-ua-form-factors",
].join(", ");

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export interface Deps {
  readStatic: (name: string) => Promise<Uint8Array<ArrayBuffer>>;
  insertNav: (rec: NavRecord) => Promise<void>;
}

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(req.url);

    // 同源 echo：回显服务器实收请求头（fetch 语境）
    if (url.pathname === "/echo") {
      const body = JSON.stringify({
        headers: redact(req.headers), method: req.method, url: req.url, ts: new Date().toISOString(),
      });
      return new Response(body, {
        headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 承载页：设 Accept-CH/Critical-CH；有 rid 则写导航头（各管各：失败仅记日志、不阻断）
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const rec = buildNavRecord(url, req.headers);
      // serverless 下必须 await：handler 返回后实例可能被回收，fire-and-forget 的写库会被丢弃。
      // 「各管各不阻断」= try/catch 吞掉写库错误让页面照返回，而非不等待。
      if (rec) {
        try { await deps.insertNav(rec); }
        catch (e) { console.error("nav_headers insert failed:", e); }
      }
      const html = await deps.readStatic("index.html");
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Accept-CH": ACCEPT_CH,
          "Critical-CH": ACCEPT_CH,
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/eruda.js") {
      const js = await deps.readStatic("eruda.js");
      return new Response(js, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  };
}

async function realInsertNav(rec: NavRecord): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !key) throw new Error("missing SUPABASE_URL / SUPABASE_ANON_KEY env");
  const r = await fetch(base.replace(/\/$/, "") + "/rest/v1/nav_headers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": "Bearer " + key,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rec),
  });
  if (!r.ok) throw new Error("nav_headers insert HTTP " + r.status + " " + (await r.text()).slice(0, 200));
}

function realReadStatic(name: string): Promise<Uint8Array<ArrayBuffer>> {
  return Deno.readFile(new URL("./" + name, import.meta.url));
}

if (import.meta.main) {
  Deno.serve(makeHandler({ readStatic: realReadStatic, insertNav: realInsertNav }));
}
