import { assert, assertEquals } from "@std/assert";
import { redact, hasHighEntropy, buildNavRecord, makeHandler, type NavRecord } from "./server.ts";

Deno.test("redact 剔除敏感头、保留其余", () => {
  const h = new Headers({ "user-agent": "UA", "cookie": "secret", "x-requested-with": "com.app", "authorization": "Bearer token123" });
  const out = redact(h);
  assertEquals(out["user-agent"], "UA");
  assertEquals(out["x-requested-with"], "com.app");
  assertEquals(out["cookie"], "[redacted]");
  assertEquals(out["authorization"], "[redacted]");
});

Deno.test("hasHighEntropy: model 有值 → true", () => {
  assert(hasHighEntropy(new Headers({ "sec-ch-ua-model": '"Pixel 4"' })));
});

Deno.test("hasHighEntropy: 无高熵头 → false", () => {
  assert(!hasHighEntropy(new Headers({ "sec-ch-ua": '"Chromium"' })));
});

Deno.test("hasHighEntropy: model 空引号 → false", () => {
  assert(!hasHighEntropy(new Headers({ "sec-ch-ua-model": '""' })));
});

Deno.test("hasHighEntropy: full-version-list 空引号 → false", () => {
  assert(!hasHighEntropy(new Headers({ "sec-ch-ua-full-version-list": '""' })));
});

Deno.test("buildNavRecord: 无 rid → null（硬前置）", () => {
  assertEquals(buildNavRecord(new URL("https://x.dev/?src=a"), new Headers()), null);
});

Deno.test("buildNavRecord: 有 rid → 带 src/gaid/ua/高熵/headers", () => {
  const url = new URL("https://x.dev/?src=a&gaid=g1&rid=r1");
  const rec = buildNavRecord(url, new Headers({ "user-agent": "UA", "sec-ch-ua-model": '"Pixel"' }))!;
  assertEquals(rec.request_id, "r1");
  assertEquals(rec.src, "a");
  assertEquals(rec.gaid, "g1");
  assertEquals(rec.ua, "UA");
  assertEquals(rec.has_high_entropy, true);
  assertEquals(rec.headers["user-agent"], "UA");
});

function testDeps(navSpy: NavRecord[]) {
  return {
    readStatic: (name: string) =>
      Promise.resolve(new TextEncoder().encode(name === "index.html" ? "<html>PAGE</html>" : "ERUDA")),
    insertNav: (rec: NavRecord) => { navSpy.push(rec); return Promise.resolve(); },
  };
}

Deno.test("GET / 有 rid：写 nav_headers + 返回 HTML + Accept-CH/Critical-CH", async () => {
  const spy: NavRecord[] = [];
  const res = await makeHandler(testDeps(spy))(
    new Request("https://x.dev/?src=a&gaid=g1&rid=r1", { headers: { "sec-ch-ua-model": '"Pixel"' } }),
  );
  assertEquals(res.status, 200);
  assert(res.headers.get("Accept-CH")?.includes("sec-ch-ua-model"));
  assert(res.headers.get("Critical-CH")?.includes("sec-ch-ua-model"));
  assertEquals(await res.text(), "<html>PAGE</html>");
  assertEquals(spy.length, 1);
  assertEquals(spy[0].request_id, "r1");
});

Deno.test("GET / 无 rid：不写 nav_headers（硬前置），页面照返回", async () => {
  const spy: NavRecord[] = [];
  const res = await makeHandler(testDeps(spy))(new Request("https://x.dev/?src=a"));
  assertEquals(res.status, 200);
  assertEquals(spy.length, 0);
});

Deno.test("nav 写失败不阻断页面（各管各）", async () => {
  const res = await makeHandler({
    readStatic: () => Promise.resolve(new TextEncoder().encode("<html>PAGE</html>")),
    insertNav: () => Promise.reject(new Error("boom")),
  })(new Request("https://x.dev/?rid=r1"));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "<html>PAGE</html>");
});

Deno.test("GET /echo 回显请求头 + CORS", async () => {
  const res = await makeHandler(testDeps([]))(
    new Request("https://x.dev/echo", { headers: { "x-requested-with": "com.app" } }),
  );
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  const j = await res.json();
  assertEquals(j.headers["x-requested-with"], "com.app");
});

Deno.test("GET /eruda.js → javascript content-type", async () => {
  const res = await makeHandler(testDeps([]))(new Request("https://x.dev/eruda.js"));
  assert(res.headers.get("Content-Type")?.includes("javascript"));
});

Deno.test("未知路径 → 404", async () => {
  const res = await makeHandler(testDeps([]))(new Request("https://x.dev/nope"));
  assertEquals(res.status, 404);
});

Deno.test("OPTIONS → CORS 预检", async () => {
  const res = await makeHandler(testDeps([]))(new Request("https://x.dev/echo", { method: "OPTIONS" }));
  assert(res.headers.get("Access-Control-Allow-Methods")?.includes("POST"));
});
