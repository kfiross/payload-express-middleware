// // import { Glob, $ } from "bun"

// // await $`rm -rf dist`
// // const files = new Glob("./src/**/*.{ts,tsx}").scan()
// // for await (const file of files) {
// //   await Bun.build({
// //     format: "esm",
// //     outdir: "dist/esm",
// //     external: ["*"],
// //     root: "src",
// //     entrypoints: [file],
// //   })
// // }
// // await $`tsc --outDir dist/types --declaration --emitDeclarationOnly --declarationMap`



// import type { BuildConfig } from 'bun'
// import dts from 'bun-plugin-dts'

// const defaultBuildConfig: BuildConfig = {
//   entrypoints: ['src/index.ts'],
//   outdir: 'dist',
//   target: 'node',
// }

// await Promise.all([
//   Bun.build({
//     ...defaultBuildConfig,
//     plugins: [dts()],
//     format: 'esm',
//     naming: "[dir]/[name].js",
//   }),
  
//   Bun.build({
//     ...defaultBuildConfig,
//     //@ts-ignore
//     format: 'cjs',
//     naming: "[dir]/[name].cjs",
//   })
// ])



// await Bun.build({
//   entrypoints: ["src/index.ts"],
//   outdir: "dist",
//   format: "esm",
//   target: "node",
//   plugins: [dts()],
//   external: ["*"], // do not bundle dependencies
//   splitting: false,
// });

// const files = new Glob("./src/**/*.{ts,tsx}").scan()
// for await (const file of files) {
//   await Bun.build({
//     format: "esm",
//     outdir: "dist",
//     external: ["*"],
//     root: "src",
//     entrypoints: [file],
//     plugins: [dts()],
//   })
// }

// import dts from 'bun-plugin-dts';
import {  $ } from "bun"

await $`rm -rf dist`

await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist/esm",
  format: "esm",
  external: ["*"],
  // plugins: [dts()],
})

await $`tsc --outDir dist/types --declaration --emitDeclarationOnly --declarationMap`