import type { Metadata } from "next";
import { Gowun_Dodum } from "next/font/google";
import localFont from "next/font/local";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
