import { PortableText, stegaClean, type PortableTextComponents, type PortableTextProps } from 'next-sanity'

import { SanityImage, type SanityImageValue } from './SanityImage'

const components: PortableTextComponents = {
  types: {
    image: ({ value }: { value: SanityImageValue & { caption?: string | null } }) => (
      <figure>
        <SanityImage image={value} sizes="(max-width: 800px) 100vw, 760px" />
        {value.caption && <figcaption>{value.caption}</figcaption>}
      </figure>
    ),
  },
  marks: {
    link: ({ children, value }) => {
      const href = stegaClean(value?.href as string | undefined) ?? '#'
      const external = /^https?:\/\//.test(href)
      return (
        <a href={href} {...(external && { target: '_blank', rel: 'noreferrer' })}>
          {children}
        </a>
      )
    },
  },
}

// Rendu du texte riche (Portable Text) : l'équivalent du champ Lexical de Payload,
// stocké en JSON structuré plutôt qu'en HTML.
export function PortableTextBody({ value }: { value: PortableTextProps['value'] }) {
  return <PortableText value={value} components={components} />
}
