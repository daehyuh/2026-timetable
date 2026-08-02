"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ClassificationCode = "1" | "2" | "3";
type ClassificationFilter = "all" | ClassificationCode;
type CampusCode = "H1" | "H2";
type CampusFilter = "all" | CampusCode;

type RawMeeting = {
  day: string;
  periods: number[];
  start_period: number;
  end_period: number;
  room: string;
};

type Course = {
  year: number;
  semester_code: number;
  campus_code: CampusCode;
  campus: string;
  course_code: string;
  course_name_ko: string;
  course_name_en: string;
  professor_ko: string;
  professor_en: string;
  classification_code: ClassificationCode;
  classification: string;
  area_code: string;
  area: string;
  area_en: string;
  credits: number;
  hours: number;
  schedule: string;
  schedule_en: string;
  meetings: RawMeeting[];
  online: boolean;
  pass_fail: boolean;
  syllabus_available: boolean;
  syllabus_url: string;
  target_grade: string;
  notes: string;
};

type Summary = {
  unique_course_count: number;
  online_count: number;
  pass_fail_count: number;
  syllabus_count: number;
  collected_at: string;
};

type Meeting = {
  day: DayCode;
  periods: number[];
};

type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

type AreaOption = {
  key: string;
  code: string;
  campusCode: CampusCode;
  classificationCode: ClassificationCode;
  label: string;
};

const STORAGE_KEY = "hufs-all-campuses-2026-2-timetable-v2";
const LEGACY_STORAGE_KEY = "hufs-global-2026-2-timetable";
const INITIAL_RESULT_COUNT = 30;
const RESULT_INCREMENT = 30;
const PERIODS = Array.from({ length: 12 }, (_, index) => index + 1);
const DAYS: Array<{ code: DayCode; label: string }> = [
  { code: "Mon", label: "월" },
  { code: "Tue", label: "화" },
  { code: "Wed", label: "수" },
  { code: "Thu", label: "목" },
  { code: "Fri", label: "금" },
  { code: "Sat", label: "토" },
];

const CLASSIFICATION_LABELS: Record<ClassificationCode, string> = {
  "1": "전공 · 부전공",
  "2": "교양",
  "3": "기초",
};

const CLASSIFICATION_SHORT_LABELS: Record<ClassificationCode, string> = {
  "1": "전공",
  "2": "교양",
  "3": "기초",
};

const CAMPUS_CODES: CampusCode[] = ["H1", "H2"];
const CAMPUS_LABELS: Record<CampusCode, string> = {
  H1: "서울",
  H2: "글로벌",
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function getCourseName(course: Course) {
  return course.course_name_ko || course.course_name_en || "이름 없는 강좌";
}

function getProfessorName(course: Course) {
  return course.professor_ko || course.professor_en || "담당교수 미정";
}

function getCampusLabel(course: Course) {
  return CAMPUS_LABELS[course.campus_code] || course.campus;
}

function getCourseId(course: Course) {
  return `${course.year}:${course.semester_code}:${course.campus_code}:${course.course_code}`;
}

function getLegacyCourseId(courseCode: string) {
  return `2026:3:H2:${courseCode}`;
}

function parseStoredCourseIds(serialized: string | null) {
  if (serialized === null) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function getAreaKey(course: Course) {
  return `${course.campus_code}:${course.classification_code}:${course.area_code}`;
}

function parseMeetings(scheduleEn: string): Meeting[] {
  if (!scheduleEn) return [];

  const matches = [
    ...scheduleEn.matchAll(
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\s*((?:\d{1,2}\s*)+)/g,
    ),
  ];

  const periodsByDay = new Map<DayCode, Set<number>>();

  matches.forEach((match) => {
    if (match[1] === "Sun") return;
    const day = match[1] as DayCode;
    const dayPeriods = periodsByDay.get(day) ?? new Set<number>();
    match[2]
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((period) => period >= 1 && period <= 12)
      .forEach((period) => dayPeriods.add(period));
    periodsByDay.set(day, dayPeriods);
  });

  return DAYS.flatMap(({ code: day }) => {
    const periods = [...(periodsByDay.get(day) ?? [])].sort((a, b) => a - b);
    const consecutiveGroups: number[][] = [];

    periods.forEach((period) => {
      const currentGroup = consecutiveGroups.at(-1);
      if (
        !currentGroup ||
        period !== currentGroup[currentGroup.length - 1] + 1
      ) {
        consecutiveGroups.push([period]);
      } else {
        currentGroup.push(period);
      }
    });

    return consecutiveGroups.map((group) => ({ day, periods: group }));
  });
}

function getScheduleLabel(course: Course) {
  if (course.online) return "온라인";
  return course.schedule || "시간 미정";
}

function findConflict(candidate: Course, selectedCourses: Course[]) {
  const candidateMeetings = parseMeetings(candidate.schedule_en);
  if (candidateMeetings.length === 0) return null;

  for (const selected of selectedCourses) {
    const selectedMeetings = parseMeetings(selected.schedule_en);

    for (const candidateMeeting of candidateMeetings) {
      for (const selectedMeeting of selectedMeetings) {
        if (candidateMeeting.day !== selectedMeeting.day) continue;
        if (
          candidateMeeting.periods.some((period) =>
            selectedMeeting.periods.includes(period),
          )
        ) {
          return selected;
        }
      }
    }
  }

  return null;
}

function formatCollectedAt(value?: string) {
  if (!value) return "확인 중";

  const collectedAt = new Date(value);
  if (Number.isNaN(collectedAt.getTime())) return "확인 불가";

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(collectedAt);
}

async function fetchCourseData(signal?: AbortSignal) {
  const cacheKey = Date.now();
  const [coursesResponse, summaryResponse] = await Promise.all([
    fetch(`./data/courses.json?v=${cacheKey}`, {
      signal,
      cache: "no-store",
    }),
    fetch(`./data/summary.json?v=${cacheKey}`, {
      signal,
      cache: "no-store",
    }),
  ]);

  if (!coursesResponse.ok || !summaryResponse.ok) {
    throw new Error("강좌 데이터를 불러오지 못했습니다.");
  }

  const [courseData, summaryData] = await Promise.all([
    coursesResponse.json() as Promise<Course[]>,
    summaryResponse.json() as Promise<Summary>,
  ]);

  return { courseData, summaryData };
}

function CourseFlags({ course }: { course: Course }) {
  return (
    <div className="course-flags" aria-label="캠퍼스와 강좌 특성">
      <span className={`campus-badge campus-${course.campus_code.toLowerCase()}`}>
        {getCampusLabel(course)}
      </span>
      <span
        className={`classification-badge classification-${course.classification_code}`}
      >
        {CLASSIFICATION_SHORT_LABELS[course.classification_code]}
      </span>
      {course.online && <span className="feature-badge">온라인</span>}
      {course.pass_fail && <span className="feature-badge">P/F</span>}
      {course.syllabus_available && (
        <span className="feature-badge">계획서</span>
      )}
    </div>
  );
}

export default function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshStatus, setRefreshStatus] = useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);

  const [query, setQuery] = useState("");
  const [campus, setCampus] = useState<CampusFilter>("all");
  const [classification, setClassification] =
    useState<ClassificationFilter>("all");
  const [areaKey, setAreaKey] = useState("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [passFailOnly, setPassFailOnly] = useState(false);
  const [syllabusOnly, setSyllabusOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_RESULT_COUNT);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasHydratedSelection, setHasHydratedSelection] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "warning" | "neutral";
    text: string;
  } | null>(null);

  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const { courseData, summaryData } = await fetchCourseData(
          controller.signal,
        );
        setCourses(courseData);
        setSummary(summaryData);
        setLoadError("");
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : "강좌 데이터를 불러오지 못했습니다.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadInitialData();
    return () => controller.abort();
  }, []);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshStatus(null);

    try {
      const { courseData, summaryData } = await fetchCourseData();
      setCourses(courseData);
      setSummary(summaryData);
      setLoadError("");
      setRefreshStatus({
        tone: "success",
        text: "현재 배포된 최신 데이터를 다시 확인했습니다.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "강좌 데이터를 불러오지 못했습니다.";
      setRefreshStatus({
        tone: "warning",
        text: `${message} 기존 데이터를 그대로 유지합니다.`,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const savedIds = parseStoredCourseIds(saved);

        if (savedIds !== null) {
          setSelectedIds([...new Set(savedIds)]);
        } else {
          if (saved !== null) window.localStorage.removeItem(STORAGE_KEY);
          const legacyIds = parseStoredCourseIds(
            window.localStorage.getItem(LEGACY_STORAGE_KEY),
          );
          setSelectedIds([
            ...new Set((legacyIds ?? []).map(getLegacyCourseId)),
          ]);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHasHydratedSelection(true);
      }
    }, 0);

    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hasHydratedSelection) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
  }, [hasHydratedSelection, selectedIds]);

  const courseById = useMemo(
    () => new Map(courses.map((course) => [getCourseId(course), course])),
    [courses],
  );

  const selectedCourses = useMemo(
    () =>
      selectedIds
        .map((courseId) => courseById.get(courseId))
        .filter((course): course is Course => Boolean(course)),
    [courseById, selectedIds],
  );

  const classificationCounts = useMemo(() => {
    return courses.reduce<Record<ClassificationCode, number>>(
      (counts, course) => {
        counts[course.classification_code] += 1;
        return counts;
      },
      { "1": 0, "2": 0, "3": 0 },
    );
  }, [courses]);

  const campusCounts = useMemo(
    () =>
      courses.reduce<Record<CampusCode, number>>(
        (counts, course) => {
          counts[course.campus_code] += 1;
          return counts;
        },
        { H1: 0, H2: 0 },
      ),
    [courses],
  );

  const campusCourses = useMemo(
    () =>
      campus === "all"
        ? courses
        : courses.filter((course) => course.campus_code === campus),
    [campus, courses],
  );

  const areaOptions = useMemo(() => {
    const unique = new Map<string, AreaOption>();

    campusCourses.forEach((course) => {
      const key = getAreaKey(course);
      if (!unique.has(key)) {
        unique.set(key, {
          key,
          code: course.area_code,
          campusCode: course.campus_code,
          classificationCode: course.classification_code,
          label: course.area || course.area_en || course.area_code,
        });
      }
    });

    return [...unique.values()].sort((a, b) => {
      const campusOrder =
        CAMPUS_CODES.indexOf(a.campusCode) - CAMPUS_CODES.indexOf(b.campusCode);
      const classificationOrder =
        Number(a.classificationCode) - Number(b.classificationCode);
      return (
        campusOrder ||
        classificationOrder ||
        a.label.localeCompare(b.label, "ko-KR", { numeric: true })
      );
    });
  }, [campusCourses]);

  const availableAreaOptions = useMemo(
    () =>
      classification === "all"
        ? areaOptions
        : areaOptions.filter(
            (option) => option.classificationCode === classification,
          ),
    [areaOptions, classification],
  );

  const effectiveAreaKey =
    areaKey === "all" ||
    availableAreaOptions.some((option) => option.key === areaKey)
      ? areaKey
      : "all";

  const contextualCourses = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return courses.filter((course) => {
      if (campus !== "all" && course.campus_code !== campus) return false;
      if (
        classification !== "all" &&
        course.classification_code !== classification
      ) {
        return false;
      }
      if (
        effectiveAreaKey !== "all" &&
        getAreaKey(course) !== effectiveAreaKey
      ) {
        return false;
      }

      if (normalizedQuery) {
        const haystack = normalizeSearch(
          [
            course.course_name_ko,
            course.course_name_en,
            course.professor_ko,
            course.professor_en,
            course.course_code,
            course.area,
            course.area_en,
            getCampusLabel(course),
          ].join(" "),
        );
        if (!haystack.includes(normalizedQuery)) return false;
      }

      return true;
    });
  }, [
    campus,
    classification,
    courses,
    effectiveAreaKey,
    query,
  ]);

  const featureCounts = useMemo(
    () => ({
      online: contextualCourses.filter((course) => course.online).length,
      passFail: contextualCourses.filter((course) => course.pass_fail).length,
      syllabus: contextualCourses.filter((course) => course.syllabus_available)
        .length,
    }),
    [contextualCourses],
  );

  const filteredCourses = useMemo(
    () =>
      contextualCourses.filter((course) => {
        if (onlineOnly && !course.online) return false;
        if (passFailOnly && !course.pass_fail) return false;
        if (syllabusOnly && !course.syllabus_available) return false;
        return true;
      }),
    [contextualCourses, onlineOnly, passFailOnly, syllabusOnly],
  );

  const visibleCourses = filteredCourses.slice(0, visibleCount);

  const selectedCredits = selectedCourses.reduce(
    (total, course) => total + (Number(course.credits) || 0),
    0,
  );

  const scheduledEvents = useMemo(
    () =>
      selectedCourses.flatMap((course) =>
        parseMeetings(course.schedule_en).map((meeting) => ({
          course,
          meeting,
        })),
      ),
    [selectedCourses],
  );

  const unscheduledCourses = selectedCourses.filter(
    (course) => parseMeetings(course.schedule_en).length === 0,
  );

  const handleCampusChange = useCallback((nextCampus: CampusFilter) => {
    setCampus(nextCampus);
    setAreaKey("all");
    setVisibleCount(INITIAL_RESULT_COUNT);
  }, []);

  const handleClassificationChange = useCallback(
    (nextClassification: ClassificationFilter) => {
      setClassification(nextClassification);
      setVisibleCount(INITIAL_RESULT_COUNT);
      const selectedArea = areaOptions.find((option) => option.key === areaKey);
      if (
        areaKey !== "all" &&
        (!selectedArea ||
          (nextClassification !== "all" &&
            selectedArea.classificationCode !== nextClassification))
      ) {
        setAreaKey("all");
      }
    },
    [areaKey, areaOptions],
  );

  function addCourse(course: Course) {
    const courseId = getCourseId(course);
    if (selectedIds.includes(courseId)) return;

    const conflict = findConflict(course, selectedCourses);
    if (conflict) {
      setNotice({
        tone: "warning",
        text: `${getCampusLabel(course)} ${getCourseName(course)}은(는) ${getCampusLabel(conflict)} ${getCourseName(conflict)}과 시간이 겹쳐 추가하지 않았어요.`,
      });
      return;
    }

    setSelectedIds((current) => [...current, courseId]);
    setNotice({
      tone: "success",
      text: `${getCampusLabel(course)} ${getCourseName(course)}을(를) 시간표에 추가했어요.`,
    });
  }

  function removeCourse(course: Course) {
    const courseId = getCourseId(course);
    setSelectedIds((current) =>
      current.filter((selectedId) => selectedId !== courseId),
    );
    setNotice({
      tone: "neutral",
      text: `${getCampusLabel(course)} ${getCourseName(course)}을(를) 시간표에서 뺐어요.`,
    });
  }

  function clearFilters() {
    setQuery("");
    setCampus("all");
    setClassification("all");
    setAreaKey("all");
    setOnlineOnly(false);
    setPassFailOnly(false);
    setSyllabusOnly(false);
    setVisibleCount(INITIAL_RESULT_COUNT);
    setNotice({ tone: "neutral", text: "검색 조건을 모두 초기화했어요." });
  }

  function clearSchedule() {
    if (selectedCourses.length === 0) return;
    setSelectedIds([]);
    setNotice({ tone: "neutral", text: "시간표를 비웠어요." });
  }

  return (
    <main>
      <a className="skip-link" href="#timetable">
        내 시간표로 바로가기
      </a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="HUFS GRID 홈">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            <strong>HUFS GRID</strong>
            <small>SEOUL · GLOBAL · 2026 FALL</small>
          </span>
        </a>
        <div className="header-meta" aria-label="데이터 범위">
          <span>서울 · 글로벌캠퍼스</span>
          <span className="meta-divider" aria-hidden="true" />
          <span>전체 강좌</span>
        </div>
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">2026학년도 2학기 · 시간표 시뮬레이터</p>
          <h1 id="hero-title">
            이번 학기,
            <br />
            <span>빈칸부터 완성까지.</span>
          </h1>
          <p className="hero-description">
            전공부터 교양, 기초까지 서울·글로벌캠퍼스의 모든 강좌를 한곳에서
            검색하고 겹침 없이 조합해 보세요.
          </p>
          <div className="data-freshness">
            <div className="freshness-indicator" role="status" aria-live="polite">
              <span className="freshness-dot" aria-hidden="true" />
              <span>
                <strong>
                  {summary
                    ? `마지막 수집 ${formatCollectedAt(summary.collected_at)} KST`
                    : "데이터 확인 중"}
                </strong>
                <small>약 30분마다 자동 확인</small>
              </span>
            </div>
            <button
              className="refresh-data-button"
              type="button"
              onClick={() => void refreshData()}
              disabled={isLoading || isRefreshing}
            >
              {isRefreshing ? "확인 중…" : "최신 데이터 확인"}
            </button>
            {refreshStatus && (
              <p
                className={`refresh-status refresh-status-${refreshStatus.tone}`}
                role={refreshStatus.tone === "warning" ? "alert" : "status"}
              >
                {refreshStatus.text}
              </p>
            )}
          </div>
        </div>

        <div className="hero-stats" aria-label="수록 데이터 요약">
          <div className="hero-total">
            <span>전체</span>
            <strong>
              {summary
                ? summary.unique_course_count.toLocaleString("ko-KR")
                : "—"}
            </strong>
            <small>COURSES</small>
          </div>
          <dl>
            <div>
              <dt>전공 · 부전공</dt>
              <dd>{classificationCounts["1"].toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt>교양</dt>
              <dd>{classificationCounts["2"].toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt>기초</dt>
              <dd>{classificationCounts["3"].toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="workspace" aria-label="강좌 검색과 시간표 제작">
        <aside className="course-finder" aria-labelledby="finder-title">
          <div className="panel-heading">
            <div>
              <p className="step-label">01 · FIND</p>
              <h2 id="finder-title">강좌 찾기</h2>
            </div>
            <button className="text-button" type="button" onClick={clearFilters}>
              조건 초기화
            </button>
          </div>

          <div className="search-field">
            <label htmlFor="course-search">
              교과목 · 교수 · 학수번호 · 영역 검색
            </label>
            <div className="search-input-wrap">
              <span aria-hidden="true">⌕</span>
              <input
                id="course-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(INITIAL_RESULT_COUNT);
                }}
                placeholder="예: 데이터, 홍길동, A01234"
                autoComplete="off"
              />
              {query && (
                <button
                  className="input-clear"
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setVisibleCount(INITIAL_RESULT_COUNT);
                  }}
                  aria-label="검색어 지우기"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <fieldset className="campus-filter">
            <legend>캠퍼스</legend>
            <div className="segmented-control campus-segmented-control">
              {(
                [
                  ["all", "전체", courses.length],
                  ["H1", "서울", campusCounts.H1],
                  ["H2", "글로벌", campusCounts.H2],
                ] as Array<[CampusFilter, string, number]>
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  className={campus === value ? "is-active" : ""}
                  aria-pressed={campus === value}
                  onClick={() => handleCampusChange(value)}
                >
                  <span>{label}</span>
                  <small>{count.toLocaleString("ko-KR")}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="classification-filter">
            <legend>이수 구분</legend>
            <div className="segmented-control">
              {(
                [
                  ["all", "전체"],
                  ["1", "전공 · 부전공"],
                  ["2", "교양"],
                  ["3", "기초"],
                ] as Array<[ClassificationFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={classification === value ? "is-active" : ""}
                  aria-pressed={classification === value}
                  onClick={() => handleClassificationChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="area-field">
            <label htmlFor="area-filter">학과 · 영역</label>
            <select
              id="area-filter"
              value={effectiveAreaKey}
              onChange={(event) => {
                setAreaKey(event.target.value);
                setVisibleCount(INITIAL_RESULT_COUNT);
              }}
            >
              <option value="all">모든 학과 · 영역</option>
              {(campus === "all" ? CAMPUS_CODES : [campus]).flatMap(
                (campusCode) =>
                  (["1", "2", "3"] as ClassificationCode[]).map((code) => {
                    const options = availableAreaOptions.filter(
                      (option) =>
                        option.campusCode === campusCode &&
                        option.classificationCode === code,
                    );
                    if (options.length === 0) return null;
                    return (
                      <optgroup
                        key={`${campusCode}:${code}`}
                        label={`${CAMPUS_LABELS[campusCode]} · ${CLASSIFICATION_LABELS[code]}`}
                      >
                        {options.map((option) => (
                          <option value={option.key} key={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  }),
              )}
            </select>
          </div>

          <fieldset className="quick-filters">
            <legend>강좌 특성</legend>
            <label>
              <input
                type="checkbox"
                checked={onlineOnly}
                onChange={(event) => {
                  setOnlineOnly(event.target.checked);
                  setVisibleCount(INITIAL_RESULT_COUNT);
                }}
              />
              <span>온라인</span>
              <small>{featureCounts.online.toLocaleString("ko-KR")}</small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={passFailOnly}
                onChange={(event) => {
                  setPassFailOnly(event.target.checked);
                  setVisibleCount(INITIAL_RESULT_COUNT);
                }}
              />
              <span>P/F</span>
              <small>{featureCounts.passFail.toLocaleString("ko-KR")}</small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={syllabusOnly}
                onChange={(event) => {
                  setSyllabusOnly(event.target.checked);
                  setVisibleCount(INITIAL_RESULT_COUNT);
                }}
              />
              <span>강의계획서 있음</span>
              <small>{featureCounts.syllabus.toLocaleString("ko-KR")}</small>
            </label>
          </fieldset>

          <div className="result-heading">
            <h3 ref={resultHeadingRef}>
              검색 결과
              <strong aria-label={`${filteredCourses.length}개`}>
                {filteredCourses.length.toLocaleString("ko-KR")}
              </strong>
            </h3>
            <span>선택하면 시간표에 바로 반영돼요</span>
          </div>

          <div
            className="course-results"
            aria-busy={isLoading}
            aria-live="polite"
          >
            {isLoading &&
              Array.from({ length: 5 }, (_, index) => (
                <div className="course-card loading-card" key={index}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}

            {!isLoading && loadError && (
              <div className="empty-state" role="alert">
                <strong>데이터를 불러오지 못했어요.</strong>
                <p>{loadError} 잠시 후 새로고침해 주세요.</p>
              </div>
            )}

            {!isLoading &&
              !loadError &&
              visibleCourses.map((course) => {
                const courseId = getCourseId(course);
                const isSelected = selectedIds.includes(courseId);
                const secondaryName =
                  course.course_name_en &&
                  course.course_name_en !== course.course_name_ko
                    ? course.course_name_en
                    : "";

                return (
                  <article className="course-card" key={courseId}>
                    <CourseFlags course={course} />
                    <div className="course-title-row">
                      <div>
                        <h4>{getCourseName(course)}</h4>
                        {secondaryName && <p>{secondaryName}</p>}
                      </div>
                      <button
                        className={`add-course-button ${isSelected ? "is-selected" : ""}`}
                        type="button"
                        aria-label={
                          isSelected
                            ? `${getCampusLabel(course)} ${getCourseName(course)} 선택됨`
                            : `${getCampusLabel(course)} ${getCourseName(course)} 시간표에 추가`
                        }
                        disabled={isSelected}
                        onClick={() => addCourse(course)}
                      >
                        {isSelected ? "✓" : "+"}
                      </button>
                    </div>
                    <p className="course-area">
                      {course.area || "영역 미정"}
                      <span>{course.course_code}</span>
                    </p>
                    <dl className="course-details">
                      <div>
                        <dt>교수</dt>
                        <dd>{getProfessorName(course)}</dd>
                      </div>
                      <div>
                        <dt>학점</dt>
                        <dd>{course.credits}학점</dd>
                      </div>
                      <div className="schedule-detail">
                        <dt>시간</dt>
                        <dd>{getScheduleLabel(course)}</dd>
                      </div>
                    </dl>
                    <div className="course-actions">
                      {course.syllabus_available && course.syllabus_url ? (
                        <a
                          href={course.syllabus_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          강의계획서 <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <span className="no-syllabus">계획서 미등록</span>
                      )}
                      {course.target_grade && (
                        <span>권장 {course.target_grade}학년</span>
                      )}
                    </div>
                  </article>
                );
              })}

            {!isLoading &&
              !loadError &&
              filteredCourses.length === 0 && (
                <div className="empty-state">
                  <strong>조건에 맞는 강좌가 없어요.</strong>
                  <p>검색어를 줄이거나 필터를 하나씩 해제해 보세요.</p>
                  <button type="button" onClick={clearFilters}>
                    전체 강좌 보기
                  </button>
                </div>
              )}
          </div>

          {visibleCount < filteredCourses.length && (
            <button
              className="load-more"
              type="button"
              onClick={() =>
                setVisibleCount((current) => current + RESULT_INCREMENT)
              }
            >
              강좌 {Math.min(RESULT_INCREMENT, filteredCourses.length - visibleCount)}
              개 더 보기
            </button>
          )}
        </aside>

        <section
          className="timetable-panel"
          id="timetable"
          aria-labelledby="timetable-title"
        >
          <div className="panel-heading timetable-heading">
            <div>
              <p className="step-label">02 · BUILD</p>
              <h2 id="timetable-title">내 시간표</h2>
            </div>
            <div className="schedule-summary">
              <span>
                <strong>{selectedCourses.length}</strong>과목
              </span>
              <span>
                <strong>{selectedCredits}</strong>학점
              </span>
              <button
                className="text-button"
                type="button"
                onClick={clearSchedule}
                disabled={selectedCourses.length === 0}
              >
                모두 비우기
              </button>
            </div>
          </div>

          <div
            className={`notice ${notice ? `notice-${notice.tone}` : ""}`}
            role={notice?.tone === "warning" ? "alert" : "status"}
            aria-live="polite"
          >
            {notice ? (
              <>
                <span aria-hidden="true">
                  {notice.tone === "warning"
                    ? "!"
                    : notice.tone === "success"
                      ? "✓"
                      : "·"}
                </span>
                <p>{notice.text}</p>
              </>
            ) : (
              <>
                <span aria-hidden="true">↗</span>
                <p>강좌의 + 버튼을 누르면 시간표에 추가됩니다.</p>
              </>
            )}
          </div>

          <div className="timetable-scroll" tabIndex={0}>
            <div className="timetable-grid" aria-label="월요일부터 토요일까지 시간표">
              <div className="grid-corner" aria-hidden="true">
                교시
              </div>
              {DAYS.map((day, index) => (
                <div
                  className="day-header"
                  style={{ gridColumn: index + 2, gridRow: 1 }}
                  key={day.code}
                >
                  <strong>{day.label}</strong>
                  <span>{day.code.toUpperCase()}</span>
                </div>
              ))}

              {PERIODS.map((period) => (
                <div
                  className="period-label"
                  style={{ gridColumn: 1, gridRow: period + 1 }}
                  key={period}
                >
                  <strong>{period}</strong>
                  <span>교시</span>
                </div>
              ))}

              {DAYS.flatMap((day, dayIndex) =>
                PERIODS.map((period) => (
                  <div
                    className="grid-cell"
                    style={{
                      gridColumn: dayIndex + 2,
                      gridRow: period + 1,
                    }}
                    aria-hidden="true"
                    key={`${day.code}-${period}`}
                  />
                )),
              )}

              {scheduledEvents.map(({ course, meeting }) => {
                const dayIndex = DAYS.findIndex(
                  (day) => day.code === meeting.day,
                );
                const firstPeriod = Math.min(...meeting.periods);
                const lastPeriod = Math.max(...meeting.periods);
                const courseId = getCourseId(course);

                return (
                  <article
                    className={`timetable-event event-${course.classification_code}`}
                    style={{
                      gridColumn: dayIndex + 2,
                      gridRow: `${firstPeriod + 1} / ${lastPeriod + 2}`,
                    }}
                    key={`${courseId}:${meeting.day}:${meeting.periods.join("-")}`}
                    aria-label={`${getCampusLabel(course)} ${getCourseName(course)}, ${getScheduleLabel(course)}`}
                  >
                    <button
                      type="button"
                      onClick={() => removeCourse(course)}
                      aria-label={`${getCampusLabel(course)} ${getCourseName(course)} 시간표에서 삭제`}
                    >
                      ×
                    </button>
                    <span>
                      {getCampusLabel(course)} ·{" "}
                      {CLASSIFICATION_SHORT_LABELS[course.classification_code]}
                    </span>
                    <strong>{getCourseName(course)}</strong>
                    <small>{course.course_code}</small>
                  </article>
                );
              })}

              {selectedCourses.length === 0 && (
                <div className="empty-timetable">
                  <span aria-hidden="true">+</span>
                  <strong>아직 담은 강좌가 없어요</strong>
                  <p>왼쪽에서 원하는 강좌를 골라보세요.</p>
                </div>
              )}
            </div>
          </div>

          {unscheduledCourses.length > 0 && (
            <div className="unscheduled-section">
              <div>
                <h3>온라인 · 시간 미정</h3>
                <p>그리드 밖에 따로 모아두었어요.</p>
              </div>
              <ul>
                {unscheduledCourses.map((course) => (
                  <li key={getCourseId(course)}>
                    <span
                      className={`classification-dot dot-${course.classification_code}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{getCourseName(course)}</strong>
                      <small>
                        {getCampusLabel(course)} ·{" "}
                        {course.online ? "온라인" : "시간 미정"} ·{" "}
                        {course.course_code}
                      </small>
                    </div>
                    {course.syllabus_available && course.syllabus_url && (
                      <a
                        href={course.syllabus_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${getCampusLabel(course)} ${getCourseName(course)} 강의계획서 새 창에서 열기`}
                      >
                        계획서 ↗
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCourse(course)}
                      aria-label={`${getCampusLabel(course)} ${getCourseName(course)} 시간표에서 삭제`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedCourses.length > 0 && (
            <div className="selected-course-list">
              <div className="selected-list-heading">
                <h3>담은 강좌</h3>
                <span>이 브라우저에 자동 저장됩니다</span>
              </div>
              <ul>
                {selectedCourses.map((course) => (
                  <li key={getCourseId(course)}>
                    <span
                      className={`classification-dot dot-${course.classification_code}`}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{getCourseName(course)}</strong>
                      <small>
                        {getCampusLabel(course)} · {getProfessorName(course)} ·{" "}
                        {course.credits}학점 · {getScheduleLabel(course)}
                      </small>
                    </div>
                    {course.syllabus_available && course.syllabus_url ? (
                      <a
                        href={course.syllabus_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${getCampusLabel(course)} ${getCourseName(course)} 강의계획서 새 창에서 열기`}
                      >
                        계획서 ↗
                      </a>
                    ) : (
                      <span className="no-syllabus">계획서 없음</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeCourse(course)}
                      aria-label={`${getCampusLabel(course)} ${getCourseName(course)} 시간표에서 삭제`}
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </section>

      <footer>
        <div>
          <strong>HUFS GRID</strong>
          <p>
            한국외국어대학교 공식 강의시간표 데이터를 바탕으로 만든 비공식
            시뮬레이터입니다.
          </p>
        </div>
        <div className="footer-meta">
          <span>
            {summary
              ? `마지막 수집 ${formatCollectedAt(summary.collected_at)} KST`
              : "데이터 확인 중"}
          </span>
          <a
            href="https://wis.hufs.ac.kr/src08/jsp/lecture/LECTURE2020L.jsp"
            target="_blank"
            rel="noreferrer"
          >
            공식 강의시간표 ↗
          </a>
        </div>
      </footer>
    </main>
  );
}
