import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, Noto_Sans, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { Rail } from "@/components/Rail";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "700", "800"] });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
// Banner type: Latin (incl. Serbian, Turkish), Cyrillic. Japanese loads only when a JA banner renders.
const noto = Noto_Sans({ variable: "--font-noto", subsets: ["latin", "latin-ext", "cyrillic"], weight: ["400", "600", "800", "900"] });
const notoJp = Noto_Sans_JP({ variable: "--font-noto-jp", weight: ["400", "700", "900"], preload: false });

export const metadata: Metadata = {
  title: "Adapty Flywheel",
  description: "Find out who pays, make ads for those people, and fund the spend.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${plex.variable} ${noto.variable} ${notoJp.variable}`}>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Rail />
          <main className="min-w-0 flex-1 px-5 py-6 md:px-10 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
