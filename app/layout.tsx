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
  title: "Locked In",
  description: "Drop In. Lock In. Get Sh*t Done. Level up your work with others in the zone.",
  openGraph: {
    title: "Locked In",
    description: "Drop In. Lock In. Get Sh*t Done. Level up your work with others in the zone.",
    images: [
      {
        url: "https://locked-in.work/meta.png",
        width: 1200,
        height: 630,
        alt: "Locked In - Productivity App",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Locked In",
    description: "Drop In. Lock In. Get Sh*t Done. Level up your work with others in the zone.",
    images: ["https://locked-in.work/meta.png"],
  },
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
