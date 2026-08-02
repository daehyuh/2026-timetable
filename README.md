# HUFS GRID

한국외국어대학교 서울·글로벌캠퍼스 2026학년도 2학기 시간표
시뮬레이터입니다. 전공·부전공, 교양, 기초를 포함한 양 캠퍼스 전체 강좌를
검색하고 충돌 없이 시간표에 조합할 수 있습니다.

GitHub Pages: https://daehyuh.github.io/2026-timetable/

보조 배포: https://hufs-grid-2026.daehyuh.chatgpt.site

## 주요 기능

- 교과목명, 교수명, 학수번호, 학과·영역 통합 검색
- 서울 / 글로벌 캠퍼스 필터
- 전공·부전공 / 교양 / 기초 및 온라인 / P/F / 강의계획서 필터
- 월요일부터 토요일, 1교시부터 12교시까지 시간표 구성
- 다요일·분할 교시 충돌 검사와 중복 수업 차단
- 온라인 및 시간 미정 강좌 별도 보관
- 브라우저 로컬 저장소를 이용한 시간표 자동 저장
- 모바일·태블릿·데스크톱 반응형 화면

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

검증:

```bash
npm test
npm run test:pages
npm run lint
```

강좌 데이터는 `public/data/courses.json`, 수집 요약은
`public/data/summary.json`을 사용합니다.

## 강좌 데이터 재수집

`crawler`에는 한국외대 공개 강의시간표에서 2026-2 서울·글로벌캠퍼스의
전공·부전공, 교양, 기초 강좌를 다시 수집하고 검증하는 소스만 포함되어
있습니다. 양 캠퍼스 요청은 학교 서버에 부담을 주지 않도록 순차 실행됩니다.

```bash
cd crawler
node crawl.mjs --campus all
node validate.mjs
```

생성되는 `crawler/data`는 Git에 포함되지 않습니다. 검증이 끝난
`courses.json`과 `summary.json`을 웹에 반영할 때만 `public/data`로
복사합니다.

## GitHub Pages 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 Pages용
정적 사이트를 빌드해 `https://daehyuh.github.io/2026-timetable/`에
자동 배포합니다. 같은 워크플로가 매시 7분과 37분에 학교 데이터를 다시
수집·검증하며, 강좌 수가 비정상적으로 급감한 데이터는 배포하지 않습니다.

공개 저장소에 60일 동안 활동이 없으면 GitHub가 예약 워크플로를 자동으로
비활성화할 수 있습니다. 이 경우 Actions 탭에서 워크플로를 다시 활성화해야
합니다. 자세한 내용은 [GitHub 예약 워크플로 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)를 참고하세요.
