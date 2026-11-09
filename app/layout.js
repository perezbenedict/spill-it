import { Manrope, Instrument_Serif } from "next/font/google";
import "./globals.css";
import "./theme.css";
import { cookies } from "next/headers";
import ThemeToggle from "@/components/theme/ThemeToggle";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
  weight: "400",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = {
  title: "Spill It",
  description: "Say what you really think.",
};

export default async function RootLayout({ children }) {
  const preference = (await cookies()).get("spill_theme")?.value;
  const theme = preference === "light" ? "light" : "dark";
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${instrumentSerif.variable} ${manrope.variable}`}
    >
      <body className="font-body bg-midnight text-ink antialiased">
        {children}
        <ThemeToggle initialTheme={theme}/>
      </body>
    </html>
  );
}
