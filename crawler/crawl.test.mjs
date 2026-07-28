import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCourse, parseArgs, parseMeetings } from "./crawl.mjs";

test("기본값은 2026년 2학기 글로벌캠퍼스이다", () => {
  const options = parseArgs([]);
  assert.equal(options.year, 2026);
  assert.equal(options.semester, 3);
  assert.equal(options.campus, "H2");
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
  assert.deepEqual(course.classification_types, ["전공/부전공"]);
  assert.equal(course.area_code, "ATJA1");
  assert.equal(course.online, true);
  assert.equal(course.pass_fail, true);
  assert.equal(course.syllabus_available, true);
  assert.match(course.syllabus_url, /lssn_cd=A12345601/);
  assert.equal(course.start_period, 4);
  assert.equal(course.end_period, 5);
});
