# 모르미 (Mormi) — 내가 가르칠게

아이가 **서툰 AI 동생 '모르미'를 가르치는** 초등 수학 학습 서비스.
학교 수업을 따라가기 어려운 저성취 아동을 위해, 평가받는 자리 대신 **가르치는 자리**에 아이를 놓는다.

이론적 근거는 **프로테제 효과**(Chase, Chin, Oppezzo & Schwartz, 2009) — 남을 가르치는 역할일 때
학습 효과가 커지며, 그 효과는 **저성취 아동에게서 가장 크게** 나타났다.

> SKT FLY AI · Y2S2 팀 · 프로토타입 (초3~4 수학, 분수 크기 비교 단원)

---

## 빠른 시작

```bash
cd mormi-web
npm install
cp .env.local.example .env.local   # 그리고 ANTHROPIC_API_KEY 를 채운다
npm run dev                        # http://localhost:3000
```

API 키는 https://platform.claude.com 에서 발급한다.
`.env.local` 은 `.gitignore` 에 있어 커밋되지 않는다 — **키를 코드에 직접 넣지 말 것.**

팀원에게 보여줄 땐 Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

> 터널 주소로 접속하면 누구나 이 키로 API를 호출하게 되므로,
> Anthropic 콘솔에서 **월 지출 한도**를 걸어두는 것을 권한다.

---

## 설계 원칙 — 통제는 코드, 언어는 LLM

지켜야 할 약속은 **전부 결정형 코드**가 보장한다. LLM은 "아이 말을 이해하는 일"과
"모르미 말투로 말하는 일"만 맡는다.

| 약속 | 보장하는 곳 |
|---|---|
| 아이 수준 바로 아래로만 틀린다 | 오개념 라이브러리 (수제 콘텐츠) |
| 갑자기 똑똑해지지 않는다 | 화자 프롬프트 + 별노트 게이트 |
| 세션은 반드시 정답으로 닫는다 | 상태 머신 (`lib/orchestrator.ts`) |
| 3분을 넘기지 않는다 | 예산 관리자 (`HARD_LIMIT_SEC`) |
| 아이를 평가하지 않는다 | 진단 기록은 교사용, 아이 화면 비노출 |

모르미의 실수는 **무작위 오답이 아니라 국내 문헌에 보고된 실제 오개념**이다
(예: "분모가 크면 분수도 크다"). 이것이 일반 챗봇과의 결정적 차이다.

---

## 구조

```
mormi-web/
  lib/orchestrator.ts   상태 머신 — 씬 전이·예외 분기·정답 닫기·예산 (LLM 아님)
  lib/claude.ts         Anthropic API 래퍼 (화자 / 분류기 / 리포터)
  lib/curriculum.ts     커리큘럼 KB 조회 (궁금해 사전·수업 준비 카드)
  lib/profile.ts        세션 간 영속 상태 (이름·표지·별노트)
  content/fractions.json            오개념 라이브러리 4종 — 수제 콘텐츠
  content/curriculum/4수01-11.json  AI Hub 교과 데이터에서 자동 추출한 KB
  app/page.tsx          단일 화면 — 씬·입력 모드는 전부 서버 지시를 따른다
  app/api/session/      세션 API (액션이 시나리오 버튼과 1:1 대응)
  components/           모르미·무대·궁금해 사전·별노트·분수 피자
scripts/build_curriculum.py   AI Hub 원본 → 커리큘럼 KB 변환
```

**턴 계약**: 매 턴 서버가 `scene` · `mormi` · `effects` · `input` 을 함께 내려준다.
화면이 발화를 보고 연출을 추측하면 상태와 어긋나기 때문이다.

---

## 세션 흐름

```
[최초 1회] onboarding  이름 → 별노트 첫 줄 → 표지 고르기 → 모르미 작명
     ↓
room → unit_select → dictionary(수업 준비) → teaching → closing → room
                                                ↑
                            모르미가 오개념으로 틀림 → 아이가 가르침
                            → 일반화 되물음("네 말로 설명해줘")
                            → 별노트 기록 → 숙제 검사 → 총정리 + 도장
```

- **발화 사다리 0~3** (가리키기 / 한 단어 / 빈칸 / 문장) — 막히면 내려간다.
  하위 칸은 **탭 선택지**로만 답한다(글씨 쓰기가 장벽인 아이를 위해).
- **예외 경로는 세션당 1회** — 두 번째 막힘은 즉시 긍정적 이월.
  모르는 채로, 오개념 상태로는 절대 정리하지 않는다.
- **이틀째부터** 모르미는 아이가 가르쳐준 문장만 기억한 채 나타난다.
  그 외에는 여전히 서툴러야 한다 — 아이를 앞지르는 순간 관계가 무너진다.

---

## 데이터

- **오개념 라이브러리** (`content/fractions.json`) — 국내 문헌 기반 **직접 제작**.
  단위분수 / 분자 같음 / 등가분수 / 1에 가까운 분수, 각각 사다리별 되묻기·기대답·
  선택지·일반화 되물음·위장 힌트·시각 반증·숙제 검사까지.
- **커리큘럼 KB** (`content/curriculum/`) — AI Hub 「교과 단계별 교과 데이터」에서 추출.
  원본(약 2GB)은 레포에 포함하지 않는다. 다시 만들려면:

  ```bash
  python3 scripts/build_curriculum.py "[4수01-11]"
  ```

---

## 개발 메모

- Next.js 16 / TypeScript / Tailwind
- 모델: 화자·비전 `claude-sonnet-5`, 분류기 `claude-haiku-4-5`, 리포터 `claude-sonnet-5`
- 분류기는 **구조화 출력**으로 스키마를 강제한다 (파싱 실패·라벨 오타 원천 차단)
- 고정 대사 구간(등장·사전 감탄·오개념 발화·숙제 제시)은 LLM을 호출하지 않는다
- 터널로 접속할 때 dev 서버가 `/_next/*` 를 막으면
  `next.config.ts` 의 `allowedDevOrigins` 를 확인할 것
- **계측(PostHog)** — `lib/analytics.ts` 가 세션 흐름을 이벤트로 남긴다.
  `.env.local` 에 `NEXT_PUBLIC_POSTHOG_KEY` 를 채우면 켜지고, **비워 두면 조용히 꺼진다**
  (없어도 앱은 완전히 정상 동작한다).
- 현장 파일럿에서는 주소에 `?child=A1` 처럼 **연구용 아동 코드**를 붙여 기기를 식별한다.
- 개인정보 규칙: **아이 이름·발화 원문·별노트 문장·모르미 발화는 어떤 이벤트에도 싣지 않는다.**
  보내는 것은 단원 id, 사다리 숫자, 횟수, 소요 ms, boolean 플래그 같은 구조 데이터뿐이다.
  (autocapture·페이지뷰·세션 리코딩은 모두 꺼 둔다)
