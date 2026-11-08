import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  buildIndexNowPayload,
} from "../../apps/web/lib/indexnow";

describe("buildIndexNowPayload", () => {
  it("builds absolute urls and the key location for the host", () => {
    const payload = buildIndexNowPayload({
      origin: "https://onlyorders.tech",
      key: "abc123",
      routes: ["/", "/pricing"],
    });
    expect(payload).toEqual({
      host: "onlyorders.tech",
      key: "abc123",
      keyLocation: "https://onlyorders.tech/abc123.txt",
      urlList: ["https://onlyorders.tech/", "https://onlyorders.tech/pricing"],
    });
  });

  it("keeps each brand on its own host", () => {
    const payload = buildIndexNowPayload({
      origin: "https://oryxa.rrcomputer.com.bd",
      key: "abc123",
      routes: ["/"],
    });
    expect(payload.host).toBe("oryxa.rrcomputer.com.bd");
    expect(payload.urlList).toEqual(["https://oryxa.rrcomputer.com.bd/"]);
  });

  it("posts to the endpoint shared by bing and yandex", () => {
    expect(INDEXNOW_ENDPOINT).toBe("https://api.indexnow.org/indexnow");
  });

  it("key matches the hosted key-file route (rotate both together)", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    expect(existsSync(`apps/web/app/${INDEXNOW_KEY}.txt/route.ts`)).toBe(true);
  });
});
