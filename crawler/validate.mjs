#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CLASSIFICATIONS, inspectCandidate } from "./promote.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const requestedDataDir = args.find((argument) => argument !== "--strict");
const dataDir = path.resolve(requestedDataDir || path.join(projectDir, "data"));
const courses = JSON.parse(await fs.readFile(path.join(dataDir, "courses.json"), "utf8"));
const summary = JSON.parse(await fs.readFile(path.join(dataDir, "summary.json"), "utf8"));
const courseList = Array.isArray(courses) ? courses : [];
const { errors: candidateErrors, counts } = inspectCandidate(courseList, summary);
const errors = [...candidateErrors];
const warnings = [];

if (!Array.isArray(courses)) errors.push("courses.json이 배열이 아닙니다.");
if (summary.campus_code !== "ALL") {
  errors.push(`통합 캠퍼스 코드가 올바르지 않습니다: ${summary.campus_code ?? "누락"}`);
}

for (const [index, course] of courseList.entries()) {
  const row = index + 1;
  if (!course.course_name_ko && !course.course_name_en) {
    errors.push(`${row}행 교과목명 누락`);
  }
  if (!course.classification_code || !course.classification) {
    errors.push(`${row}행 이수구분 누락`);
  }
  if (!course.area_code || !course.area) errors.push(`${row}행 조회영역 누락`);
  if (typeof course.online !== "boolean" || typeof course.pass_fail !== "boolean") {
    errors.push(`${row}행 온라인/PF 타입 오류`);
  }
  if (course.syllabus_available !== Boolean(course.syllabus_url)) {
    errors.push(`${row}행 강의계획서 플래그/URL 불일치`);
  }
  if (!Array.isArray(course.meetings)) errors.push(`${row}행 시간 구조 타입 오류`);
}

for (const [index, area] of (Array.isArray(summary.areas) ? summary.areas : []).entries()) {
  const expected = CLASSIFICATIONS.find(({ code }) =>
    code === String(area?.classification_code ?? ""));
  if (expected && area.classification !== expected.label) {
    errors.push(
      `${index + 1}번째 조회 영역 이수구분 불일치: ` +
      `${area.classification_code}/${area.classification ?? "누락"}`,
    );
  }
}

const unparsedSchedules = courseList
  .filter((course) =>
    course.schedule &&
    Array.isArray(course.meetings) &&
    course.meetings.length === 0 &&
    !/미정|온라인|없음|비대면/.test(course.schedule))
  .map((course) => ({
    campus_code: course.campus_code,
    course_code: course.course_code,
    schedule: course.schedule,
  }));
if (unparsedSchedules.length > 0) {
  warnings.push({
    type: "시간 형식 미파싱",
    count: unparsedSchedules.length,
    samples: unparsedSchedules.slice(0, 10),
  });
}

const actual = {
  unique_course_count: courseList.length,
  campus_count: counts.campus_count,
  campus_codes: counts.campus_codes,
  area_count: counts.area_count,
  collection_count: Object.values(counts.counts_by_classification)
    .filter((item) => item.unique_course_count > 0).length,
  online_count: courseList.filter((course) => course.online).length,
  pass_fail_count: courseList.filter((course) => course.pass_fail).length,
  syllabus_count: courseList.filter((course) => course.syllabus_available).length,
  counts_by_classification: counts.counts_by_classification,
  counts_by_campus: counts.counts_by_campus,
};

for (const key of [
  "collection_count",
  "online_count",
  "pass_fail_count",
  "syllabus_count",
]) {
  if (summary[key] !== actual[key]) {
    errors.push(`${key} 불일치: actual=${actual[key]}, summary=${summary[key]}`);
  }
}

const validationFailed = errors.length > 0 || (strict && warnings.length > 0);
const report = {
  validated_at: new Date().toISOString(),
  data_dir: dataDir,
  strict,
  status: validationFailed ? "failed" : "ok",
  counts: actual,
  errors,
  warnings,
};
await fs.writeFile(
  path.join(dataDir, "validation.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
if (validationFailed) process.exitCode = 1;
