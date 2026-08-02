# HUFS 2026-2 서울·글로벌캠퍼스 전체 강좌 데이터

한국외국어대학교 공개 강의시간표에서 2026학년도 2학기 서울·글로벌캠퍼스
학부의 전공/부전공, 교양, 기초 영역을 모두 조회합니다. 같은 캠퍼스 안에서
여러 영역으로 조회되는 강좌는 `년도·학기·캠퍼스·학수번호` 기준으로 합쳐
하나의 데이터셋으로 만듭니다.

## 실행

```powershell
cd .\crawler
node .\crawl.mjs --campus all
node .\validate.mjs
```

`--campus H1`은 서울캠퍼스만, `--campus H2`는 글로벌캠퍼스만 수집합니다.
기본값과 `--campus all`은 서울을 먼저 수집한 뒤 글로벌을 순차 수집합니다.

결과는 `data` 폴더에 생성됩니다.

- `courses.json`: 시간표 웹에서 사용하는 정규화된 통합 데이터
- `courses.csv`: Excel에서 열 수 있는 UTF-8 CSV
- `summary.json`: 전체 및 캠퍼스·이수구분·영역별 개수와 온라인/P/F/강의계획서 집계
- `raw.json`: 학교 API가 반환한 원본 보존본
- `validation.json`: 중복·필수 필드·집계 검증 결과

## 주요 필드

- `classification_types`: 해당 강좌가 검색되는 전공/교양/기초 구분
- `area_names`: 동일 강좌가 여러 학과에서 검색될 때의 전체 영역
- `query_contexts`: 중복을 합치기 전 조회 경로
- `campus_code`: 서울 `H1`, 글로벌 `H2`
- `online`: 온라인 강좌 여부
- `pass_fail`: P/F 여부
- `syllabus_url`: 강의계획서 제공 강좌의 직접 링크
- `meetings`: 요일, 교시, 강의실을 분리한 배열
- `schedule`: 학교 페이지의 강의시간/강의실 원문

학기 데이터는 수강신청 전후로 바뀔 수 있으므로 시간표 웹을 배포하거나
수강신청을 시작하기 전에 크롤러를 다시 실행하세요.
