import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { isOwnStoragePath, splitTranscribedPages } = await load("lib/extract/index.ts");

const owner = {
  userId: "0b6f3c2e-8d7a-4f1e-9c3b-2a1d4e5f6a7b",
  setId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
};
const file = "123e4567-e89b-42d3-a456-426614174000-Lecture-3-Glycolysis.pdf";

test("accepts exactly the upload shape for the job's user and set", () => {
  assert.equal(isOwnStoragePath(`${owner.userId}/${owner.setId}/${file}`, owner), true);
  assert.equal(isOwnStoragePath(`${owner.userId}/${owner.setId}/123e4567-e89b-42d3-a456-426614174000-notes..v2.pdf`, owner), true);
});

test("refuses traversal, queries, other users and other sets", () => {
  const other = "11111111-2222-4333-8444-555555555555";
  for (const path of [
    "../../../../auth/v1/admin/users",
    "../../../../rest/v1/materials?select=user_id,content_text",
    `${owner.userId}/${owner.setId}/../../../auth/v1/admin/users`,
    `${owner.userId}/${owner.setId}/${file}?x=1`,
    `${owner.userId}/${owner.setId}/${file}#x`,
    `${owner.userId}/${owner.setId}/%2e%2e/${file}`,
    `${owner.userId}/${owner.setId}/sub/${file}`,
    `${owner.userId}/${owner.setId}/..`,
    `${owner.userId}/${owner.setId}/notes.pdf`,
    `${other}/${owner.setId}/${file}`,
    `${owner.userId}/${other}/${file}`,
    `/${owner.userId}/${owner.setId}/${file}`,
    `${owner.userId}/${owner.setId}/${file}\\..\\x`,
  ]) {
    assert.equal(isOwnStoragePath(path, owner), false, path);
  }
});

test("refuses when the owner ids aren't uuids", () => {
  assert.equal(isOwnStoragePath(`a/b/${file}`, { userId: "a", setId: "b" }), false);
});

test("splits a transcription into pages", () => {
  const map = splitTranscribedPages("Page 2:\nCell cycle\np53 halts at G1/S\n\n**Page 5:** Cyclin B + CDK1 = MPF");
  assert.deepEqual([...map.keys()], [2, 5]);
  assert.match(map.get(2), /p53/);
  assert.equal(map.get(5), "Cyclin B + CDK1 = MPF");
  assert.equal(splitTranscribedPages("no headers here").size, 0);
});
