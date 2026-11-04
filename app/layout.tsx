import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { ThemeScript, ThemeSync } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s · Mason's Study",
    default: "Mason's Study",
  },
  description:
    "Upload your lecture slides and notes. Get a study guide written the way you learn, flashcards, exam-style practice and a Claude tutor beside your material.",
  applicationName: "Mason's Study",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1012" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(fraunces.variable, hanken.variable, jetbrains.variable)}
    >
      <head>
        {/* Applies the saved or system theme before first paint. */}
        <ThemeScript />
      </head>
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink antialiased">
        <ThemeSync />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
