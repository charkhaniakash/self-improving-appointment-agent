import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Self-Improving Appointment Agent",
  description: "Patient scheduling with an evaluation-driven improvement loop",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
