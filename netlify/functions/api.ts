import {getStore} from '@netlify/blobs';
import {createAPI,type Repository} from '../../server/api.ts';
export default async (request:Request,context:any)=>{
 const store=getStore({name:'zhilian-business',consistency:'strong'});
 const repo:Repository={
 async get(key){const r=await store.getWithMetadata(key,{type:'json'});if(r&&!r.etag)throw Error("Missing storage version");return r?{value:r.data,version:r.etag!}:null},
 async put(key,value,version){const r=await store.setJSON(key,value,version?{onlyIfMatch:version}:{onlyIfNew:true});return r.modified},
 async list(prefix){const result=await store.list({prefix});return result.blobs.map(b=>b.key)}
 };
 return createAPI(repo,process.env)(request,context.ip??'unknown');
};

