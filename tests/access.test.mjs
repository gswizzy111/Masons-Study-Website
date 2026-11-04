import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { isAllowedEmail, allowedEmails } = await load("lib/access.ts");

function withEnv(value, fn) {
  const before = process.env.ALLOWED_EMAILS;
  if (value === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = before;
  }
}

test("no list means anyone may use the app (local dev)", () => {
  withEnv(undefined, () => {
    assert.equal(allowedEmails(), null);
    assert.equal(isAllowedEmail("anyone@example.com"), true);
  });
  withEnv("  ", () => assert.equal(isAllowedEmail("anyone@example.com"), true));
});

test("only listed addresses, case-insensitive, any separator", () => {
  withEnv(" Mason@Example.com, second@example.com;third@example.com ", () => {
    assert.equal(isAllowedEmail("mason@example.com"), true);
    assert.equal(isAllowedEmail("MASON@EXAMPLE.COM "), true);
    assert.equal(isAllowedEmail("third@example.com"), true);
    assert.equal(isAllowedEmail("cardtester@example.com"), false);
    assert.equal(isAllowedEmail(""), false);
    assert.equal(isAllowedEmail(null), false);
    assert.equal(isAllowedEmail(undefined), false);
  });
});

test("no partial matches", () => {
  withEnv("mason@example.com", () => {
    assert.equal(isAllowedEmail("xmason@example.com"), false);
    assert.equal(isAllowedEmail("mason@example.com.evil.test"), false);
  });
});
