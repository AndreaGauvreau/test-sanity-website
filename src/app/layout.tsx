import { Geist, Geist_Mono } from 'next/font/google'

// Polices du site, auto-hébergées par next/font. Posées sur <html> parce que ce layout est
// commun au site et à l'admin : l'admin reçoit les variables mais ne s'en sert pas.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

// Layout racine, commun au site et à l'admin. Le style du site est chargé par
// (site)/layout.tsx uniquement, pour ne pas toucher à l'interface du Studio.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
