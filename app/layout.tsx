import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "HUFS GRID | 서울·글로벌 2026-2 시간표";
const description =
  "한국외대 서울·글로벌캠퍼스 2026학년도 2학기 전공·교양·기초 전체 강좌를 검색하고 충돌 없이 시간표를 조합해 보세요.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = (forwardedHost || requestHeaders.get("host") || "localhost:3000")
    .split(",")[0]
    .trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost")
        ? "http"
        : "https";
  const origin = `${protocol}://${host}`;
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: "HUFS GRID",
    keywords: [
      "한국외대",
      "한국외국어대학교",
      "서울캠퍼스",
      "글로벌캠퍼스",
      "시간표",
      "수강신청",
      "2026-2",
    ],
    openGraph: {
      title: "HUFS GRID | 2026-2 시간표 시뮬레이터",
      description:
        "서울·글로벌캠퍼스 전체 강좌를 검색하고 겹침 없이 조합하세요.",
      type: "website",
      locale: "ko_KR",
      url: origin,
      images: [
        {
          url: socialImage,
          width: 1733,
          height: 907,
          alt: "HUFS GRID 서울·글로벌캠퍼스 2026-2 시간표 시뮬레이터",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "HUFS GRID | 2026-2 시간표 시뮬레이터",
      description:
        "서울·글로벌캠퍼스 전체 강좌를 검색하고 겹침 없이 조합하세요.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#102923",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
