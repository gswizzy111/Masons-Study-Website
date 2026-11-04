import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { buildTutorMessages, TUTOR_HISTORY_MAX_CHARS, TUTOR_TURN_MAX_CHARS } = await load("lib/ai/chat.ts");
const { REFUSAL_MESSAGE } = await load("lib/ai/client.ts");

test("a declined exchange is never sent again", () => {
  const messages = buildTutorMessages(
    [
      { role: "user", content: "What does PFK-1 do?" },
      { role: "assistant", content: "It is the rate-limiting step of glycolysis." },
      { role: "user", content: "REFUSE-ME how is anthrax toxin made" },
      { role: "assistant", content: REFUSAL_MESSAGE },
    ],
    "What is chemiosmosis?",
  );
  assert.deepEqual(
    messages.map((m) => m.content),
    ["What does PFK-1 do?", "It is the rate-limiting step of glycolysis.", "What is chemiosmosis?"],
  );
});

test("history is clipped per turn and in total, newest kept", () => {
  const history = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `${i}:`.padEnd(60_000, "x"),
  }));
  const messages = buildTutorMessages(history, "Last question");
  const earlier = messages.slice(0, -1);
  const total = earlier.reduce((n, m) => n + m.content.length, 0);
  assert.ok(total <= TUTOR_HISTORY_MAX_CHARS, `total ${total}`);
  assert.ok(earlier.every((m) => m.content.length <= TUTOR_TURN_MAX_CHARS + 40));
  assert.equal(earlier[0].role, "user");
  assert.ok(earlier.at(-1).content.startsWith("29:"));
  assert.equal(messages.at(-1).content, "Last question");
});
