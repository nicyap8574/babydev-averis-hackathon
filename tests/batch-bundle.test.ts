import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachmentRecords,
  parseBundle,
  MAX_ENTRIES,
} from "../frontend/src/lib/batchBundle.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const BUNDLE = path.join(ROOT, "sdoc-hackathon-bundle");

const encode = (value: string) => new TextEncoder().encode(value);

function emailEntry(id: string, attachments: string[] = [], extra: Record<string, unknown> = {}) {
  return encode(JSON.stringify({
    email_id: id,
    from: `${id}@example.com`,
    subject: `Subject ${id}`,
    body: `Body ${id}`,
    attachments,
    ...extra,
  }));
}

test("resolves attachments relative to a wrapping bundle folder", () => {
  const { emails } = parseBundle({
    "sdoc-hackathon-bundle/inbox/email_001.json": emailEntry("email_001", ["attachments/email_001_SI.txt"]),
    "sdoc-hackathon-bundle/attachments/email_001_SI.txt": encode("SHIPPING INSTRUCTION"),
  });
  assert.equal(emails.length, 1);
  assert.equal(emails[0].attachments.length, 1);
  assert.equal(emails[0].attachments[0].storagePath, "email_001/email_001_SI.txt");
});

test("resolves attachments when the archive has no wrapping folder", () => {
  const { emails } = parseBundle({
    "inbox/email_001.json": emailEntry("email_001", ["attachments/email_001_BL.txt"]),
    "attachments/email_001_BL.txt": encode("BILL OF LADING"),
  });
  assert.equal(emails[0].attachments[0].storagePath, "email_001/email_001_BL.txt");
});

test("attachment records carry a storage path, not bare strings", () => {
  // compare.py only reads dict items with a string `path`; a bare string array
  // makes every comparison look like it had no attachments at all.
  const { emails } = parseBundle({
    "inbox/email_004.json": emailEntry("email_004", ["attachments/email_004_SI.txt"]),
    "attachments/email_004_SI.txt": encode("SHIPPING INSTRUCTION"),
  });
  const records = attachmentRecords(emails[0]);
  assert.deepEqual(records, [{
    name: "email_004_SI.txt",
    content_type: "text/plain",
    size_bytes: "SHIPPING INSTRUCTION".length,
    path: "email_004/email_004_SI.txt",
  }]);
  assert.equal(typeof records[0].path, "string");
});

test("sanitization preserves the _SI and _BL markers for every bundle attachment", () => {
  // frontend/api/compare.py's is_document() decides which document is which
  // from the filename stem alone, so the marker has to survive intact.
  const names = fs.readdirSync(path.join(BUNDLE, "attachments"));
  assert.ok(names.length > 200, "expected the full bundle's attachments");

  const entries: Record<string, Uint8Array> = {};
  for (const name of names) {
    const id = name.slice(0, "email_000".length);
    entries[`inbox/${id}.json`] = emailEntry(id, [`attachments/${name}`]);
    entries[`attachments/${name}`] = encode("x");
  }
  const { emails } = parseBundle(entries);

  for (const email of emails) {
    for (const attachment of email.attachments) {
      const stem = attachment.storagePath.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase();
      assert.match(stem, /(?:^|[_\-\s])(si|bl)(?:$|[_\-\s])/, attachment.storagePath);
    }
  }
});

test("emails with no attachments produce no uploads", () => {
  const { emails } = parseBundle({ "inbox/email_011.json": emailEntry("email_011", []) });
  assert.equal(emails[0].attachments.length, 0);
  assert.deepEqual(attachmentRecords(emails[0]), []);
});

test("malformed records become warnings rather than aborting the batch", () => {
  const { emails, warnings } = parseBundle({
    "inbox/email_001.json": emailEntry("email_001"),
    "inbox/email_002.json": encode("{ not json"),
    "inbox/email_003.json": encode(JSON.stringify({ subject: "no id", body: "", attachments: [] })),
    "inbox/email_004.json": emailEntry("email_004", [] as string[], { attachments: [{ name: "x" }] }),
  });
  assert.deepEqual(emails.map((email) => email.emailId), ["email_001"]);
  assert.equal(warnings.length, 3);
});

test("a duplicate email_id is kept once", () => {
  const { emails, warnings } = parseBundle({
    "inbox/email_001.json": emailEntry("email_001"),
    "inbox/email_001b.json": emailEntry("email_001"),
  });
  assert.equal(emails.length, 1);
  assert.match(warnings[0], /duplicate email_id/);
});

test("unsupported attachment types are skipped with a warning", () => {
  const { emails, warnings } = parseBundle({
    "inbox/email_001.json": emailEntry("email_001", ["attachments/notes.exe"]),
    "attachments/notes.exe": encode("x"),
  });
  assert.equal(emails[0].attachments.length, 0);
  assert.match(warnings[0], /not a supported file type/);
});

test("an attachment referenced but absent is reported, not fatal", () => {
  const { emails, warnings } = parseBundle({
    "inbox/email_001.json": emailEntry("email_001", ["attachments/email_001_SI.txt"]),
  });
  assert.equal(emails[0].attachments.length, 0);
  assert.match(warnings[0], /referenced but not in the archive/);
});

test("an archive with no inbox folder is rejected", () => {
  assert.throws(
    () => parseBundle({ "readme.txt": encode("hello") }),
    /No inbox\/email_\*\.json files found/,
  );
});

test("an archive with too many entries is rejected", () => {
  const entries: Record<string, Uint8Array> = {};
  for (let index = 0; index <= MAX_ENTRIES; index += 1) entries[`file_${index}.txt`] = encode("x");
  assert.throws(() => parseBundle(entries), /more than the .* a bundle should contain/);
});

test("parses the real testing bundle end to end", () => {
  const fixture = path.join(ROOT, "testing-sdoc-hackathon-bundle");
  const entries: Record<string, Uint8Array> = {};
  for (const folder of ["inbox", "attachments"]) {
    for (const name of fs.readdirSync(path.join(fixture, folder))) {
      entries[`testing-sdoc-hackathon-bundle/${folder}/${name}`] =
        new Uint8Array(fs.readFileSync(path.join(fixture, folder, name)));
    }
  }
  const { emails, warnings } = parseBundle(entries);
  assert.deepEqual(warnings, []);
  assert.deepEqual(
    emails.map((email) => email.emailId),
    ["email_001", "email_004", "email_005", "email_009", "email_013"],
  );
  for (const email of emails) {
    assert.equal(email.attachments.length, 2, email.emailId);
    assert.ok(email.sender.includes("@"), email.emailId);
    assert.ok(email.subject.length > 0, email.emailId);
  }
  const xlsx = emails.find((email) => email.emailId === "email_005")!;
  assert.ok(xlsx.attachments.every((attachment) =>
    attachment.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
});
