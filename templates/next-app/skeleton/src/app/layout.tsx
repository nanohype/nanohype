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
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
