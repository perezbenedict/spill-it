import { Manrope, DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif-display",
  display: "swap",
  weight: "400",
});

export const metadata = {
  title: "Spill It",
  description: "Say what you really think.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${manrope.variable} ${dmSerifDisplay.variable}`}
    >
      <body className="font-body bg-midnight text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
