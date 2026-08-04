"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * PostHog 초기화. 키가 없으면 아무 일도 하지 않는다 —
 * 계측은 선택 사항이고, 없어도 앱은 완전히 정상 동작해야 한다.
 *
 * 수집 원칙(아동 대상 서비스): 이름·발화 원문·별노트 문장·모르미 발화는
 * 절대 보내지 않는다. 자동 수집(autocapture)·페이지뷰·세션 리코딩을 모두 끄고,
 * 코드가 명시적으로 부르는 이벤트만 나간다 (lib/analytics.ts).
 */
export default function Analytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    // dev 의 StrictMode 이중 실행에서 두 번 init 되는 것을 막는다
    if (posthog.__loaded) return;

    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
    });

    // 현장 파일럿용 아동 코드 — ?child=A1 처럼 주소로 넘긴다.
    // 연구용 익명 코드(A1, A2…)이며 아이의 실명이 아니다. 기기/세션을 사람이
    // 아니라 '연구 참여 번호'에 묶기 위한 최소 식별자다.
    const child = new URLSearchParams(location.search).get("child");
    if (child) posthog.identify(child);
  }, []);

  return null;
}
