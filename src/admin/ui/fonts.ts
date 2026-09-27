import { Geist_Mono, Inter } from 'next/font/google'

/**
 * Polices de l'admin, auto-hébergées par next/font (aucune requête vers Google côté navigateur).
 * Exposées en variables CSS (--k-font-inter, --k-font-geist-mono) lues par tokens.css
 * (--k-font-sans, --k-font-mono). Le site garde ses propres polices (src/app/layout.tsx).
 *
 * Inter : Medium 500 (Body*, Caption), Semi Bold 600 (Label*, Heading 3-4), Bold 700 (Heading 1-2).
 * Geist Mono : Regular 400 (style Code).
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--k-font-inter',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--k-font-geist-mono',
})

/**
 * Classes à poser sur le conteneur de l'admin, À CÔTÉ de data-kz-admin (même élément) :
 * les variables de police doivent y être définies pour que tokens.css les résolve.
 */
export const adminFontClassName = `${inter.variable} ${geistMono.variable}`
