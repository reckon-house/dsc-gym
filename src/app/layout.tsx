import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://dsc-gym.vercel.app"
  ),
  title: {
    default: "Dallas Sports Collective",
    template: "%s · DSC",
  },
  description:
    "Dallas Sports Collective — personal training scheduling.",
  applicationName: "Dallas Sports Collective",
  openGraph: {
    title: "Dallas Sports Collective",
    description: "Personal training scheduling.",
    siteName: "Dallas Sports Collective",
    images: ["/logo-mark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
