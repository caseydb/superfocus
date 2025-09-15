import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";
import "./utils/presenceDebug"; // Load debug utilities

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Superfocus",
  description: "Drop In. Lock In. Get Sh*t Done. Level up your work with others in the zone.",
  openGraph: {
    title: "Superfocus",
    description: "Drop In. Lock In. Get Sh*t Done. Level up your work with others in the zone.",
    images: [
      {
        url: "https://locked-in.work/meta.png",
        width: 1200,
        height: 630,
        alt: "Superfocus - Productivity App",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Superfocus",
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
    <html lang="en" style={{ backgroundColor: "#0A0B0B", minHeight: "100%" }}>
      <head>
        {/* Google Tag Manager Script */}
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-NN47SXRF');
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
        style={{ backgroundColor: "#0A0B0B", minHeight: "100vh" }}
      >
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-NN47SXRF"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
