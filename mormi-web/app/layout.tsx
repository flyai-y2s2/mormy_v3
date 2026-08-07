import type { Metadata } from "next";
import localFont from "next/font/local";
import Analytics from "./analytics-provider";
import "./globals.css";

// 별노트 — 모르미가 직접 쓴 삐뚤빼뚤한 손글씨.
// 네이버 나눔손글씨 「초딩희망」 (SIL OFL). 한글 음절 영역만 서브셋한 woff2.
const handFont = localFont({
  src: "./fonts/NanumChodingHuimang.woff2",
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "모르미 — 생활 속 수학 모험",
  description: "모르미와 카페·가게에서 필요한 생활 수학을 연습해요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${handFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 계측 — 키가 없으면 조용히 꺼진다 (렌더 결과 없음) */}
        <Analytics />
        {children}
        {/* 개발 단계 고지 — 아이가 아니라 어른(참관자·심사위원)에게 하는 말이므로 작고 조용하게 */}
        <footer className="px-4 pb-3 text-center text-[11px] leading-relaxed text-stone-400">
          음성 입력은 지원 브라우저에서 사용할 수 있으며, TTS(텍스트 읽어주기)는 추후 추가될 예정입니다.
        </footer>
      </body>
    </html>
  );
}
