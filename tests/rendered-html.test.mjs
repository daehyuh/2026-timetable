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
    /<title>HUFS GRID \| 서울·글로벌 2026-2 시간표<\/title>/,
  );
  assert.match(html, /이번 학기,/);
  assert.match(html, /빈칸부터 완성까지\./);
  assert.match(html, /강좌 찾기/);
  assert.match(html, /내 시간표/);
  assert.match(html, /약 30분마다 자동 확인/);
  assert.match(html, /최신 데이터 확인/);
  assert.match(html, /서울 · 글로벌캠퍼스/);
  assert.match(html, /<legend>캠퍼스<\/legend>/);
  assert.match(html, /월요일부터 토요일까지 시간표/);
  assert.match(html, /content="http:\/\/localhost(?::3000)?\/og\.png"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships the complete 2026-2 Seoul and Global Campus course dataset", async () => {
  const [coursesRaw, summaryRaw] = await Promise.all([
    readFile(new URL("../public/data/courses.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/summary.json", import.meta.url), "utf8"),
  ]);
  const courses = JSON.parse(coursesRaw);
  const summary = JSON.parse(summaryRaw);

  const courseIds = courses.map(
    (course) =>
      `${course.year}:${course.semester_code}:${course.campus_code}:${course.course_code}`,
  );
  const campusCounts = Object.groupBy(
    courses,
    (course) => course.campus_code,
  );

  assert.ok(courses.length >= 3000);
  assert.equal(new Set(courseIds).size, courses.length);
  assert.ok(campusCounts.H1.length >= 1400);
  assert.ok(campusCounts.H2.length >= 1000);
  assert.deepEqual([...new Set(courses.map((course) => course.campus_code))].sort(), [
    "H1",
    "H2",
  ]);
  assert.equal(summary.unique_course_count, courses.length);
  assert.equal(summary.campus_code, "ALL");
  assert.deepEqual([...summary.campus_codes].sort(), ["H1", "H2"]);
  assert.equal(summary.counts_by_campus.H1.unique_course_count, campusCounts.H1.length);
  assert.equal(summary.counts_by_campus.H2.unique_course_count, campusCounts.H2.length);
  assert.equal(summary.online_count, courses.filter((course) => course.online).length);
  assert.equal(
    summary.pass_fail_count,
    courses.filter((course) => course.pass_fail).length,
  );
  assert.equal(
    summary.syllabus_count,
    courses.filter((course) => course.syllabus_available).length,
  );
  assert.ok(Number.isFinite(Date.parse(summary.collected_at)));

  for (const item of Object.values(summary.counts_by_classification)) {
    assert.equal(
      courses.filter((course) =>
        course.classification_types.includes(item.label)).length,
      item.unique_course_count,
    );
  }
});

test("includes multi-campus persistence, conflict checks, filters, and no starter preview", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /type CampusFilter = "all" \| CampusCode/);
  assert.match(page, /hufs-all-campuses-2026-2-timetable-v2/);
  assert.match(page, /hufs-global-2026-2-timetable/);
  assert.match(page, /2026:3:H2:\$\{courseCode\}/);
  assert.match(
    page,
    /course\.year}:\$\{course\.semester_code}:\$\{course\.campus_code}:\$\{course\.course_code}/,
  );
  assert.match(
    page,
    /course\.campus_code}:\$\{course\.classification_code}:\$\{course\.area_code}/,
  );
  assert.match(page, /campus-segmented-control/);
  assert.match(page, /featureCounts\.online/);
  assert.match(
    styles,
    /\.campus-segmented-control\s*\{\s*grid-template-columns:\s*repeat\(3,/,
  );
  assert.match(page, /findConflict/);
  assert.match(page, /parseMeetings/);
  assert.match(page, /consecutiveGroups/);
  assert.match(page, /meeting\.periods\.join\("-"\)/);
  assert.match(page, /passFailOnly/);
  assert.match(page, /syllabusOnly/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /최신 데이터 확인/);
  assert.match(page, /classification_code/);
  assert.match(page, /\{ code: "Sat", label: "토" \}/);
  assert.match(page, /강의계획서/);
  assert.match(layout, /<html lang="ko">/);
  assert.match(layout, /서울·글로벌 2026-2 시간표/);
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
