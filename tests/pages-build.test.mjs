import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const pagesOutput = new URL("../dist-pages/", import.meta.url);

test("builds a GitHub Pages site under the repository base path", async () => {
  const html = await readFile(new URL("index.html", pagesOutput), "utf8");

  assert.match(html, /<html lang="ko">/);
  assert.match(html, /HUFS GRID \| 서울·글로벌 2026-2 시간표/);
  assert.match(html, /https:\/\/daehyuh\.github\.io\/2026-timetable\/og\.png/);
  assert.match(html, /\/2026-timetable\/assets\/[^"']+\.js/);
  assert.match(html, /\/2026-timetable\/assets\/[^"']+\.css/);
});

test("publishes the complete course data and social card", async () => {
  const [coursesText, summaryText] = await Promise.all([
    readFile(new URL("data/courses.json", pagesOutput), "utf8"),
    readFile(new URL("data/summary.json", pagesOutput), "utf8"),
    access(new URL("og.png", pagesOutput)),
  ]);
  const courses = JSON.parse(coursesText);
  const summary = JSON.parse(summaryText);

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
  assert.equal(summary.unique_course_count, courses.length);
  assert.equal(summary.campus_code, "ALL");
  assert.deepEqual([...summary.campus_codes].sort(), ["H1", "H2"]);
  assert.equal(summary.counts_by_campus.H1.unique_course_count, campusCounts.H1.length);
  assert.equal(summary.counts_by_campus.H2.unique_course_count, campusCounts.H2.length);
  assert.ok(Number.isFinite(Date.parse(summary.collected_at)));

  for (const item of Object.values(summary.counts_by_classification)) {
    assert.equal(
      courses.filter((course) =>
        course.classification_types.includes(item.label)).length,
      item.unique_course_count,
    );
  }
});

test("uses cache-busted base-relative data requests in the shared application", async () => {
  const pageSource = await readFile(new URL("app/page.tsx", projectRoot), "utf8");

  assert.match(pageSource, /fetch\(`\.\/data\/courses\.json\?v=\$\{cacheKey\}`/);
  assert.match(pageSource, /fetch\(`\.\/data\/summary\.json\?v=\$\{cacheKey\}`/);
  assert.match(pageSource, /cache: "no-store"/);
  assert.doesNotMatch(pageSource, /fetch\("\/data\//);
});

test("refreshes and validates HUFS data twice an hour before deployment", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/deploy-pages.yml", projectRoot),
    "utf8",
  );

  assert.match(workflow, /cron: "7,37 \* \* \* \*"/);
  assert.match(workflow, /node crawler\/crawl\.mjs/);
  assert.match(workflow, /node crawler\/validate\.mjs crawler\/data --strict/);
  assert.match(workflow, /node crawler\/promote\.mjs crawler\/data public\/data/);
  assert.match(workflow, /cancel-in-progress: false/);
});
