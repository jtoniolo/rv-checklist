# 11. State management on the web with Redux Toolkit and RTK Query

Date: 2026-07-17

## Status

Accepted.

[ADR-0018](0018-true-hybrid-ssr-web-architecture.md) amends this ADR.

## Context

The web application uses Next.js. Refer to ADR-0009. It needs a method to hold
the state on the client.

Most of the state of the application is **server state**. This is the
checklists, the runs, the tasks, and the log entries, which come from the NestJS
API.

The application also has a small quantity of state that is truly local to the
client. Examples are the state of the user interface during an active run, and
the rig that the user selected.

The owner wants Redux Toolkit.

## Decision

- **Redux Toolkit** is the state layer of the web application. It is in
  `libs/web/data-access`. Refer to ADR-0009.
- **RTK Query owns all the server state.** It gets the data from the API, holds
  the cache, and invalidates the cache. Each entity maps to an RTK Query tag
  type. The tag types are the rigs, the checklists, the runs, the tasks, and the
  log entries. Thus each mutation invalidates the exact reads that it changes.
- **Use a plain RTK slice for the client-local state only.** This is the state
  that does not exist on the server. Examples are the selected rig and the
  temporary state of the run screen. Do not write a thunk or a reducer for the
  data of the API.
- The store is on the client. Each route fills it. The SSR on the Worker renders
  without the store where that is possible. Refer to ADR-0001.

## Alternatives that we compared

- **React Query or SWR.** These libraries are the more usual selection with
  Next.js for the server state. But the client-local state would still need a
  different location. Also, the owner wants one Redux toolchain.
- **RTK slices with a fetch procedure that we write, in a thunk.** We rejected
  this alternative. RTK Query makes that code automatically. Also, the
  invalidation of the cache would become a manual task.

## Consequences

- The web application reaches the API through the hooks that RTK Query generates.
  To add an endpoint, declare it on the API slice. Do not write a thunk.
- The correctness of the cache depends on a careful use of the tags. Each
  mutation must declare the tags that it invalidates.
- The Zod schemas in `libs/shared/domain` give the types to the RTK Query
  endpoints. Refer to ADR-0009. Thus the model on the wire keeps one source of
  truth.
