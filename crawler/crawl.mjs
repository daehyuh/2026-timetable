#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SOURCE_PAGE = "https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp";
const API_URL = "https://wis.hufs.ac.kr/hufs";
const DEFAULTS = {
  year: 2026,
  semester: 3,
  campus: "H2",
  delayMs: 350,
  outputDir: path.join(path.dirname(fileURLToPath(import.meta.url)), "data"),
};

const COLLECTIONS = [
  {
    key: "major",
    code: "1",
    label: "전공/부전공",
    listProcess: "process3_1a",
    codeField: "hakkwaCode1",
    nameField: "hakkwaName1",
    nameEnField: "hakkwaName1E",
    campusField: "campusName1",
    extraListParams: { org_sect: "A" },
  },
  {
    key: "liberal",
    code: "2",
    label: "교양",
    listProcess: "process4_1a",
    codeField: "fieldCode2",
    nameField: "fieldName2",
    nameEnField: "fieldName2E",
    campusField: "campusName2",
    extraListParams: {},
  },
  {
    key: "basic",
    code: "3",
    label: "기초",
    listProcess: "process4_1b",
    codeField: "fieldCode2",
    nameField: "fieldName2",
    nameEnField: "fieldName2E",
    campusField: "campusName2",
    extraListParams: {},
  },
];

const CSV_COLUMNS = [
  ["year", "년도"],
  ["semester_code", "학기코드"],
  ["semester", "학기"],
  ["campus_code", "캠퍼스코드"],
  ["campus", "캠퍼스"],
  ["classification_code", "이수구분코드"],
  ["classification", "이수구분"],
  ["classification_types", "전체이수구분"],
  ["area_code", "조회영역코드"],
  ["area", "조회영역"],
  ["area_en", "조회영역_영문"],
  ["area_codes", "전체조회영역코드"],
  ["area_names", "전체조회영역"],
  ["curriculum_field_code", "개설영역코드"],
  ["curriculum_field", "개설영역"],
  ["target_grade", "학년"],
  ["course_code", "학수번호"],
  ["course_name_ko", "교과목명"],
  ["course_name_en", "교과목명_영문"],
  ["professor_ko", "담당교수"],
  ["professor_en", "담당교수_영문"],
  ["credits", "학점"],
  ["hours", "시간"],
  ["schedule", "강의시간_강의실"],
  ["schedule_en", "강의시간_강의실_영문"],
  ["meeting_days", "요일"],
  ["start_period", "시작교시"],
  ["end_period", "종료교시"],
  ["online", "온라인"],
  ["pass_fail", "P_F"],
  ["original_language", "원어강의"],
  ["language", "강의언어"],
  ["team_teaching", "팀티칭"],
  ["required", "전공필수"],
  ["mooc", "MOOC"],
  ["syllabus_available", "강의계획서_제공"],
  ["syllabus_url", "강의계획서_URL"],
  ["department_code", "개설조직코드"],
  ["department", "개설조직"],
  ["enrollment_count", "수강인원"],
  ["enrollment_limit", "제한인원"],
  ["basket_count", "장바구니인원"],
  ["notes", "비고"],
  ["meetings", "시간구조_JSON"],
  ["query_contexts", "조회경로_JSON"],
  ["source_url", "출처_URL"],
  ["collected_at", "수집시각"],
];

function printHelp() {
  console.log(`HUFS 글로벌캠퍼스 전체 강좌 크롤러

사용법:
  node crawl.mjs [옵션]

옵션:
  --year <년도>          기본값: 2026
  --semester <코드>      1=1학기, 2=여름, 3=2학기, 4=겨울 (기본값: 3)
  --delay-ms <밀리초>    영역별 요청 사이 대기 (기본값: 350)
  --output-dir <경로>    결과 폴더 (기본값: ./data)
  --help                 도움말

학부(A), 글로벌캠퍼스(H2)의 전공/부전공·교양·기초 전체 영역을 합쳐 수집합니다.`);
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") options.help = true;
    else if (arg === "--year") options.year = Number(argv[++index]);
    else if (arg === "--semester") options.semester = Number(argv[++index]);
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index]);
    else if (arg === "--output-dir") options.outputDir = path.resolve(argv[++index]);
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  if (!Number.isInteger(options.year) || options.year < 1999 || options.year > 2100) {
    throw new Error("--year는 1999~2100 사이의 정수여야 합니다.");
  }
  if (![1, 2, 3, 4].includes(options.semester)) {
    throw new Error("--semester는 1, 2, 3, 4 중 하나여야 합니다.");
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 200) {
    throw new Error("--delay-ms는 서버 부담을 줄이기 위해 200 이상이어야 합니다.");
  }
  return options;
}

function semesterLabel(code) {
  return { 1: "1학기", 2: "여름학기", 3: "2학기", 4: "겨울학기" }[code] ?? String(code);
}

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function nullableNumber(value) {
  const text = clean(value);
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function yes(value) {
  return clean(value).toUpperCase() === "Y";
}

function decodeResponse(raw) {
  let decoded = raw;
  for (let count = 0; count < 2; count += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(decoded)) break;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return JSON.parse(decoded);
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postHufs(parameters, attempt = 1) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "user-agent": "HUFS-course-data-collector/2.0 (low-rate academic schedule lookup)",
      referer: SOURCE_PAGE,
    },
    body: new URLSearchParams(parameters),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    if (attempt < 3 && response.status >= 500) {
      await sleep(750 * attempt);
      return postHufs(parameters, attempt + 1);
    }
    throw new Error(`HUFS API 응답 오류: HTTP ${response.status}`);
  }
  const payload = decodeResponse(await response.text());
  if (String(payload.rtnCode ?? "1") !== "1") {
    throw new Error(`HUFS API 처리 오류: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  return payload;
}

function asArray(payload) {
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && typeof payload.data === "object") return [payload.data];
  return [];
}

export function parseMeetings(scheduleValue) {
  const schedule = clean(scheduleValue);
  const groupedPeriods = new Map();
  const pattern =
    /([월화수목금토일])\s*((?:\d{1,2}\s*)+?)(?=\s*(?:\([^)]*\)|[월화수목금토일]|$))(?:\s*\(([^)]*)\))?/g;

  for (const match of schedule.matchAll(pattern)) {
    const periods = [
      ...new Set(match[2].match(/\d+/g)?.map(Number) ?? []),
    ].sort((a, b) => a - b);
    if (periods.length === 0) continue;
    const cleanedRoom = clean(match[3]) === "-" ? "" : clean(match[3]);
    const groupKey = `${match[1]}\u0000${cleanedRoom}`;
    const group = groupedPeriods.get(groupKey) ?? {
      day: match[1],
      room: cleanedRoom,
      periods: new Set(),
    };
    periods.forEach((period) => group.periods.add(period));
    groupedPeriods.set(groupKey, group);
  }

  return [...groupedPeriods.values()].flatMap((group) => {
    const sortedPeriods = [...group.periods].sort((a, b) => a - b);
    const consecutiveGroups = [];

    for (const period of sortedPeriods) {
      const current = consecutiveGroups.at(-1);
      if (!current || period !== current.at(-1) + 1) {
        consecutiveGroups.push([period]);
      } else {
        current.push(period);
      }
    }

    return consecutiveGroups.map((periods) => ({
      day: group.day,
      periods,
      start_period: periods[0],
      end_period: periods.at(-1),
      room: group.room,
    }));
  });
}

function buildSyllabusUrl(record) {
  if (!yes(record.syllabusFlag)) return "";
  const query = new URLSearchParams({
    mode: "print",
    ledg_year: clean(record.ledgYear),
    ledg_sessn: clean(record.ledgSessn),
    org_sect: clean(record.orgSect),
    lssn_cd: clean(record.lssnCd),
  });
  return `https://wis.hufs.ac.kr/src08/jsp/lecture/syllabus.jsp?${query}`;
}

function contextFor(collection, area) {
  return {
    classification_code: collection.code,
    classification: collection.label,
    area_code: clean(area.code),
    area: clean(area.name),
    area_en: clean(area.name_en),
  };
}

export function normalizeCourse(record, context, collectedAt, options = DEFAULTS) {
  const meetings = parseMeetings(record.dayTimeDisplay);
  const days = [...new Set(meetings.map((meeting) => meeting.day))];
  const periods = meetings.flatMap((meeting) => meeting.periods);
  const queryContext = {
    classification_code: clean(context.classification_code || "2"),
    classification: clean(context.classification || "교양"),
    area_code: clean(context.area_code || context.code),
    area: clean(context.area || context.name),
    area_en: clean(context.area_en || context.name_en),
  };
  return {
    year: nullableNumber(record.ledgYear) ?? options.year,
    semester_code: nullableNumber(record.ledgSessn) ?? options.semester,
    semester: semesterLabel(nullableNumber(record.ledgSessn) ?? options.semester),
    campus_code: clean(record.campus) || options.campus,
    campus: "글로벌",
    classification_code: queryContext.classification_code,
    classification: queryContext.classification,
    classification_types: [queryContext.classification],
    area_code: queryContext.area_code,
    area: queryContext.area,
    area_en: queryContext.area_en,
    area_codes: [queryContext.area_code],
    area_names: [queryContext.area],
    query_contexts: [queryContext],
    curriculum_field_code: clean(record.comptFldCd),
    curriculum_field: clean(record.comptFldNm),
    target_grade: clean(record.dstGrad),
    course_code: clean(record.lssnCd),
    course_name_ko: clean(record.subjtNaKr),
    course_name_en: clean(record.subjtNaEng || record.subjtNaENG),
    professor_ko: clean(record.empNm),
    professor_en: clean(record.empNmEng),
    credits: nullableNumber(record.unitNum),
    hours: nullableNumber(record.realLssnNum),
    schedule: clean(record.dayTimeDisplay),
    schedule_en: clean(record.dayTimeDisplayE),
    meetings,
    meeting_days: days.join(","),
    start_period: periods.length ? Math.min(...periods) : null,
    end_period: periods.length ? Math.max(...periods) : null,
    online: yes(record.cyberFlag),
    pass_fail: String(record.eval ?? "") === "1",
    original_language: yes(record.wongangFlag),
    language: clean(record.lang),
    team_teaching: clean(record.ttFlag) !== "",
    required: yes(record.encessFlag),
    mooc: yes(record.moocFlag),
    syllabus_available: yes(record.syllabusFlag),
    syllabus_url: buildSyllabusUrl(record),
    department_code: clean(record.crsStrctCd),
    department: clean(record.crsNm || record.crsStrctNa),
    enrollment_count: nullableNumber(record.lectrOffrNo),
    enrollment_limit: nullableNumber(record.lectrConstNo),
    basket_count: nullableNumber(record.basketCnt),
    notes: clean(record.etc),
    source_url: SOURCE_PAGE,
    collected_at: collectedAt,
  };
}

function csvCell(value) {
  const serialized = Array.isArray(value) || (value && typeof value === "object")
    ? JSON.stringify(value)
    : value;
  return `"${String(serialized ?? "").replaceAll('"', '""')}"`;
}

function buildCsv(courses) {
  const header = CSV_COLUMNS.map(([, label]) => csvCell(label)).join(",");
  const rows = courses.map((course) =>
    CSV_COLUMNS.map(([key]) => {
      const value = typeof course[key] === "boolean" ? (course[key] ? "Y" : "N") : course[key];
      return csvCell(value);
    }).join(","),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

async function getAreas(options, collection) {
  const payload = await postHufs({
    mName: collection.listProcess,
    cName: "hufs.stu1.STU1_C008",
    ledg_year: String(options.year),
    ledg_sessn: String(options.semester),
    campus: options.campus,
    ...collection.extraListParams,
  });
  const seen = new Set();
  return asArray(payload)
    .map((item) => ({
      code: clean(item[collection.codeField]),
      name: clean(item[collection.nameField]),
      name_en: clean(item[collection.nameEnField]),
      campus: clean(item[collection.campusField]),
    }))
    .filter((area) => area.code && !seen.has(area.code) && seen.add(area.code));
}

function courseRequest(options, areaCode, classificationCode) {
  const parameters = {
    mName: "getDataLssnLista",
    cName: "hufs.stu1.STU1_C009",
    org_sect: "A",
    ledg_year: String(options.year),
    ledg_sessn: String(options.semester),
    campus: options.campus,
    crs_strct_cd: areaCode,
    gubun: classificationCode,
    subjt_nm: "",
    won: "",
    cyber: "",
    emp_nm: "",
  };
  for (let day = 1; day <= 6; day += 1) parameters[`d${day}`] = "N";
  for (let period = 1; period <= 12; period += 1) parameters[`t${period}`] = "N";
  return parameters;
}

function mergeContext(existing, duplicate) {
  for (const context of duplicate.query_contexts) {
    const contextKey = `${context.classification_code}:${context.area_code}`;
    if (!existing.query_contexts.some((item) =>
      `${item.classification_code}:${item.area_code}` === contextKey)) {
      existing.query_contexts.push(context);
    }
  }
  existing.classification_types = [...new Set([
    ...existing.classification_types,
    ...duplicate.classification_types,
  ])];
  existing.area_codes = [...new Set([...existing.area_codes, ...duplicate.area_codes])];
  existing.area_names = [...new Set([...existing.area_names, ...duplicate.area_names])];
}

export async function crawl(options) {
  const collectedAt = new Date().toISOString();
  const rawByArea = [];
  const normalizedRows = [];
  const collectionSummaries = [];
  let completedAreas = 0;

  for (const collection of COLLECTIONS) {
    const areas = await getAreas(options, collection);
    if (areas.length === 0) throw new Error(`${collection.label} 영역 목록이 비어 있습니다.`);
    console.log(`${collection.label} 조회 영역 ${areas.length}개를 확인했습니다.`);
    const collectionStart = normalizedRows.length;

    for (let index = 0; index < areas.length; index += 1) {
      const area = areas[index];
      const payload = await postHufs(courseRequest(options, area.code, collection.code));
      const records = asArray(payload);
      const context = contextFor(collection, area);
      rawByArea.push({
        collection: { key: collection.key, code: collection.code, label: collection.label },
        area,
        data_count: records.length,
        records,
      });
      normalizedRows.push(...records.map((record) =>
        normalizeCourse(record, context, collectedAt, options)));
      completedAreas += 1;
      console.log(
        `[${collection.label} ${index + 1}/${areas.length}] ${area.name}: ${records.length}개`,
      );
      await sleep(options.delayMs);
    }

    collectionSummaries.push({
      key: collection.key,
      code: collection.code,
      label: collection.label,
      area_count: areas.length,
      raw_course_count: normalizedRows.length - collectionStart,
      areas,
    });
  }

  const duplicateCourseCodes = [];
  const uniqueCourses = [];
  const seen = new Map();
  for (const course of normalizedRows) {
    const key = `${course.year}-${course.semester_code}-${course.course_code}`;
    const existing = seen.get(key);
    if (existing) {
      duplicateCourseCodes.push({
        key,
        first_context: existing.query_contexts[0],
        duplicate_context: course.query_contexts[0],
      });
      mergeContext(existing, course);
      continue;
    }
    seen.set(key, course);
    uniqueCourses.push(course);
  }
  uniqueCourses.sort((a, b) =>
    a.classification_code.localeCompare(b.classification_code, "ko") ||
    a.area.localeCompare(b.area, "ko") ||
    a.course_code.localeCompare(b.course_code, "ko"),
  );

  const countsByClassification = Object.fromEntries(collectionSummaries.map((collection) => [
    collection.key,
    {
      code: collection.code,
      label: collection.label,
      area_count: collection.area_count,
      raw_course_count: collection.raw_course_count,
      unique_course_count: uniqueCourses.filter((course) =>
        course.classification_types.includes(collection.label)).length,
    },
  ]));
  const summary = {
    year: options.year,
    semester_code: options.semester,
    semester: semesterLabel(options.semester),
    campus_code: options.campus,
    campus: "글로벌",
    scope: COLLECTIONS.map((collection) => collection.label),
    source_url: SOURCE_PAGE,
    collected_at: collectedAt,
    collection_count: COLLECTIONS.length,
    area_count: completedAreas,
    raw_course_count: normalizedRows.length,
    unique_course_count: uniqueCourses.length,
    duplicate_count: duplicateCourseCodes.length,
    online_count: uniqueCourses.filter((course) => course.online).length,
    pass_fail_count: uniqueCourses.filter((course) => course.pass_fail).length,
    syllabus_count: uniqueCourses.filter((course) => course.syllabus_available).length,
    counts_by_classification: countsByClassification,
    areas: rawByArea.map(({ collection, area, data_count: dataCount }) => ({
      classification_code: collection.code,
      classification: collection.label,
      ...area,
      course_count: dataCount,
    })),
    duplicates: duplicateCourseCodes,
  };

  await fs.mkdir(options.outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(options.outputDir, "courses.json"),
      `${JSON.stringify(uniqueCourses, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(path.join(options.outputDir, "courses.csv"), buildCsv(uniqueCourses), "utf8"),
    fs.writeFile(
      path.join(options.outputDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(options.outputDir, "raw.json"),
      `${JSON.stringify({
        summary,
        collections: collectionSummaries,
        raw_by_area: rawByArea,
      }, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return { courses: uniqueCourses, summary };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  console.log(
    `${options.year}년 ${semesterLabel(options.semester)} 글로벌캠퍼스 ` +
    "전공/부전공·교양·기초 강좌 수집을 시작합니다.",
  );
  const { summary } = await crawl(options);
  console.log(
    `완료: 고유 강좌 ${summary.unique_course_count}개 / 원본 조회행 ${summary.raw_course_count}개 ` +
    `(온라인 ${summary.online_count}, P/F ${summary.pass_fail_count}, ` +
    `강의계획서 ${summary.syllabus_count})`,
  );
  console.log(`저장 위치: ${options.outputDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`실행 실패: ${error.message}`);
    process.exitCode = 1;
  });
}
