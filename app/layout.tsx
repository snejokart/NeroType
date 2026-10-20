import type { Metadata } from "next";
import "./minimal.css";

export const metadata: Metadata = {
  title: "Печать героя — найди свой ритм",
  description: "Тренажёр слепой печати с игровыми режимами, достижениями и сохранением прогресса.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('hero_theme')==='light'?'light':'dark'}catch{document.documentElement.dataset.theme='dark'}" }} />
        <link rel="preload" href="/fonts/onest.woff" as="font" type="font/woff" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/unbounded.woff" as="font" type="font/woff" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/jetbrainsmono.woff" as="font" type="font/woff" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
