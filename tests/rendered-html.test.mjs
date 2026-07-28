import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the HUFS GRID product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>HUFS GRID \| 글로벌캠퍼스 2026-2 시간표<\/title>/,
  );
  assert.match(html, /이번 학기,/);
  assert.match(html, /빈칸부터 완성까지\./);
  assert.match(html, /강좌 찾기/);
  assert.match(html, /내 시간표/);
  assert.match(html, /1,590/);
  assert.match(html, /월요일부터 토요일까지 시간표/);
  assert.match(html, /content="http:\/\/localhost(?::3000)?\/og\.png"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships the complete 2026-2 Global Campus course dataset", async () => {
  const [coursesRaw, summaryRaw] = await Promise.all([
    readFile(new URL("../public/data/courses.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/summary.json", import.meta.url), "utf8"),
  ]);
  const courses = JSON.parse(coursesRaw);
  const summary = JSON.parse(summaryRaw);

  assert.equal(courses.length, 1590);
  assert.equal(new Set(courses.map((course) => course.course_code)).size, 1590);
  assert.equal(summary.unique_course_count, 1590);
  assert.equal(summary.online_count, 7);
  assert.equal(summary.pass_fail_count, 108);
  assert.equal(summary.syllabus_count, 878);

  const counts = Object.groupBy(
    courses,
    (course) => course.classification_code,
  );
  assert.equal(counts["1"].length, 1131);
  assert.equal(counts["2"].length, 405);
  assert.equal(counts["3"].length, 54);
});

test("includes local persistence, conflict checks, filters, and no starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /findConflict/);
  assert.match(page, /parseMeetings/);
  assert.match(page, /consecutiveGroups/);
  assert.match(page, /meeting\.periods\.join\("-"\)/);
  assert.match(page, /passFailOnly/);
  assert.match(page, /syllabusOnly/);
  assert.match(page, /classification_code/);
  assert.match(page, /\{ code: "Sat", label: "토" \}/);
  assert.match(page, /강의계획서/);
  assert.match(layout, /<html lang="ko">/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(
    access(new URL("app/_sites-preview/SkeletonPreview.tsx", projectRoot)),
  );
  await assert.rejects(
    access(new URL("app/_sites-preview/preview.css", projectRoot)),
  );
});
