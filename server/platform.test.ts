import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createAPI,passwordHash} from './api.ts';import {localRepository} from './local.ts';import {businessSample} from '../lib/business.ts';import {modelSettings,saveModel,callModel,removeModelKey} from './model.ts';
test('isolated company SQL databases, guest-only demo, durable chat pipeline, model secrets',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zhilian-platform-'));const repo=localRepository(dir),env={ADMIN_PASSWORD_HASH:passwordHash('test-login'),SESSION_SECRET:'test-secret-'.repeat(5)},app=createAPI(repo,env);let admin='',companyA='',companyB='';
 async function call(path:string,body?:any,cookie='',key=''){const r=await app(new Request('http://localhost/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',cookie,'x-chat-key':key},...(body?{body:JSON.stringify(body)}:{})}),'platform-test');return {status:r.status,data:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]??''}}
 try{
 admin=(await call('login',{password:'test-login'})).cookie;
 for(const endpoint of ['v2/model','v2/history-database','v2/companies','v2/chats'])assert.equal((await call(endpoint)).status,401);
 const a=(await call('v2/companies',{name:'企业 A'},admin)).data,b=(await call('v2/companies',{name:'企业 B'},admin)).data;
 companyA=(await call('v2/company-login',{id:a.id,accessCode:a.accessCode})).cookie;companyB=(await call('v2/company-login',{id:b.id,accessCode:b.accessCode})).cookie;
 assert.equal((await call('v2/company-session',undefined,companyA)).data.tenant,a.id);
 const sample=businessSample();sample.products[0].name='企业 A 专属商品';
 assert.equal((await call('v2/history-database',{tenant:a.id,revision:0,tables:sample},admin)).status,200);
 assert.equal((await call('v2/history-database?tenant='+b.id,undefined,admin)).data.total,0);
 assert.equal((await call('v2/history-database?tenant='+a.id,undefined,admin)).data.rows[0].name,'企业 A 专属商品');
 assert.equal((await call('v2/history-database?tenant=demo',undefined,admin)).data.rows[0].name,'轻醒无糖茶');
 assert.equal((await call('v2/history-database',{tenant:'demo',revision:1,tables:sample},admin)).status,400);
 assert.equal((await call('v2/history-database',{tenant:a.id,revision:0,tables:sample},admin)).status,400);
 assert.equal((await call('v2/history-database',{tenant:b.id,revision:0,tables:{inventory:[{product_id:'nonexistent',stock:5,safety_stock:1,as_of:'2026-09-01'}]}},admin)).status,400);
 assert.equal((await call('v2/history-database',{tenant:b.id,revision:0,tables:{products:[{id:'x',name:'x',price_cents:'wrong',cost_cents:5}]}},admin)).status,400);
 const created=(await call('v2/chat/start',{},companyA)).data,key=created.accessKey,id=created.chat.id;
 assert.equal((await call('v2/chat/read?id='+id,undefined,companyB,key)).status,404);assert.equal((await call('v2/chat/read?id='+id,undefined,'',key)).status,404);
 assert.equal((await call('v2/chat/send',{id,message:'整体经营有哪些风险？'},companyA,key)).status,200);
 assert.equal((await call('v2/chat/send',{id,message:'重复提交'},companyA,key)).status,409);
 let chat:any;for(let i=0;i<9;i++){const r=await call('v2/chat/step',{id},companyA,key);assert.equal(r.status,200,JSON.stringify(r.data));chat=r.data.chat}
 assert.equal(chat.run.status,'completed');assert.equal(chat.run.steps[0].id,'orchestrator');assert.equal(chat.run.steps.at(-1).id,'review');assert.equal(chat.messages.length,2);assert(chat.run.steps.some((s:any)=>s.evidence.some((e:any)=>e.sql.includes('JOIN'))));assert.equal(chat.run.steps[0].config,undefined);assert(!JSON.stringify(chat).includes('keyHash'));
 const again=(await call('v2/chat/read?id='+id,undefined,companyA,key)).data.chat;assert.equal(again.messages[1].content,chat.messages[1].content);
 const guest=(await call('v2/chat/start',{})).data;await call('v2/chat/send',{id:guest.chat.id,message:'供应商和采购交期'},'',guest.accessKey);const g=(await call('v2/chat/read?id='+guest.chat.id,undefined,'',guest.accessKey)).data.chat;assert.equal(g.tenant,'demo');assert(!JSON.stringify(g).includes('企业 A 专属商品'));
 const secret='fake-key-for-test-only';await saveModel(repo,env.SESSION_SECRET,{model:'test-model',apiKey:secret,enabled:true,revision:0,dailyLimit:2});assert.equal((await modelSettings(repo)).hasKey,true);assert(!JSON.stringify((await repo.get('settings/model'))?.value).includes(secret));assert(!JSON.stringify((await call('v2/model',undefined,admin)).data).includes(secret));
 let calls=0;const mock:typeof fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://api.openai.com/v1/responses');assert.equal((options!.headers as any).Authorization,'Bearer '+secret);assert.equal(JSON.parse(options!.body as string).store,false);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'测试返回'}]}]})};
 assert.equal((await callModel(repo,env.SESSION_SECRET,'role','facts',mock)).text,'测试返回');await callModel(repo,env.SESSION_SECRET,'role','facts',mock);await assert.rejects(callModel(repo,env.SESSION_SECRET,'role','facts',mock),/上限/);assert.equal(calls,2);
 await removeModelKey(repo);assert.equal((await modelSettings(repo)).enabled,false);assert.equal((await modelSettings(repo)).hasKey,false);
 }finally{const target=resolve(dir);assert(target.startsWith(resolve(tmpdir()))&&target.includes('zhilian-platform-'));await rm(target,{recursive:true,force:true})}
});
