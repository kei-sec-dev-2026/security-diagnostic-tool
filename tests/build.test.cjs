"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { build, publicFiles } = require("../scripts/build.cjs");

const expectedFiles = [
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/diagnostic.js",
  "data/questions.json",
  "data/sources.json",
  "css/challenge.css",
  "js/challenge-engine.js",
  "js/challenge.js",
  "data/challenge.json",
];
const fixturePrefix = "security-diagnostic-build-test-";

async function fixture(t) {
  const temporaryParent = await fs.realpath(os.tmpdir());
  const temporaryRoot = await fs.mkdtemp(path.join(temporaryParent, fixturePrefix));
  t.after(async () => {
    // Only remove the exact temporary directory created for this test.
    const resolved = await fs.realpath(temporaryRoot);
    assert.equal(path.dirname(resolved), temporaryParent);
    assert.ok(path.basename(resolved).startsWith(fixturePrefix));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const projectRoot = path.join(temporaryRoot, "project");
  await fs.mkdir(projectRoot);
  const contents = new Map();
  for (const file of expectedFiles) {
    const value = `公開ファイル: ${file}\n`;
    const destination = path.join(projectRoot, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, value, "utf8");
    contents.set(file, value);
  }
  for (const file of ["node_modules/workerd/workerd.exe", "docs/private-notes.md", ".env", "package.json"]) {
    const destination = path.join(projectRoot, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, "公開しないファイル", "utf8");
  }
  return { projectRoot, temporaryRoot, contents, dist: path.join(projectRoot, "dist") };
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

test("ビルドは固定の公開10ファイルだけをコピーし、依存関係や開発資料を含めない", async (t) => {
  const { projectRoot, dist, contents } = await fixture(t);
  assert.deepEqual([...publicFiles].sort(), [...expectedFiles].sort());
  const result = await build(projectRoot);
  assert.equal(result.directory, dist);
  assert.deepEqual([...result.files].sort(), [...expectedFiles].sort());
  assert.deepEqual(await listFiles(dist), [...expectedFiles].sort());
  let expectedBytes = 0;
  for (const [file, content] of contents) {
    assert.equal(await fs.readFile(path.join(dist, file), "utf8"), content);
    expectedBytes += Buffer.byteLength(content, "utf8");
  }
  assert.equal(result.bytes, expectedBytes);
  assert.equal(await fs.readFile(path.join(projectRoot, ".env"), "utf8"), "公開しないファイル");
});

test("再ビルドでは古いdistの余分なファイルを除去し、現在の公開内容へ置き換える", async (t) => {
  const { projectRoot, dist } = await fixture(t);
  await fs.mkdir(path.join(dist, "old-directory"), { recursive: true });
  await fs.writeFile(path.join(dist, "old-directory", "stale.txt"), "古い配信物");
  await fs.writeFile(path.join(dist, "index.html"), "古い画面");
  await build(projectRoot);
  assert.deepEqual(await listFiles(dist), [...expectedFiles].sort());
  assert.equal(await fs.readFile(path.join(dist, "index.html"), "utf8"), "公開ファイル: index.html\n");
});

test("ソースが不足している場合は失敗し、既存のdistを消去しない", async (t) => {
  const { projectRoot, dist } = await fixture(t);
  await fs.mkdir(dist);
  await fs.writeFile(path.join(dist, "index.html"), "直前の正常な出力");
  await fs.writeFile(path.join(dist, "keep.txt"), "残すべき出力");
  await fs.unlink(path.join(projectRoot, "js", "diagnostic.js"));
  await assert.rejects(() => build(projectRoot));
  assert.deepEqual(await listFiles(dist), ["index.html", "keep.txt"]);
  assert.equal(await fs.readFile(path.join(dist, "index.html"), "utf8"), "直前の正常な出力");
  assert.equal(await fs.readFile(path.join(dist, "keep.txt"), "utf8"), "残すべき出力");
});

test("1ファイル25MiBを超えるソースを配信せず、既存のdistも保持する", async (t) => {
  const { projectRoot, dist } = await fixture(t);
  await fs.mkdir(dist);
  await fs.writeFile(path.join(dist, "keep.txt"), "直前の出力");
  const oversized = await fs.open(path.join(projectRoot, "data", "questions.json"), "r+");
  try {
    await oversized.truncate(25 * 1024 * 1024 + 1);
  } finally {
    await oversized.close();
  }
  await assert.rejects(() => build(projectRoot));
  assert.deepEqual(await listFiles(dist), ["keep.txt"]);
  assert.equal(await fs.readFile(path.join(dist, "keep.txt"), "utf8"), "直前の出力");
});

test("distが通常ファイルなら削除せず拒否する", async (t) => {
  const { projectRoot, dist } = await fixture(t);
  await fs.writeFile(dist, "ディレクトリと誤認して消してはいけない");
  await assert.rejects(() => build(projectRoot));
  assert.equal(await fs.readFile(dist, "utf8"), "ディレクトリと誤認して消してはいけない");
});

test("distのシンボリックリンク・junctionを拒否し、リンク先を変更しない", async (t) => {
  const { projectRoot, temporaryRoot, dist } = await fixture(t);
  const outside = path.join(temporaryRoot, "outside-project");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "keep.txt"), "リンク先の内容");
  try {
    await fs.symlink(outside, dist, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip("この環境ではシンボリックリンクを作成できません");
      return;
    }
    throw error;
  }
  await assert.rejects(() => build(projectRoot));
  assert.ok((await fs.lstat(dist)).isSymbolicLink());
  assert.deepEqual(await listFiles(outside), ["keep.txt"]);
  assert.equal(await fs.readFile(path.join(outside, "keep.txt"), "utf8"), "リンク先の内容");
});
