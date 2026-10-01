import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const resolveFromCLI=createRequire(new URL('../node_modules/netlify-cli/package.json',import.meta.url));
const resolveFromBundler=createRequire(resolveFromCLI.resolve('@netlify/zip-it-and-ship-it'));
const {build}=await import(pathToFileURL(resolveFromBundler.resolve('esbuild')).href);
await build({entryPoints:['netlify/functions/api.ts'],outfile:'.server-functions/api.mjs',bundle:true,packages:'bundle',platform:'node',target:'node22',format:'esm',banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}});
console.log('Server function bundled with runtime dependencies.');
