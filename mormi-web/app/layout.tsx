import type { Metadata } from "next";
import { Gowun_Dodum } from "next/font/google";
import localFont from "next/font/local";
import Analytics from "./analytics-provider";
import "./globals.css";

// 본문 — 둥글고 아이 친화적인 한글 서체
const bodyFont = Gowun_Dodum({
  variable: "--font-body",
  weight: "400",
  subsets: ["latin"],
});

// 별노트 — 모르미가 직접 쓴 삐뚤빼뚤한 손글씨.
// 네이버 나눔손글씨 「초딩희망」 (SIL OFL). 한글 음절 영역만 서브셋한 woff2.
const handFont = localFont({
  src: "./fonts/NanumChodingHuimang.woff2",
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "모르미 — 내가 가르칠게",
  description: "일부러 서툰 AI 동생을 가르치며 배우는 학습 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${bodyFont.variable} ${handFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 계측 — 키가 없으면 조용히 꺼진다 (렌더 결과 없음) */}
        <Analytics />
        {children}
        {/* 개발 단계 고지 — 아이가 아니라 어른(참관자·심사위원)에게 하는 말이므로 작고 조용하게 */}
        <footer className="px-4 pb-3 text-center text-[11px] leading-relaxed text-stone-400">
          본 서비스는 현재 개발 중으로, 추후 STT(음성으로 입력하기) 및 TTS(텍스트
          읽어주기) 기능이 추가될 예정입니다.
        </footer>
      </body>
    </html>
  );
}
