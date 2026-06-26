import { defineConfig } from 'vitepress'
import { transformerTwoslash } from 'vitepress-plugin-twoslash'

// base must match the GitHub Pages sub-path: ppprevost.github.io/pipeway/
export default defineConfig({
  title: 'pipeway',
  description: 'A portable, typed request pipeline on Web-standard Request/Response.',
  base: '/pipeway/',
  cleanUrls: true,
  markdown: {
    codeTransformers: [transformerTwoslash()],
    languages: ['ts', 'js'],
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Why', link: '/guide/why' },
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
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/ppprevost/pipeway' }],
  },
})
