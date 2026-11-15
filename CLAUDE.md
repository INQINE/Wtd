# 왁방주 (Wtd) 작업 메모

명일방주식 2.5D 타워디펜스 + 왁타버스 캐릭터. 개인 프로젝트, 한국어로 소통.

## 바로 플레이 링크
- https://claude.ai/artifact/D3hZRwVVyL3iHKahgGpw95 — 업데이트할 때마다 같은 링크로 재게시
- `npm run build:web` → `.artifact/index.html` + `dist/` 파일을 Artifact 도구로 같은 경로(file_path)에 publish

## 캐릭터 그림 2종 (사용자 확정)
모든 캐릭터는 기본 프로필 그림을 **2개** 갖는다.
| 종류 | 용도 | 가져오기 |
|---|---|---|
| **SD** (치비) | 전투 유닛, 덱 카드, 정보창, SD 도감 | `npm run sd:import -- <그림> <id>` |
| **일반 캐릭터 그림** (스탠딩 일러스트) | **메인 화면 비서, 편성 카드** | `npm run art:import -- <그림> <id>` (AI 배경 제거, 복잡한 배경도 가능) |
- 일반 그림이 없으면 메인 화면·편성 카드에 SD가 대신 나온다.
- 편성 카드 자르기: manifest `art.card = [얼굴x, 얼굴y, 보여줄 세로 비율]` (0~1). 넣은 뒤 편성 화면에서 얼굴이 잘리지 않았는지 확인.
- art-import의 배경 제거 모델(@imgly)은 sharp 버전 충돌 때문에 `scripts/rmbg-worker.mjs` 별도 프로세스에서 돈다.
- 모델이 남긴 배경 조각은 `--erase "x0,y0,x1,y1,#색,허용치"`, 가구 등 큰 덩어리는 `--erase-poly` / `--erase-poly-soft`(밝은 머리카락 유지)로 정리. 좌표는 결과 그림 기준 0~1 (가로·세로 각각).
- 모델이 얼굴 등 인물 안쪽을 잘못 지워 구멍이 생기면 `--fill-holes "x0,y0,x1,y1"`(입력 그림 기준)로 원본 픽셀 복원. 넣은 뒤 어두운 배경에서 얼굴 쪽 구멍을 꼭 확인.
- 가로로 넓거나 위가 잘린 일러스트는 `--focus-x`(얼굴 가로 위치)로 메인 화면 배치를 맞춤.

## SD 캐릭터 표준 방식 (사용자 확정)
1. 사용자가 멤버 사진을 올림 → `docs/SD_프롬프트/<이름>.md`에 전용 프롬프트 작성 (그림체 레퍼런스: `.sd-ref/style-sheet.png`)
2. 사용자가 무료 앱(Gemini/ChatGPT)으로 **대기 SD 그림 1장**을 생성해 올림 — 배경은 투명 PNG 또는 초록(#00FF00)/마젠타 단색 (흰 배경 금지)
3. `npm run sd:import -- <그림> <멤버id>` → manifest에 `anchorX`(발), `face`(카드 얼굴), `tip`(무기 끝), `fxColor` 지정
4. 공격 모션은 **코드로 붙이는 방식**이 표준 (프레임 시트 사용 안 함): `src/sd/ImageRig.ts`
5. SD 도감 / 전투에서 확인 → build:web → 링크 재게시 → 커밋·푸시

## 스테이지
- 데이터: `src/data/stages.ts` (0-1 + 1장 1-1~1-5), 적: `src/data/enemies.ts`, 선택 화면: `src/scenes/StageScene.ts`
- 스테이지를 추가·수정하면 `tests/plans.ts`에 정석 배치를 넣고 `npm test` — "아무것도 안 하면 패배, 정석 배치(스킬 없이)면 승리"를 자동 확인
- 흑화 멤버 보스: `EnemyDef.opSprite`(멤버 SD를 보라색으로) + `pulse`(주기적 광역 피해) + `boss`(상단 체력바)
- 기록(별, 잠금 해제)은 `src/data/save.ts`. 앞 스테이지를 깨야 다음이 열림

## 참고
- 헤드리스 브라우저는 소프트웨어 렌더링이라 전투 화면이 5~20fps로 느리게 돈다 (게임 시간도 같이 느려짐). 화면 테스트에서 타이머를 기다릴 땐 넉넉히
- 레퍼런스/생성 원본(`.sd-ref/`, `.sd-raw/`)은 git 제외 (원작·팬아트를 공개 저장소에 올리지 않음)
- Node fetch로 외부 API 호출 시 `NODE_USE_ENV_PROXY=1` 필요
- 테스트: `npm test`, 타입체크: `npx tsc --noEmit`
