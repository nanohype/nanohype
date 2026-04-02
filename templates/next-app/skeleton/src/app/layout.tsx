import { validateBootstrap } from "../bootstrap.js";
import type { Metadata } from "next";
import "./globals.css";

validateBootstrap();

export const metadata: Metadata = {
  title: "__PROJECT_NAME__",
  description: "__DESCRIPTION__",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
