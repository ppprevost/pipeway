# Why pipeway

## The problem

Server middleware is either **framework-locked** (Express middleware, Nest
guards, Next route boilerplate) or **all-in** (a whole framework like Hono). When
you move runtimes — Next → Bun, Node → Workers — you rewrite the request layer.

## The idea

A handler is just `(Request) => Response`. That signature is a **standard** every
modern runtime already speaks. Build the request lifecycle on it, and the same
handler runs everywhere.

## What you get

| | pipeway |
| --- | --- |
| Runtime coupling | none (Web standard) |
| Style | functional, composable |
| Guards / interceptors / filters | yes, as steps |
| Compile-time middleware ordering | yes |
| Domain `Result<T, E>` mapping | first-class |
| Routing / DI / ORM | not included (bring your own) |

## vs. the neighbours

- **Hono** is a framework (and a great one). pipeway is a *layer* you mount into
  your router — including Hono's.
- **tRPC / ts-rest** are RPC / contract-first. pipeway is middleware-first REST.
- **NestJS** gives you this lifecycle with classes, decorators, and a DI
  container. pipeway gives you the lifecycle as plain functions, nothing else.
