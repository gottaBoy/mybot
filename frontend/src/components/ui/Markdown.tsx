import type { ReactNode } from 'react'
import { Markdown } from '@astryxdesign/core/Markdown'

const markdownComponents = {
  image: ({ alt }: { src: string; alt: string }) => (
    <span>[{alt || 'Image'}]</span>
  ),
  link: ({ href, children }: { href: string; children: ReactNode }) =>
    /^https?:\/\//i.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
}

export function AppMarkdown({ children }: { children: string }) {
  // Do not auto-fetch images or turn relative/API paths into navigations.
  return (
    <Markdown density="compact" components={markdownComponents}>
      {children}
    </Markdown>
  )
}
