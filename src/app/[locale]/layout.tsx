import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ClientLocaleDetector } from "@/components/ClientLocaleDetector";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradeNote MVP",
  description: "Prop Firm Trading Journal",
};

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{locale: string}>;
}>) {
  // Extract locale from params
  const { locale } = await params;
  
  // Ensure that the incoming `locale` is valid
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-gray-950 antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col md:flex-row text-white" suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          <ClientLocaleDetector />
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <Toaster theme="dark" position="top-right" richColors />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
