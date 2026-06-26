import { defineConfig } from 'vitepress'

// base must match the GitHub Pages sub-path: ppprevost.github.io/pipeway/
export default defineConfig({
  title: 'pipeway',
  description: 'A portable, typed request pipeline on Web-standard Request/Response.',
  base: '/pipeway/',
  cleanUrls: true,
  appearance: 'dark',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/pipeway/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:title', content: 'pipeway' }],
    ['meta', { property: 'og:description', content: 'One handler. Every runtime. A portable, typed request pipeline on Web-standard Request/Response.' }],
    ['meta', { property: 'og:image', content: 'https://ppprevost.github.io/pipeway/og.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://ppprevost.github.io/pipeway/' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://ppprevost.github.io/pipeway/og.png' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Why', link: '/guide/why' },
      { text: 'npm', link: 'https://www.npmjs.com/package/pipeway' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Compile-time ordering', link: '/guide/ordering' },
          { text: 'Why pipeway', link: '/guide/why' },
        ],
      },
      {
        text: 'API reference',
        items: [
          { text: 'Overview', link: '/api/' },
          { text: 'pipe()', link: '/api/pipe' },
          { text: 'Steps', link: '/api/steps' },
          { text: 'Result', link: '/api/result' },
          { text: 'Adapters', link: '/api/adapters' },
          { text: 'Client', link: '/api/client' },
          { text: 'React hooks', link: '/api/react' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/ppprevost/pipeway' }],
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Pierre-Philippe Prévost',
    },
  },
})
