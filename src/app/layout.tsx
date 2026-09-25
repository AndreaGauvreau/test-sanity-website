// Layout racine, commun au site et à l'admin. Le style du site est chargé par
// (site)/layout.tsx uniquement, pour ne pas toucher à l'interface du Studio.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
