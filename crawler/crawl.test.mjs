import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCountsByCampus,
  buildCountsByClassification,
  deduplicateCourses,
  normalizeCourse,
  parseArgs,
  parseMeetings,
  postHufs,
} from "./crawl.mjs";

test("기본값은 2026년 2학기 양 캠퍼스이다", () => {
  const options = parseArgs([]);
  assert.equal(options.year, 2026);
  assert.equal(options.semester, 3);
  assert.equal(options.campus, "all");
});

test("서울 또는 글로벌캠퍼스만 명시적으로 선택할 수 있다", () => {
  assert.equal(parseArgs(["--campus", "H1"]).campus, "H1");
  assert.equal(parseArgs(["--campus", "H2"]).campus, "H2");
  assert.throws(() => parseArgs(["--campus", "H3"]), /all, H1, H2/);
});

test("요일·교시·강의실을 구조화한다", () => {
  assert.deepEqual(parseMeetings("월 1 2 (어문관 301) 수 3 (-)"), [
    { day: "월", periods: [1, 2], start_period: 1, end_period: 2, room: "어문관 301" },
    { day: "수", periods: [3], start_period: 3, end_period: 3, room: "" },
  ]);
});

test("강의실 괄호가 마지막에만 있어도 모든 요일을 보존한다", () => {
  assert.deepEqual(parseMeetings("화 1 2 금 4 (-)"), [
    { day: "화", periods: [1, 2], start_period: 1, end_period: 2, room: "" },
    { day: "금", periods: [4], start_period: 4, end_period: 4, room: "" },
  ]);
});

test("같은 요일의 중복 표기와 불연속 교시를 정확히 나눈다", () => {
  assert.deepEqual(parseMeetings("목 5 (-) 목 6 (-) 월 5 6 8 (-)"), [
    { day: "목", periods: [5, 6], start_period: 5, end_period: 6, room: "" },
    { day: "월", periods: [5, 6], start_period: 5, end_period: 6, room: "" },
    { day: "월", periods: [8], start_period: 8, end_period: 8, room: "" },
  ]);
});

test("이수구분·온라인·P/F·강의계획서 플래그를 정규화한다", () => {
  const course = normalizeCourse(
    {
      ledgYear: "2026",
      ledgSessn: "3",
      campus: "H2",
      lssnCd: "A12345601",
      subjtNaKr: "전공 데이터 기초",
      cyberFlag: "Y",
      eval: "1",
      syllabusFlag: "Y",
      orgSect: "A",
      dayTimeDisplay: "화 4 5 (공학관 101)",
    },
    {
      classification_code: "1",
      classification: "전공/부전공",
      area_code: "ATJA1",
      area: "컴퓨터공학전공",
      area_en: "Computer Engineering",
    },
    "2026-07-28T00:00:00.000Z",
    { year: 2026, semester: 3, campus: "H2" },
  );
  assert.equal(course.classification, "전공/부전공");
  assert.equal(course.campus_code, "H2");
  assert.equal(course.campus, "글로벌");
  assert.deepEqual(course.classification_types, ["전공/부전공"]);
  assert.equal(course.area_code, "ATJA1");
  assert.equal(course.online, true);
  assert.equal(course.pass_fail, true);
  assert.equal(course.syllabus_available, true);
  assert.match(course.syllabus_url, /lssn_cd=A12345601/);
  assert.equal(course.start_period, 4);
  assert.equal(course.end_period, 5);
});

test("서울캠퍼스 코드와 조회 경로를 서울로 정규화한다", () => {
  const course = normalizeCourse(
    {
      ledgYear: "2026",
      ledgSessn: "3",
      campus: "H1",
      lssnCd: "S12345601",
      subjtNaKr: "서울 강좌",
    },
    {
      campus_code: "H1",
      campus: "서울",
      classification_code: "2",
      classification: "교양",
      area_code: "SELA1",
      area: "서울 교양",
      area_en: "Seoul Liberal Arts",
    },
    "2026-08-02T00:00:00.000Z",
    { year: 2026, semester: 3, campus: "H1" },
  );

  assert.equal(course.campus_code, "H1");
  assert.equal(course.campus, "서울");
  assert.equal(course.query_contexts[0].campus_code, "H1");
  assert.equal(course.query_contexts[0].campus, "서울");
});

function courseFixture({ campusCode, courseCode, classification = "전공/부전공" }) {
  const classificationCode = {
    "전공/부전공": "1",
    교양: "2",
    기초: "3",
  }[classification];
  return {
    year: 2026,
    semester_code: 3,
    campus_code: campusCode,
    course_code: courseCode,
    classification_types: [classification],
    area_codes: [`${campusCode}-${classificationCode}`],
    area_names: [`${campusCode} 영역`],
    query_contexts: [{
      campus_code: campusCode,
      classification_code: classificationCode,
      area_code: `${campusCode}-${classificationCode}`,
    }],
    online: false,
    pass_fail: false,
    syllabus_available: false,
  };
}

test("같은 학수번호라도 캠퍼스가 다르면 별도 강좌로 보존한다", () => {
  const rows = [
    courseFixture({ campusCode: "H1", courseCode: "DUPLICATE01" }),
    courseFixture({ campusCode: "H2", courseCode: "DUPLICATE01" }),
  ];
  const result = deduplicateCourses(rows);

  assert.equal(result.courses.length, 2);
  assert.equal(result.duplicates.length, 0);
  assert.deepEqual(result.courses.map((course) => course.campus_code), ["H1", "H2"]);
});

test("양 캠퍼스 분류 집계를 전체와 캠퍼스별로 합산한다", () => {
  const courses = [
    courseFixture({ campusCode: "H1", courseCode: "S-MAJOR" }),
    courseFixture({ campusCode: "H1", courseCode: "S-LIB", classification: "교양" }),
    courseFixture({ campusCode: "H2", courseCode: "G-MAJOR" }),
    courseFixture({ campusCode: "H2", courseCode: "G-BASIC", classification: "기초" }),
  ];
  courses[0].online = true;
  courses[2].pass_fail = true;
  courses[3].syllabus_available = true;
  const collectionSummaries = [
    ["H1", "major", 2, 1],
    ["H1", "liberal", 1, 1],
    ["H1", "basic", 1, 0],
    ["H2", "major", 3, 1],
    ["H2", "liberal", 1, 0],
    ["H2", "basic", 2, 1],
  ].map(([campusCode, key, areaCount, rawCount]) => ({
    campus_code: campusCode,
    key,
    area_count: areaCount,
    raw_course_count: rawCount,
  }));
  const campuses = [
    { code: "H1", label: "서울", label_en: "Seoul" },
    { code: "H2", label: "글로벌", label_en: "Global" },
  ];

  const byClassification = buildCountsByClassification(courses, collectionSummaries);
  const byCampus = buildCountsByCampus(courses, collectionSummaries, campuses);

  assert.equal(byClassification.major.area_count, 5);
  assert.equal(byClassification.major.unique_course_count, 2);
  assert.equal(byClassification.liberal.unique_course_count, 1);
  assert.equal(byClassification.basic.unique_course_count, 1);
  assert.equal(byCampus.H1.unique_course_count, 2);
  assert.equal(byCampus.H1.online_count, 1);
  assert.equal(byCampus.H1.counts_by_classification.liberal.unique_course_count, 1);
  assert.equal(byCampus.H2.pass_fail_count, 1);
  assert.equal(byCampus.H2.syllabus_count, 1);
  assert.equal(byCampus.H2.counts_by_classification.basic.area_count, 2);
});

for (const errorName of ["AbortError", "TimeoutError", "TypeError"]) {
  test(`${errorName} 요청 오류 뒤에 학교 API를 재시도한다`, async () => {
    let requestCount = 0;
    const delays = [];
    const payload = await postHufs(
      { mName: "test" },
      1,
      {
        fetchImpl: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            if (errorName === "TypeError") throw new TypeError("fetch failed");
            const error = new Error("request aborted");
            error.name = errorName;
            throw error;
          }
          return new Response(JSON.stringify({ rtnCode: "1", data: [] }));
        },
        sleepImpl: async (milliseconds) => delays.push(milliseconds),
      },
    );

    assert.equal(requestCount, 2);
    assert.deepEqual(delays, [1_000]);
    assert.deepEqual(payload.data, []);
  });
}
