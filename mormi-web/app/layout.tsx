import type { Metadata } from "next";
import { Gowun_Dodum, Nanum_Pen_Script } from "next/font/google";
import "./globals.css";

// 본문 — 둥글고 아이 친화적인 한글 서체
const bodyFont = Gowun_Dodum({
  variable: "--font-body",
  weight: "400",
  subsets: ["latin"],
});

// 별노트 — 모르미가 직접 쓴 삐뚤빼뚤한 손글씨
const handFont = Nanum_Pen_Script({
  variable: "--font-hand",
  weight: "400",
  subsets: ["latin"],
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
