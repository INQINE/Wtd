# 왁방주 (가제) — WAKTA KNIGHTS

명일방주식 타워디펜스에 왁타버스 캐릭터를 넣은 개인 프로젝트입니다.

- 기획서: [docs/기획서.md](docs/기획서.md)
- 플랫폼: 웹 (PC/모바일 브라우저, PWA로 설치 가능)
- 상태: **M0 프로토타입** (임시 그래픽, 스테이지 0-1 하나)

## 실행

```bash
npm install
npm run dev      # http://localhost:5173 (같은 와이파이의 폰에서는 화면에 나오는 Network 주소로 접속)
npm test         # 전투 로직 테스트
npm run build    # dist/ 에 배포용 파일 생성
```

## 폰에서 하기 (GitHub Pages)
1. 저장소 Settings → Pages → Source를 **GitHub Actions** 로 설정
2. `main` 브랜치에 push 하면 자동 배포 (Actions 탭에서 수동 실행도 가능)
3. 폰 브라우저로 접속 → "홈 화면에 추가" 하면 앱처럼 전체화면 실행

## 조작
| 동작 | 터치 / 마우스 | PC 단축키 |
|---|---|---|
| 배치 | 아래 카드를 끌어서 초록색 칸에 놓기 | 1~9 (오른쪽부터) 누르고 클릭 |
| 방향 | 놓은 뒤 멤버에서 바깥쪽으로 드래그 | |
| 정보 / 퇴각 | 배치된 멤버 누르기 → 퇴각 버튼 | Q |
| 일시정지 / 배속 | 오른쪽 위 버튼 | Space / F |
| 취소 | ✕ 버튼 | Esc |

## 폴더 구조
```
src/
  data/       멤버·적·스테이지·공격범위 데이터 (밸런스는 여기만 고치면 됨)
  battle/     전투 로직 (그래픽과 분리, 테스트 가능)
  scenes/     Phaser 화면 (타이틀, 전투)
  ui/         버튼, 테마
tests/        전투 로직 테스트
```

## 캐릭터 이미지 넣기 (예정)
지금은 퍼스널 컬러 원 + 이름 첫 글자로 된 임시 그래픽입니다.
`src/scenes/battle/views.ts`의 `OperatorView`만 바꾸면 SD 이미지로 교체할 수 있습니다.
git에 올리고 싶지 않은 이미지는 `public/assets/local/` 에 두세요 (.gitignore 처리됨).
