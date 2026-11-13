# 왁방주 (Wtd) 작업 메모

명일방주식 2.5D 타워디펜스 + 왁타버스 캐릭터. 개인 프로젝트, 한국어로 소통.

## 바로 플레이 링크
- https://claude.ai/artifact/D3hZRwVVyL3iHKahgGpw95 — 업데이트할 때마다 같은 링크로 재게시
- `npm run build:web` → `.artifact/index.html` + `dist/` 파일을 Artifact 도구로 같은 경로(file_path)에 publish

## SD 캐릭터 표준 방식 (사용자 확정)
1. 사용자가 멤버 사진을 올림 → `docs/SD_프롬프트/<이름>.md`에 전용 프롬프트 작성 (그림체 레퍼런스: `.sd-ref/style-sheet.png`)
2. 사용자가 무료 앱(Gemini/ChatGPT)으로 **대기 SD 그림 1장**을 생성해 올림
3. `npm run sd:import -- <그림> <멤버id>` → manifest에 `anchorX`(발), `face`(카드 얼굴), `tip`(무기 끝), `fxColor` 지정
4. 공격 모션은 **코드로 붙이는 방식**이 표준 (프레임 시트 사용 안 함): `src/sd/ImageRig.ts`
5. SD 도감 / 전투에서 확인 → build:web → 링크 재게시 → 커밋·푸시

## 참고
- 레퍼런스/생성 원본(`.sd-ref/`, `.sd-raw/`)은 git 제외 (원작·팬아트를 공개 저장소에 올리지 않음)
- Node fetch로 외부 API 호출 시 `NODE_USE_ENV_PROXY=1` 필요
- 테스트: `npm test`, 타입체크: `npx tsc --noEmit`
