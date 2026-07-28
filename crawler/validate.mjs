#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.argv[2] || path.join(projectDir, "data"));
const courses = JSON.parse(await fs.readFile(path.join(dataDir, "courses.json"), "utf8"));
const summary = JSON.parse(await fs.readFile(path.join(dataDir, "summary.json"), "utf8"));

const expectedClassifications = ["전공/부전공", "교양", "기초"];
const errors = [];
const warnings = [];
const courseKeys = new Set();

if (!Array.isArray(courses)) errors.push("courses.json이 배열이 아닙니다.");
if (courses.length !== summary.unique_course_count) {
  errors.push(`강좌 수 불일치: courses=${courses.length}, summary=${summary.unique_course_count}`);
}

for (const [index, course] of courses.entries()) {
  const row = index + 1;
  const key = `${course.year}-${course.semester_code}-${course.course_code}`;
  if (courseKeys.has(key)) errors.push(`${row}행 학수번호 중복: ${key}`);
  courseKeys.add(key);
  if (!course.course_code) errors.push(`${row}행 학수번호 누락`);
  if (!course.course_name_ko && !course.course_name_en) errors.push(`${row}행 교과목명 누락`);
  if (!course.classification_code || !course.classification) {
    errors.push(`${row}행 이수구분 누락`);
  }
  if (!course.area_code || !course.area) errors.push(`${row}행 조회영역 누락`);
  if (!Array.isArray(course.classification_types) || course.classification_types.length === 0) {
    errors.push(`${row}행 전체이수구분 누락`);
  }
  if (!Array.isArray(course.query_contexts) || course.query_contexts.length === 0) {
    errors.push(`${row}행 조회경로 누락`);
  }
  const unknownType = course.classification_types.find(
    (type) => !expectedClassifications.includes(type),
  );
  if (unknownType) errors.push(`${row}행 알 수 없는 이수구분: ${unknownType}`);
  if (course.year !== summary.year) errors.push(`${row}행 년도 불일치: ${course.year}`);
  if (course.semester_code !== summary.semester_code) {
    errors.push(`${row}행 학기 불일치: ${course.semester_code}`);
  }
  if (course.campus_code !== "H2") errors.push(`${row}행 캠퍼스 불일치: ${course.campus_code}`);
  if (typeof course.online !== "boolean" || typeof course.pass_fail !== "boolean") {
    errors.push(`${row}행 온라인/PF 타입 오류`);
  }
  if (course.syllabus_available !== Boolean(course.syllabus_url)) {
    errors.push(`${row}행 강의계획서 플래그/URL 불일치`);
  }
}

const unparsedSchedules = courses
  .filter((course) =>
    course.schedule &&
    course.meetings.length === 0 &&
    !/미정|온라인|없음|비대면/.test(course.schedule))
  .map((course) => ({ course_code: course.course_code, schedule: course.schedule }));
if (unparsedSchedules.length > 0) {
  warnings.push({
    type: "시간 형식 미파싱",
    count: unparsedSchedules.length,
    samples: unparsedSchedules.slice(0, 10),
  });
}

const uniqueByClassification = Object.fromEntries(expectedClassifications.map((classification) => [
  classification,
  courses.filter((course) => course.classification_types.includes(classification)).length,
]));
const actual = {
  unique_course_count: courses.length,
  collection_count: Object.values(uniqueByClassification).filter((count) => count > 0).length,
  online_count: courses.filter((course) => course.online).length,
  pass_fail_count: courses.filter((course) => course.pass_fail).length,
  syllabus_count: courses.filter((course) => course.syllabus_available).length,
  unique_by_classification: uniqueByClassification,
};
for (const key of [
  "unique_course_count",
  "collection_count",
  "online_count",
  "pass_fail_count",
  "syllabus_count",
]) {
  if (summary[key] !== actual[key]) {
    errors.push(`${key} 불일치: actual=${actual[key]}, summary=${summary[key]}`);
  }
}
for (const [key, classification] of [
  ["major", "전공/부전공"],
  ["liberal", "교양"],
  ["basic", "기초"],
]) {
  const expected = summary.counts_by_classification?.[key]?.unique_course_count;
  const observed = uniqueByClassification[classification];
  if (expected !== observed) {
    errors.push(`${classification} 고유 강좌 수 불일치: actual=${observed}, summary=${expected}`);
  }
}

const report = {
  validated_at: new Date().toISOString(),
  data_dir: dataDir,
  status: errors.length === 0 ? "ok" : "failed",
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
if (errors.length > 0) process.exitCode = 1;
