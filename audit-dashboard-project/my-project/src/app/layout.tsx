import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // Server-side: fetch active project config from DB directly
  const { db } = await import('@/lib/db')
  const { getActiveProjectId } = await import('@/lib/get-active-project')
  const activeId = await getActiveProjectId()
  const project = activeId ? await db.project.findUnique({ where: { id: activeId } }) : null

  const title = `${project?.name ?? 'Audit Dashboard'} — Comprehensive Audit`
  const description = project?.description ?? 'Comprehensive security and quality audit dashboard'

  return {
    title,
    description,
    keywords: ["audit", "fact-check", "remediation", "risk matrix", "security", "quality"],
    authors: [{ name: "Z.ai Audit" }],
    icons: {
      icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
