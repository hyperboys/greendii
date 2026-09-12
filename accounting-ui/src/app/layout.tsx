import type { Metadata } from "next";
import { Noto_Sans_Thai, Public_Sans } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
});

export const metadata: Metadata = {
  title: "GreenDii Accounting",
  description: "ระบบบัญชีและการเงิน GreenDii",
  icons: { icon: "/logo.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${publicSans.variable} ${notoSansThai.variable}`}>
      <body>{children}</body>
    </html>
  );
}
