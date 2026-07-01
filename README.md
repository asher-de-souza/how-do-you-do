# How do you do, fellow kids?

A small browser skate park game built with React, Vite, Three.js, and React Three Fiber.

Production site: https://how-do-you-do-six.vercel.app/

The production link may become outdated if hosting changes.

## Requirements

- Node.js
- pnpm

## Install

```sh
pnpm install
```

## Run Locally

```sh
pnpm dev
```

The dev server usually starts at `http://localhost:4206/`. If that port is already in use, it will pick the next available port and print the URL in the terminal.

## Build

```sh
pnpm build
```

The production build is written to `dist/`.

## Preview The Build

```sh
pnpm preview
```

## Visual Smoke Test

```sh
pnpm verify:visual -- http://localhost:4207/
```

Replace the URL with whichever local URL the dev server printed.
