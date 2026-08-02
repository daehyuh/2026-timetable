import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDataset,
  CAMPUS_RULES,
  CLASSIFICATIONS,
  verifyCandidate,
} from "./promote.mjs";

const h1Specs = {
  major: { courseCount: 1_100, areaCount: 65 },
  liberal: { courseCount: 330, areaCount: 13 },
  basic: { courseCount: 70, areaCount: 27 },
};

const h2Specs = {
  major: { courseCount: 950, areaCount: 73 },
  liberal: { courseCount: 310, areaCount: 14 },
  basic: { courseCount: 40, areaCount: 13 },
};

function syntheticCampusCourses(campusCode, specs, prefix = campusCode) {
  const campus = CAMPUS_RULES[campusCode].label;
  const courses = [];
  for (const classification of CLASSIFICATIONS) {
    const { courseCount, areaCount } = specs[classification.key];
    for (let index = 0; index < courseCount; index += 1) {
      const areaIndex = index % areaCount;
      const areaCode = `${prefix}-${classification.code}-${areaIndex}`;
      const area = `${campus} ${classification.label} 영역 ${areaIndex}`;
      courses.push({
        year: 2026,
        semester_code: 3,
        campus_code: campusCode,
        campus,
        course_code: `${prefix}-${classification.code}-COURSE-${index}`,
        course_name_ko: `${campus} 테스트 강좌 ${index}`,
        classification_code: classification.code,
        classification: classification.label,
        classification_types: [classification.label],
        area_code: areaCode,
        area,
        query_contexts: [{
          classification_code: classification.code,
          classification: classification.label,
          area_code: areaCode,
          area,
        }],
      });
    }
  }
  return courses;
}

function areasFromCourses(courses) {
  const seen = new Map();
  for (const course of courses) {
    for (const context of course.query_contexts) {
      const key = `${course.campus_code}:${context.classification_code}:${context.area_code}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        campus_code: course.campus_code,
        campus: `(${CAMPUS_RULES[course.campus_code].label})`,
        classification_code: context.classification_code,
        classification: context.classification,
        code: context.area_code,
        name: context.area,
      });
    }
  }
  return [...seen.values()];
}

function enrichClassifications(counts) {
  return Object.fromEntries(Object.entries(counts).map(([key, item]) => [
    key,
    { ...item, raw_course_count: item.unique_course_count },
  ]));
}

function summaryFor(candidateCourses, overrides = {}) {
  const areas = areasFromCourses(candidateCourses);
  const actual = analyzeDataset(candidateCourses, areas);
  const countsByCampus = Object.fromEntries(
    Object.entries(actual.counts_by_campus).map(([campusCode, item]) => [
      campusCode,
      {
        ...item,
        raw_course_count: item.unique_course_count,
        counts_by_classification: enrichClassifications(item.counts_by_classification),
      },
    ]),
  );
  return {
    year: 2026,
    semester_code: 3,
    campus_code: "ALL",
    campus_codes: actual.campus_codes,
    campus_count: actual.campus_count,
    collected_at: "2026-08-02T12:00:00.000Z",
    collection_count: 3,
    area_count: actual.area_count,
    unique_course_count: actual.unique_course_count,
    counts_by_classification: enrichClassifications(actual.counts_by_classification),
    counts_by_campus: countsByCampus,
    areas,
    ...overrides,
  };
}

const h1Courses = syntheticCampusCourses("H1", h1Specs);
const legacyH2Courses = syntheticCampusCourses("H2", h2Specs);
const integratedCourses = [...h1Courses, ...legacyH2Courses];

test("기존 H2 전용 데이터에서 최초 통합 후보로 승격할 수 있다", () => {
  const candidateSummary = summaryFor(integratedCourses);
  const report = verifyCandidate(
    integratedCourses,
    candidateSummary,
    legacyH2Courses,
  );

  assert.deepEqual(report.campus_codes, ["H1", "H2"]);
  assert.equal(report.campus_count, 2);
  assert.equal(report.unique_course_count, integratedCourses.length);
  assert.equal(report.counts_by_campus.H1.unique_course_count, h1Courses.length);
  assert.equal(report.counts_by_campus.H2.unique_course_count, legacyH2Courses.length);
});

test("같은 학수번호라도 캠퍼스가 다르면 별도 강좌로 인정한다", () => {
  const candidate = structuredClone(integratedCourses);
  const h1Course = candidate.find((course) => course.campus_code === "H1");
  const h2Course = candidate.find((course) => course.campus_code === "H2");
  h1Course.course_code = h2Course.course_code;

  assert.doesNotThrow(() =>
    verifyCandidate(candidate, summaryFor(candidate), legacyH2Courses));
});

test("같은 캠퍼스의 강좌 복합키 중복은 차단한다", () => {
  const candidate = [...integratedCourses, structuredClone(h1Courses[0])];

  assert.throws(
    () => verifyCandidate(candidate, summaryFor(candidate)),
    /강좌 복합키 중복/,
  );
});

test("H1 또는 H2가 빠진 후보는 공개하지 않는다", () => {
  assert.throws(
    () => verifyCandidate(legacyH2Courses, summaryFor(legacyH2Courses)),
    /H1\/H2 캠퍼스가 모두 필요합니다/,
  );
});

test("캠퍼스별 요약 강좌·분류·영역 수 불일치는 차단한다", () => {
  const candidateSummary = summaryFor(integratedCourses);
  candidateSummary.counts_by_campus.H1.counts_by_classification.major.area_count -= 1;

  assert.throws(
    () => verifyCandidate(integratedCourses, candidateSummary),
    /H1 전공\/부전공 조회 영역 수 불일치/,
  );
});

test("통합 공개 데이터 대비 특정 캠퍼스가 급감하면 차단한다", () => {
  const largerH1 = syntheticCampusCourses(
    "H1",
    { major: { courseCount: 1_600, areaCount: 65 }, liberal: h1Specs.liberal,
      basic: h1Specs.basic },
    "H1-CURRENT",
  );
  const currentIntegrated = [...largerH1, ...legacyH2Courses];

  assert.throws(
    () => verifyCandidate(
      integratedCourses,
      summaryFor(integratedCourses),
      currentIntegrated,
    ),
    /H1 (강좌|전공\/부전공).*허용 범위/,
  );
});

test("절대 안전 하한보다 작은 서울 후보는 차단한다", () => {
  const undersizedH1 = syntheticCampusCourses("H1", {
    major: { courseCount: 1_000, areaCount: 60 },
    liberal: { courseCount: 300, areaCount: 12 },
    basic: { courseCount: 50, areaCount: 25 },
  }, "H1-SMALL");
  const candidate = [...undersizedH1, ...legacyH2Courses];

  assert.throws(
    () => verifyCandidate(candidate, summaryFor(candidate)),
    /H1 강좌가 안전 기준보다 적습니다/,
  );
});

test("다른 학기 데이터는 공개하지 않는다", () => {
  assert.throws(
    () => verifyCandidate(
      integratedCourses,
      summaryFor(integratedCourses, { semester_code: 1 }),
    ),
    /데이터 범위/,
  );
});
