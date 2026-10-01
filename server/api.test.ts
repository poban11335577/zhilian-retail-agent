import {releaseInfo,publishAgents} from './releases.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createAPI,passwordHash} from './api.ts';import {localRepository} from './local.ts';
test('customer → protected admin → revised Agent → customer report; persistence and isolation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'zhilian-test-'));try{
 const repo=localRepository(dir),env={ADMIN_PASSWORD_HASH:passwordHash('test-password-not-production'),SESSION_SECRET:'x'.repeat(48)};let app=createAPI(repo,env),cookie='';
 async function call(path:string,body?:any,auth=false,headers:any={}){const response=await app(new Request('http://localhost/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),'test');return {response,status:response.status,data:await response.json() as any}}
 assert.equal((await call('agents')).status,401);assert.equal((await call('admin/requests')).status,401);assert.equal((await call('retail?source=mine')).status,401);
 assert.equal((await call('login',{password:'bad'})).status,401);const logged=await call('login',{password:'test-password-not-production'});assert.equal(logged.status,200);cookie=logged.response.headers.get('set-cookie')!.split(';')[0];assert.equal((await call('session',undefined,true)).data.authenticated,true);
 const input={store:'测试门店',product:'无糖茶',goal:'运动会备货',days:7,uplift:40,average:80,stock:1200,safety:500,dataSource:'provided'};
 const created=await call('requests',input);assert.equal(created.status,201);const {report,accessKey}=created.data;assert.equal(report.forecast,784);assert.equal(report.suggested,100);assert.equal(report.trace.length,9);assert.equal(report.accessHash,undefined);
 assert.equal((await call('report?id='+report.id)).status,404);assert.equal((await call('report?id='+report.id,undefined,false,{'x-report-key':accessKey})).status,200);
 const other=await call('requests',input);assert.equal((await call('report?id='+other.data.report.id,undefined,false,{'x-report-key':accessKey})).status,404);
 assert.equal((await call('requests',{...input,stock:-1})).status,400);assert.equal((await call('requests',input,false,{origin:'https://evil.example'})).status,403);
 const agent=(await call('agents',undefined,true)).data.agents.find((a:any)=>a.id==='replenish');const changed={...agent,packSize:137,bufferPercent:30};assert.equal((await call('agents',changed,true)).status,200);assert.equal((await call('agents',changed,true)).status,409);
 const pending=(await call('requests',input)).data.report;assert.equal(pending.suggested,100);const release=await releaseInfo(repo);await repo.put('tests/draft/'+release.draftHash,{test:true},null);await publishAgents(repo,release.revision,release.draftHash);const newer=(await call('requests',input)).data.report;assert.equal(newer.suggested,137);assert.equal((await call('report?id='+report.id,undefined,false,{'x-report-key':accessKey})).data.report.suggested,100);
 assert.equal((await call('admin/review',{id:report.id,revision:1,note:'请核实到货日期'},true)).status,200);assert.equal((await call('admin/review',{id:report.id,revision:1,note:'stale'},true)).status,409);
 app=createAPI(localRepository(dir),env);assert.equal((await call('report?id='+report.id,undefined,false,{'x-report-key':accessKey})).data.report.note,'请核实到货日期');assert.equal((await call('admin/requests',undefined,true)).data.reports.length,4);
 const demo=(await call('retail',undefined,true)).data;assert.equal(demo.rows.length,252);assert.equal((await call('retail',{rows:[{...demo.rows[0],closing:-1}]},true)).status,400);assert.equal((await call('retail',{rows:[demo.rows[0]]},true)).status,200);assert.equal((await call('retail?source=mine',undefined,true)).data.rows.length,1);
 const altered=cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A');assert.equal((await call('admin/requests',undefined,false,{cookie:altered})).status,401);
 const malformed=await app(new Request('http://localhost/api/requests',{method:'POST',body:'{'}));assert.equal(malformed.status,400);
 const locked=createAPI(repo,{});assert.equal((await locked(new Request('http://localhost/api/login',{method:'POST',body:'{}'}))).status,503);
 }finally{await rm(dir,{recursive:true,force:true})}
});

