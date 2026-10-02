import test from 'node:test';
import assert from 'node:assert/strict';
import {BlobError, BlobPreconditionFailedError} from '@vercel/blob';
import {vercelRepository, type BlobClient} from './vercel-repository.ts';

function memoryBlob() {
 const rows = new Map<string,{text:string,etag:string}>(); let version=0;
 const reads:any[] = [], writes:any[] = [];
 const client = {
  async get(path:string, options:any) {
   reads.push(options); const row=rows.get(path); if (!row) return null;
   return {statusCode:200,stream:new Response(row.text).body,blob:{etag:row.etag}};
  },
  async put(path:string, text:string, options:any) {
   writes.push(options); const old=rows.get(path);
   if (options.ifMatch && options.ifMatch!==old?.etag) throw new BlobPreconditionFailedError();
   if (!options.allowOverwrite && old) throw new BlobError('A blob with this pathname already exists');
   const etag='"'+(++version)+'"'; rows.set(path,{text,etag}); return {etag};
  },
  async list(options:any) {
   const all=[...rows.keys()].filter(p=>p.startsWith(options.prefix)).sort(), start=Number(options.cursor??0), paths=all.slice(start,start+2);
   return {blobs:paths.map(pathname=>({pathname})),hasMore:start+2<all.length,cursor:String(start+2)};
  }
 };
 return {client:client as unknown as BlobClient,rows,reads,writes};
}

test('private Vercel storage preserves atomic creation and stale-write rejection across independent instances',async()=>{
 const blob=memoryBlob(),a=vercelRepository(blob.client),b=vercelRepository(blob.client);
 const created=await Promise.all([a.put('usage/site-tokens',{used:0,reserved:10000},null),b.put('usage/site-tokens',{used:0,reserved:20000},null)]);
 assert.equal(created.filter(Boolean).length,1);
 const first=await a.get('usage/site-tokens'); assert.ok(first); assert.equal(first.value.reserved,10000);
 assert.equal(await b.put('usage/site-tokens',{used:1200,reserved:0},first.version),true);
 assert.equal(await a.put('usage/site-tokens',{used:0,reserved:0},first.version),false);
 assert.equal((await a.get('usage/site-tokens'))?.value.used,1200);
 assert.ok(blob.reads.every(o=>o.access==='private'&&o.useCache===false));
 assert.ok(blob.writes.every(o=>o.access==='private'&&o.addRandomSuffix===false));
 assert.equal(blob.writes[0].allowOverwrite,false); assert.equal(blob.writes[2].ifMatch,first.version);
});

test('private repository lists every page without crossing namespaces and never hides read or write failures',async()=>{
 const blob=memoryBlob(),repo=vercelRepository(blob.client);
 for (const key of ['chats/a','chats/b','chats/中文','chats/d','requests/a']) assert.equal(await repo.put(key,{key},null),true);
 blob.rows.set('other/chats/fake.json',{text:'{}',etag:'"0"'});
 assert.deepEqual((await repo.list('chats/')).sort(),['chats/a','chats/b','chats/d','chats/中文'].sort());
 assert.equal((await repo.get('chats/中文'))?.value.key,'chats/中文'); assert.equal(await repo.get('missing'),null);
 const unavailable={...blob.client,get:async()=>{throw Error('offline')}} as unknown as BlobClient;
 await assert.rejects(vercelRepository(unavailable).get('chats/a'),/offline/);
 const corrupt={...blob.client,get:async()=>({statusCode:200,stream:new Response('{}').body,blob:{etag:''}})} as unknown as BlobClient;
 await assert.rejects(vercelRepository(corrupt).get('chats/a'),/Invalid private storage response/);
 const rejected={...blob.client,put:async()=>{throw new BlobError('Unavailable')}} as unknown as BlobClient;
 await assert.rejects(vercelRepository(rejected).put('new',{x:1},null),/Unavailable/);
 const broken={...blob.client,list:async()=>({blobs:[],hasMore:true,cursor:'repeat'})} as unknown as BlobClient;
 await assert.rejects(vercelRepository(broken).list('chats/'),/Invalid storage pagination/);
});
