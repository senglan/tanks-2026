import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptySaveFile,
  createProfilePreview,
  deleteProfile,
  parseSaveFile,
  upsertProfile
} from "./profileStorage";

test("parseSaveFile returns an empty save for invalid JSON", () => {
  const parsed = parseSaveFile("{ definitely-not-json");

  assert.deepEqual(parsed, createEmptySaveFile());
});

test("upsertProfile overwrites an existing profile and deleteProfile removes it", () => {
  const empty = createEmptySaveFile();
  const profile = createProfilePreview("Alpha", "#ffffff");
  const inserted = upsertProfile(empty, profile);
  const updated = upsertProfile(inserted, { ...profile, money: 42 });
  const deleted = deleteProfile(updated, profile.id);

  assert.equal(inserted.profiles.length, 1);
  assert.equal(updated.profiles.length, 1);
  assert.equal(updated.profiles[0].money, 42);
  assert.equal(deleted.profiles.length, 0);
});
