import {get, put, list, BlobError, BlobPreconditionFailedError} from '@vercel/blob';
import type {Repository} from './api.ts';

export type BlobClient = Pick<typeof import('@vercel/blob'), 'get' | 'put' | 'list'>;
const root = 'zhilian/';
const encoded = (key:string) => key.split('/').map(encodeURIComponent).join('/');
const path = (key:string) => root + encoded(key) + '.json';

// State and encrypted credentials stay private. Uncached reads and conditional
// writes preserve the same optimistic concurrency contract as Netlify storage.
export function vercelRepository(client:BlobClient = {get, put, list}):Repository {
 return {
  async get(key) {
   const result = await client.get(path(key), {access:'private', useCache:false});
   if (!result) return null;
   if (result.statusCode !== 200 || !result.stream || !result.blob.etag) throw Error('Invalid private storage response');
   return {value:await new Response(result.stream).json(), version:result.blob.etag};
  },
  async put(key, value, version) {
   try {
    await client.put(path(key), JSON.stringify(value), {
     access:'private', addRandomSuffix:false, contentType:'application/json',
     cacheControlMaxAge:60, allowOverwrite:version !== null,
     ...(version !== null ? {ifMatch:version} : {})
    });
    return true;
   } catch (error) {
    if (error instanceof BlobPreconditionFailedError) return false;
    // The SDK reports an existing pathname as BlobError. Confirm existence
    // rather than masking authentication failures or storage outages.
    if (version === null && error instanceof BlobError) {
     const existing = await client.get(path(key), {access:'private', useCache:false});
     if (existing?.statusCode === 200 && existing.blob.etag) return false;
    }
    throw error;
   }
  },
  async list(prefix) {
   const keys:string[] = [], seen = new Set<string>(); let cursor:string|undefined;
   for (;;) {
    const page = await client.list({prefix:root + encoded(prefix), limit:1000, ...(cursor ? {cursor} : {})});
    for (const blob of page.blobs) {
     if (!blob.pathname.startsWith(root) || !blob.pathname.endsWith('.json')) continue;
     const key = blob.pathname.slice(root.length, -5).split('/').map(decodeURIComponent).join('/');
     if (key.startsWith(prefix)) keys.push(key);
    }
    if (!page.hasMore) return [...new Set(keys)];
    if (!page.cursor || seen.has(page.cursor)) throw Error('Invalid storage pagination');
    seen.add(page.cursor); cursor = page.cursor;
   }
  }
 };
}
