import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const pagesOutput = new URL("../dist-pages/", import.meta.url);

test("builds a GitHub Pages site under the repository base path", async () => {
  const html = await readFile(new URL("index.html", pagesOutput), "utf8");

  assert.match(html, /<html lang="ko">/);
  assert.match(html, /HUFS GRID \| 글로벌캠퍼스 2026-2 시간표/);
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

  assert.equal(courses.length, 1590);
  assert.equal(summary.unique_course_count, 1590);
  assert.deepEqual(
    Object.fromEntries(
      Object.values(summary.counts_by_classification).map((item) => [
        item.label,
        item.unique_course_count,
      ]),
    ),
    {
      "전공/부전공": 1131,
      교양: 405,
      기초: 54,
    },
  );
});

test("uses base-relative data requests in the shared application", async () => {
  const pageSource = await readFile(new URL("app/page.tsx", projectRoot), "utf8");

  assert.match(pageSource, /fetch\("\.\/data\/courses\.json"/);
  assert.match(pageSource, /fetch\("\.\/data\/summary\.json"/);
  assert.doesNotMatch(pageSource, /fetch\("\/data\//);
});
