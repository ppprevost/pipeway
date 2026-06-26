---
layout: home
hero:
  name: pipeway
  text: One handler. Every runtime.
  tagline: A portable, typed request pipeline on Web-standard Request/Response. NestJS lifecycle, zero framework lock-in.
  image:
    src: /hero.svg
    alt: pipeway
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why pipeway
      link: /guide/why
features:
  - title: Portable by default
    details: Your handler is (Request) => Response. Runs as-is on Bun, Deno, Workers, Next, Hono. One thin adapter for Express/Fastify.
  - title: NestJS ergonomics, no Nest
    details: Guards, interceptors, exception filters, serializers — plain composable functions. No classes, no decorators, no DI container.
  - title: Order enforced by the compiler
    details: A step that needs `user` cannot run before the step that adds it. TypeScript rejects the mistake before you ship it.
  - title: Result-first
    details: Return a domain Result<T, E> and map errors to responses in one place. No exceptions as control flow.
---
