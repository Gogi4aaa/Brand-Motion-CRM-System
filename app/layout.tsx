import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrandMotion CRM",
  description: "Работно пространство на агенцията — клиенти, фактури, задачи, анализи.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // data-theme is read by tokens.css; Plus Jakarta Sans is self-hosted via the
  // design system's fonts.css, so no next/font is needed.
  return (
    <html lang="bg" data-theme="light" suppressHydrationWarning>
      <body className="bm">{children}</body>
    </html>
  );
}
