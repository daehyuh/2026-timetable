# HUFS GRID

한국외국어대학교 글로벌캠퍼스 2026학년도 2학기 시간표 시뮬레이터입니다.
전공·부전공, 교양, 기초를 포함한 1,590개 강좌를 검색하고 충돌 없이
시간표에 조합할 수 있습니다.

배포 사이트: https://hufs-grid-2026.daehyuh.chatgpt.site

## 주요 기능

- 교과목명, 교수명, 학수번호, 학과·영역 통합 검색
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
npm run lint
```

강좌 데이터는 `public/data/courses.json`, 수집 요약은
`public/data/summary.json`을 사용합니다.

## 강좌 데이터 재수집

`crawler`에는 한국외대 공개 강의시간표에서 2026-2 글로벌캠퍼스의
전공·부전공, 교양, 기초 강좌를 다시 수집하고 검증하는 소스만 포함되어
있습니다.

```bash
cd crawler
node crawl.mjs
node validate.mjs
```

생성되는 `crawler/data`는 Git에 포함되지 않습니다. 검증이 끝난
`courses.json`과 `summary.json`을 웹에 반영할 때만 `public/data`로
복사합니다.
