import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { safeNextPath } = await load("lib/safe-next.ts");

test("keeps same-site paths with query and hash", () => {
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/sets?a=1"), "/sets?a=1");
  assert.equal(safeNextPath("/sets/abc/learn?topic=t1#top"), "/sets/abc/learn?topic=t1#top");
});

test("refuses values that parse to another origin", () => {
  for (const value of [
    "/\t/x.com",
    "/\n/x.com",
    "/\r/x.com",
    "//x.com",
    "/\\x.com",
    "/\\\\x.com",
    "/a/..//x.com",
    "/./..//x.com",
    "https://x.com",
    "x.com",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeNextPath(value), null, JSON.stringify(value));
  }
});

test("percent-encoded slashes stay a path on this site", () => {
  assert.equal(safeNextPath("/%2F%2Fx.com"), "/%2F%2Fx.com");
  assert.equal(new URL(safeNextPath("/%2F%2Fx.com"), "https://study.example").host, "study.example");
});
