#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_YEAR = 2026;
const EXPECTED_SEMESTER = 3;
const MINIMUM_TOTAL_COURSE_COUNT = 2_700;
const MINIMUM_RATIO = 0.8;
const MAXIMUM_RATIO = 1.25;

export const CLASSIFICATIONS = [
  { key: "major", code: "1", label: "전공/부전공" },
  { key: "liberal", code: "2", label: "교양" },
  { key: "basic", code: "3", label: "기초" },
];

export const CAMPUS_RULES = {
  H1: {
    label: "서울",
    minimumCourseCount: 1_400,
    minimumAreaCount: 100,
    classifications: {
      major: { minimumCourseCount: 1_000, minimumAreaCount: 60 },
      liberal: { minimumCourseCount: 300, minimumAreaCount: 12 },
      basic: { minimumCourseCount: 60, minimumAreaCount: 25 },
    },
  },
  H2: {
    label: "글로벌",
    minimumCourseCount: 1_200,
    minimumAreaCount: 95,
    classifications: {
      major: { minimumCourseCount: 900, minimumAreaCount: 70 },
      liberal: { minimumCourseCount: 300, minimumAreaCount: 12 },
      basic: { minimumCourseCount: 35, minimumAreaCount: 12 },
    },
  },
};

const EXPECTED_CAMPUS_CODES = Object.keys(CAMPUS_RULES);

function emptyClassificationCounts() {
  return Object.fromEntries(CLASSIFICATIONS.map(({ key, code, label }) => [
    key,
    { code, label, unique_course_count: 0, area_count: 0 },
  ]));
}

function sameStringSet(actual, expected) {
  if (!Array.isArray(actual)) return false;
  const normalized = [...new Set(actual.map(String))].sort();
  return normalized.length === expected.length &&
    normalized.every((value, index) => value === expected[index]);
}

function addCount(container, key) {
  container[key].unique_course_count += 1;
}

function classificationForArea(area) {
  return CLASSIFICATIONS.find(({ code }) => code === String(area?.classification_code ?? ""));
}

export function analyzeDataset(courses, areas = []) {
  const courseList = Array.isArray(courses) ? courses : [];
  const campusCodes = [...new Set(courseList
    .map((course) => String(course?.campus_code ?? ""))
    .filter(Boolean))].sort();
  const allCampusCodes = [...new Set([...EXPECTED_CAMPUS_CODES, ...campusCodes])];
  const countsByClassification = emptyClassificationCounts();
  const countsByCampus = Object.fromEntries(allCampusCodes.map((campusCode) => [
    campusCode,
    {
      campus: CAMPUS_RULES[campusCode]?.label ?? "",
      unique_course_count: 0,
      area_count: 0,
      online_count: 0,
      pass_fail_count: 0,
      syllabus_count: 0,
      counts_by_classification: emptyClassificationCounts(),
    },
  ]));

  for (const course of courseList) {
    const campusCode = String(course?.campus_code ?? "");
    if (!countsByCampus[campusCode]) continue;
    countsByCampus[campusCode].unique_course_count += 1;
    if (course.online) countsByCampus[campusCode].online_count += 1;
    if (course.pass_fail) countsByCampus[campusCode].pass_fail_count += 1;
    if (course.syllabus_available) countsByCampus[campusCode].syllabus_count += 1;
    const types = Array.isArray(course.classification_types)
      ? course.classification_types
      : [];
    for (const classification of CLASSIFICATIONS) {
      if (!types.includes(classification.label)) continue;
      addCount(countsByClassification, classification.key);
      addCount(
        countsByCampus[campusCode].counts_by_classification,
        classification.key,
      );
    }
  }

  const areaKeys = new Set();
  const duplicateAreaKeys = [];
  const invalidAreas = [];
  for (const [index, area] of (Array.isArray(areas) ? areas : []).entries()) {
    const campusCode = String(area?.campus_code ?? "");
    const areaCode = String(area?.code ?? area?.area_code ?? "");
    const classification = classificationForArea(area);
    if (!campusCode || !areaCode || !classification || !countsByCampus[campusCode]) {
      invalidAreas.push(index + 1);
      continue;
    }
    const key = `${campusCode}:${classification.code}:${areaCode}`;
    if (areaKeys.has(key)) {
      duplicateAreaKeys.push(key);
      continue;
    }
    areaKeys.add(key);
    countsByClassification[classification.key].area_count += 1;
    countsByCampus[campusCode].area_count += 1;
    countsByCampus[campusCode]
      .counts_by_classification[classification.key].area_count += 1;
  }

  return {
    unique_course_count: courseList.length,
    campus_codes: campusCodes,
    campus_count: campusCodes.length,
    area_count: areaKeys.size,
    counts_by_classification: countsByClassification,
    counts_by_campus: countsByCampus,
    area_keys: areaKeys,
    duplicate_area_keys: duplicateAreaKeys,
    invalid_areas: invalidAreas,
  };
}

function assertEqual(actual, expected, label, errors) {
  if (actual !== expected) {
    errors.push(`${label} 불일치: actual=${actual}, summary=${expected}`);
  }
}

function assertRatio(candidate, current, label, errors) {
  if (!current) return;
  const ratio = candidate / current;
  if (ratio < MINIMUM_RATIO || ratio > MAXIMUM_RATIO) {
    errors.push(
      `${label} 수가 기존 대비 허용 범위를 벗어났습니다: ` +
      `${current} → ${candidate} (${(ratio * 100).toFixed(1)}%)`,
    );
  }
}

function compareClassificationSummary(actual, summary, prefix, errors) {
  for (const classification of CLASSIFICATIONS) {
    const actualItem = actual?.[classification.key];
    const summaryItem = summary?.[classification.key];
    assertEqual(
      actualItem?.unique_course_count,
      summaryItem?.unique_course_count,
      `${prefix}${classification.label} 고유 강좌 수`,
      errors,
    );
    assertEqual(
      actualItem?.area_count,
      summaryItem?.area_count,
      `${prefix}${classification.label} 조회 영역 수`,
      errors,
    );
  }
}

function validateSummaryCounts(actual, summary, errors) {
  assertEqual(
    actual.unique_course_count,
    summary.unique_course_count,
    "후보 강좌 수",
    errors,
  );
  assertEqual(actual.campus_count, summary.campus_count, "캠퍼스 수", errors);
  assertEqual(
    CLASSIFICATIONS.length,
    summary.collection_count,
    "이수구분 컬렉션 수",
    errors,
  );
  if (!sameStringSet(summary.campus_codes, actual.campus_codes)) {
    errors.push(
      `캠퍼스 코드 불일치: actual=${actual.campus_codes.join(",")}, ` +
      `summary=${JSON.stringify(summary.campus_codes)}`,
    );
  }
  assertEqual(actual.area_count, summary.area_count, "전체 조회 영역 수", errors);
  compareClassificationSummary(
    actual.counts_by_classification,
    summary.counts_by_classification,
    "전체 ",
    errors,
  );

  for (const campusCode of EXPECTED_CAMPUS_CODES) {
    const actualCampus = actual.counts_by_campus[campusCode];
    const summaryCampus = summary.counts_by_campus?.[campusCode];
    assertEqual(
      actualCampus.unique_course_count,
      summaryCampus?.unique_course_count,
      `${campusCode} 강좌 수`,
      errors,
    );
    assertEqual(
      actualCampus.area_count,
      summaryCampus?.area_count,
      `${campusCode} 조회 영역 수`,
      errors,
    );
    for (const [field, label] of [
      ["online_count", "온라인 강좌 수"],
      ["pass_fail_count", "P/F 강좌 수"],
      ["syllabus_count", "강의계획서 수"],
    ]) {
      assertEqual(
        actualCampus[field],
        summaryCampus?.[field],
        `${campusCode} ${label}`,
        errors,
      );
    }
    const summaryCampusLabel = summaryCampus?.campus ?? summaryCampus?.label;
    if (summaryCampusLabel !== CAMPUS_RULES[campusCode].label) {
      errors.push(
        `${campusCode} 캠퍼스명이 올바르지 않습니다: ` +
        `${summaryCampusLabel ?? "누락"}`,
      );
    }
    compareClassificationSummary(
      actualCampus.counts_by_classification,
      summaryCampus?.counts_by_classification,
      `${campusCode} `,
      errors,
    );
  }
}

function validateCourses(courses, summary, actual, errors) {
  const uniqueKeys = new Set();
  for (const [index, course] of courses.entries()) {
    const row = index + 1;
    const campusCode = String(course?.campus_code ?? "");
    const key = `${course?.year}-${course?.semester_code}-${campusCode}-${course?.course_code}`;
    if (uniqueKeys.has(key)) errors.push(`${row}행 강좌 복합키 중복: ${key}`);
    uniqueKeys.add(key);

    if (!course?.course_code) errors.push(`${row}행 학수번호 누락`);
    if (course?.year !== EXPECTED_YEAR || course?.year !== summary.year) {
      errors.push(`${row}행 년도 불일치: ${course?.year}`);
    }
    if (
      course?.semester_code !== EXPECTED_SEMESTER ||
      course?.semester_code !== summary.semester_code
    ) {
      errors.push(`${row}행 학기 불일치: ${course?.semester_code}`);
    }
    const campusRule = CAMPUS_RULES[campusCode];
    if (!campusRule) {
      errors.push(`${row}행 알 수 없는 캠퍼스: ${campusCode || "누락"}`);
    } else if (course.campus !== campusRule.label) {
      errors.push(
        `${row}행 캠퍼스명 불일치: ${campusCode}/${course.campus ?? "누락"}`,
      );
    }
    if (!Array.isArray(course?.classification_types) ||
      course.classification_types.length === 0) {
      errors.push(`${row}행 전체이수구분 누락`);
    } else {
      const unknownType = course.classification_types.find((type) =>
        !CLASSIFICATIONS.some(({ label }) => label === type));
      if (unknownType) errors.push(`${row}행 알 수 없는 이수구분: ${unknownType}`);
    }
    if (!Array.isArray(course?.query_contexts) || course.query_contexts.length === 0) {
      errors.push(`${row}행 조회경로 누락`);
      continue;
    }
    for (const context of course.query_contexts) {
      const areaKey = `${campusCode}:${context?.classification_code}:${context?.area_code}`;
      if (!actual.area_keys.has(areaKey)) {
        errors.push(`${row}행 조회경로에 대응하는 영역이 없습니다: ${areaKey}`);
      }
    }
  }
}

function enforceAbsoluteMinimums(actual, errors) {
  if (actual.unique_course_count < MINIMUM_TOTAL_COURSE_COUNT) {
    errors.push(
      `전체 강좌가 안전 기준보다 적습니다: ${actual.unique_course_count} < ` +
      `${MINIMUM_TOTAL_COURSE_COUNT}`,
    );
  }
  for (const campusCode of EXPECTED_CAMPUS_CODES) {
    const rule = CAMPUS_RULES[campusCode];
    const campus = actual.counts_by_campus[campusCode];
    if (campus.unique_course_count < rule.minimumCourseCount) {
      errors.push(
        `${campusCode} 강좌가 안전 기준보다 적습니다: ` +
        `${campus.unique_course_count} < ${rule.minimumCourseCount}`,
      );
    }
    if (campus.area_count < rule.minimumAreaCount) {
      errors.push(
        `${campusCode} 조회 영역이 안전 기준보다 적습니다: ` +
        `${campus.area_count} < ${rule.minimumAreaCount}`,
      );
    }
    for (const classification of CLASSIFICATIONS) {
      const minimum = rule.classifications[classification.key];
      const count = campus.counts_by_classification[classification.key];
      if (count.unique_course_count < minimum.minimumCourseCount) {
        errors.push(
          `${campusCode} ${classification.label} 강좌가 안전 기준보다 적습니다: ` +
          `${count.unique_course_count} < ${minimum.minimumCourseCount}`,
        );
      }
      if (count.area_count < minimum.minimumAreaCount) {
        errors.push(
          `${campusCode} ${classification.label} 조회 영역이 안전 기준보다 적습니다: ` +
          `${count.area_count} < ${minimum.minimumAreaCount}`,
        );
      }
    }
  }
}

function compareWithCurrent(candidate, currentCourses, errors) {
  if (!Array.isArray(currentCourses) || currentCourses.length === 0) return;
  const current = analyzeDataset(currentCourses);
  const currentCodes = current.campus_codes;
  const isIntegrated = EXPECTED_CAMPUS_CODES.every((code) => currentCodes.includes(code));
  const isLegacyH2 = currentCodes.length === 1 && currentCodes[0] === "H2";

  if (isIntegrated) {
    assertRatio(
      candidate.unique_course_count,
      current.unique_course_count,
      "전체 강좌",
      errors,
    );
    for (const classification of CLASSIFICATIONS) {
      assertRatio(
        candidate.counts_by_classification[classification.key].unique_course_count,
        current.counts_by_classification[classification.key].unique_course_count,
        `전체 ${classification.label}`,
        errors,
      );
    }
  }

  const campusesToCompare = isLegacyH2
    ? ["H2"]
    : EXPECTED_CAMPUS_CODES.filter((code) => currentCodes.includes(code));
  for (const campusCode of campusesToCompare) {
    const candidateCampus = candidate.counts_by_campus[campusCode];
    const currentCampus = current.counts_by_campus[campusCode];
    assertRatio(
      candidateCampus.unique_course_count,
      currentCampus.unique_course_count,
      `${campusCode} 강좌`,
      errors,
    );
    for (const classification of CLASSIFICATIONS) {
      assertRatio(
        candidateCampus.counts_by_classification[classification.key].unique_course_count,
        currentCampus.counts_by_classification[classification.key].unique_course_count,
        `${campusCode} ${classification.label}`,
        errors,
      );
    }
  }
}

export function inspectCandidate(candidateCourses, candidateSummary, currentCourses = []) {
  const errors = [];
  if (!Array.isArray(candidateCourses)) {
    return {
      errors: ["후보 courses.json이 배열이 아닙니다."],
      counts: analyzeDataset([]),
    };
  }
  if (!candidateSummary || typeof candidateSummary !== "object" ||
    Array.isArray(candidateSummary)) {
    return {
      errors: ["후보 summary.json이 객체가 아닙니다."],
      counts: analyzeDataset(candidateCourses),
    };
  }

  if (candidateSummary.year !== EXPECTED_YEAR ||
    candidateSummary.semester_code !== EXPECTED_SEMESTER) {
    errors.push("후보 데이터 범위가 2026년 2학기와 일치하지 않습니다.");
  }
  if (!Number.isFinite(Date.parse(candidateSummary.collected_at))) {
    errors.push("후보 데이터 수집 시각이 올바르지 않습니다.");
  }
  if (!Array.isArray(candidateSummary.areas)) {
    errors.push("후보 summary.json의 areas가 배열이 아닙니다.");
  }

  const actual = analyzeDataset(candidateCourses, candidateSummary.areas);
  if (!sameStringSet(actual.campus_codes, EXPECTED_CAMPUS_CODES)) {
    errors.push(
      `후보 데이터에 H1/H2 캠퍼스가 모두 필요합니다: ` +
      `${actual.campus_codes.join(",") || "없음"}`,
    );
  }
  if (actual.invalid_areas.length > 0) {
    errors.push(
      `캠퍼스/이수구분/영역 코드가 잘못된 조회 영역이 있습니다: ` +
      `${actual.invalid_areas.slice(0, 10).join(",")}`,
    );
  }
  if (actual.duplicate_area_keys.length > 0) {
    errors.push(
      `중복 조회 영역 복합키가 있습니다: ` +
      `${actual.duplicate_area_keys.slice(0, 10).join(",")}`,
    );
  }

  validateCourses(candidateCourses, candidateSummary, actual, errors);
  validateSummaryCounts(actual, candidateSummary, errors);
  enforceAbsoluteMinimums(actual, errors);
  compareWithCurrent(actual, currentCourses, errors);

  return { errors, counts: actual };
}

export function verifyCandidate(candidateCourses, candidateSummary, currentCourses = []) {
  const { errors, counts } = inspectCandidate(
    candidateCourses,
    candidateSummary,
    currentCourses,
  );
  if (errors.length > 0) {
    throw new Error(`자동 갱신 안전 검사 실패:\n- ${errors.join("\n- ")}`);
  }
  return {
    collected_at: candidateSummary.collected_at,
    unique_course_count: counts.unique_course_count,
    campus_codes: counts.campus_codes,
    campus_count: counts.campus_count,
    area_count: counts.area_count,
    counts_by_classification: counts.counts_by_classification,
    counts_by_campus: counts.counts_by_campus,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readCurrentCourses(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function promote(candidateDir, publishedDir) {
  const candidateCoursesPath = path.join(candidateDir, "courses.json");
  const candidateSummaryPath = path.join(candidateDir, "summary.json");
  const publishedCoursesPath = path.join(publishedDir, "courses.json");
  const publishedSummaryPath = path.join(publishedDir, "summary.json");

  const [candidateCoursesText, candidateSummaryText, currentCourses] =
    await Promise.all([
      fs.readFile(candidateCoursesPath, "utf8"),
      fs.readFile(candidateSummaryPath, "utf8"),
      readCurrentCourses(publishedCoursesPath),
    ]);
  const candidateCourses = JSON.parse(candidateCoursesText);
  const candidateSummary = JSON.parse(candidateSummaryText);
  const report = verifyCandidate(candidateCourses, candidateSummary, currentCourses);

  await fs.mkdir(publishedDir, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const temporaryCoursesPath = `${publishedCoursesPath}.${suffix}.tmp`;
  const temporarySummaryPath = `${publishedSummaryPath}.${suffix}.tmp`;

  await Promise.all([
    fs.writeFile(temporaryCoursesPath, candidateCoursesText, "utf8"),
    fs.writeFile(temporarySummaryPath, candidateSummaryText, "utf8"),
  ]);
  await fs.rename(temporaryCoursesPath, publishedCoursesPath);
  await fs.rename(temporarySummaryPath, publishedSummaryPath);

  return report;
}

async function main() {
  const candidateDir = path.resolve(
    process.argv[2] || path.join(PROJECT_DIR, "data"),
  );
  const publishedDir = path.resolve(
    process.argv[3] || path.join(PROJECT_DIR, "..", "public", "data"),
  );
  const report = await promote(candidateDir, publishedDir);
  console.log(`웹 데이터 승격 완료:\n${JSON.stringify(report, null, 2)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
