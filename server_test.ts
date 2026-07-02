import { assert, assertEquals } from "@std/assert";
import { redact, hasHighEntropy, buildNavRecord } from "./server.ts";

Deno.test("redact 剔除敏感头、保留其余", () => {
  const h = new Headers({ "user-agent": "UA", "cookie": "secret", "x-requested-with": "com.app" });
  const out = redact(h);
  assertEquals(out["user-agent"], "UA");
  assertEquals(out["x-requested-with"], "com.app");
  assertEquals(out["cookie"], "[redacted]");
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
