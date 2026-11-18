import type React from 'react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import 'katex/dist/katex.min.css';
import './globals.css';

const plusJakartaSans = localFont({
  src: './fonts/PlusJakartaSans-Variable.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: './fonts/JetBrainsMono-Variable.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SixthPhysics · IB, UK A-Level & NCUK IFY Physics Practice',
  description:
    'Verified Paper 1 multiple-choice and Paper 2 structured physics questions, deterministic diagrams, examiner mark schemes, and timed mock papers for IB Physics, UK A-Level, and NCUK IFY.',
};

const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('sixthphysics.theme')==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-[var(--sp-bg)] font-sans text-[var(--sp-ink)] antialiased selection:bg-blue-500/20">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
