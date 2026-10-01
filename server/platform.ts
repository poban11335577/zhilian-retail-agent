import {caseRoutes} from './case-workflow.ts';
import {financialView} from './finance.ts';
import {caseAnswer,caseFacts} from './case-agent.ts';
import {ledgerDatabase} from './ledger-inspect.ts';
import {ledgerView,ledgerWrite} from './ledger.ts';
import {newRun,executeStep} from './engine.ts';
import {releaseInfo,publishAgents} from './releases.ts';
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';import {z} from 'zod';
import type {Repository} from './api.ts';import {defaults} from '../lib/agents.ts';import {tables} from '../lib/business.ts';
import {databaseView,importBusiness} from './business-db.ts';import {prepareFacts,routeQuestion} from './collaboration.ts';import {modelSettings,saveModel,removeModelKey,callModel} from './model.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const json=(data:any,status=200,headers:any={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export async function platform(req:Request,repo:Repository,env:Record<string,string|undefined>,admin:boolean,ip:string,rate:(key:string,max:number,period:number)=>Promise<void>){
 const url=new URL(req.url),path=url.pathname.replace(/^\/\.netlify\/functions\/api/,'/api'),post=req.method==='POST';if(!path.startsWith('/api/v2/'))return null;
 async function body(){const text=await req.text();if(text.length>1500000)throw Error('请求过大');return JSON.parse(text)}
 const sign=(v:string)=>createHmac('sha256',env.SESSION_SECRET??'').update(v).digest('base64url');
 async function tenant(){try{const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('zhilian_company='))?.slice(16);if(!token)return 'demo';const [data,sig]=token.split('.');const v=JSON.parse(Buffer.from(data,'base64url').toString());if(!env.SESSION_SECRET||!equal(sign(data),sig)||v.exp<Date.now())return 'demo';const row=await repo.get('companies/'+v.id);return row&&v.version===row.value.accessVersion?v.id:'demo'}catch{return 'demo'}}
 const tenantId=await tenant();
 async function allAgents(){return Promise.all(defaults.map(async d=>({...d,...(await repo.get('agents/'+d.id))?.value})))}
 function publicChat(c:any){return {id:c.id,tenant:c.tenant,preview:!!c.preview,source:c.source,messages:c.messages,history:c.history??[],run:c.run?{id:c.run.id,status:c.run.status,revision:c.run.revision,scope:c.run.scope,configVersion:c.run.configVersion,modelEnabled:c.run.modelEnabled,startedAt:c.run.startedAt,finishedAt:c.run.finishedAt,steps:c.run.steps.map((s:any)=>({id:s.id,kind:s.kind,name:s.name,status:s.status,reason:s.reason,question:s.question,output:s.output,evidence:s.evidence,mode:s.mode,durationMs:s.durationMs,configRevision:s.config.revision,error:s.error}))}:null}}

 try{
 const caseResponse=await caseRoutes(req,path,repo,env,admin,ip,rate);if(caseResponse)return caseResponse;
 if(path.startsWith('/api/v2/ledger')){
  const b=post?await body():null,id=post?b.tenant:url.searchParams.get('tenant')??tenantId;
  if(typeof id!=='string'||(id!==tenantId&&!admin&&id!=='demo'))return json({error:'无权访问此企业账套'},403);
  if(id!=='demo'&&!await repo.get('companies/'+id))return json({error:'企业不存在'},404);
  if(!post)return json(await ledgerView(repo,id,url.searchParams.get('from')??'',url.searchParams.get('to')||'9999-12-31'));
  if(id==='demo')return json({error:'公共演示账套只读，请在后台创建独立企业'},403);
  if((path==='/api/v2/ledger/seed'||path==='/api/v2/ledger/approve')&&!admin)return json({error:'创建模拟账套需要管理员登录'},403);
  if(!['/api/v2/ledger','/api/v2/ledger/product','/api/v2/ledger/seed','/api/v2/ledger/plan','/api/v2/ledger/approve','/api/v2/ledger/receive','/api/v2/ledger/record'].includes(path))return json({error:'接口不存在'},404);
  return json(await ledgerWrite(repo,id,b,path.endsWith('/record')?'record':path.endsWith('/seed')?'seed':path.endsWith('/product')?'product':path.endsWith('/plan')?'plan':path.endsWith('/approve')?'approve':path.endsWith('/receive')?'receive':'document'));
 }
 if(path==='/api/v2/company-session'&&!post){const company=tenantId==='demo'?null:(await repo.get('companies/'+tenantId))?.value;const m=await modelSettings(repo);return json({tenant:tenantId,name:company?.name??'公共演示企业',demo:tenantId==='demo',modelReady:m.enabled&&m.hasKey&&(tenantId!=='demo'||m.guestEnabled),modelConfigured:m.hasKey})}
 if(path==='/api/v2/company-login'&&post){await rate('company-login/'+ip,10,900000);const b=await body();if(typeof b.id!=='string'||typeof b.accessCode!=='string'||!/^co_[a-f0-9]{16}$/.test(b.id))return json({error:'企业编号或访问码不正确'},401);const row=await repo.get('companies/'+b.id);if(!row||!equal(hash(b.accessCode),row.value.accessHash))return json({error:'企业编号或访问码不正确'},401);if(!env.SESSION_SECRET)throw Error('服务器登录配置缺失');const data=Buffer.from(JSON.stringify({id:b.id,version:row.value.accessVersion,exp:Date.now()+8*3600000})).toString('base64url');return json({ok:true},200,{'Set-Cookie':`zhilian_company=${data}.${sign(data)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${url.protocol==='https:'?'; Secure':''}`})}
 if(path==='/api/v2/company-logout'&&post)return json({ok:true},200,{'Set-Cookie':'zhilian_company=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
 if(path==='/api/v2/chat/start'&&post){await rate('chat-start/'+ip,20,3600000);const options=await body();if(options.preview&&!admin)return json({error:'草稿试运行需要管理员登录'},401);const preview=options.preview===true;const id=randomBytes(16).toString('hex'),accessKey=randomBytes(32).toString('base64url'),chat={id,preview,tenant:preview?'demo':tenantId,keyHash:hash(accessKey),source:tenantId==='demo'?'synthetic':'empty',messages:[],run:null,createdAt:new Date().toISOString()};await repo.put('chats/'+id,chat,null);return json({chat:publicChat(chat),accessKey},201)}
 if(path.startsWith('/api/v2/chat/')){
 const b=post?await body():null,id=post?b.id:url.searchParams.get('id'),key=req.headers.get('x-chat-key')??'';if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))return json({error:'会话不存在'},404);let row=await repo.get('chats/'+id);if(!row||(row.value.preview?!admin:row.value.tenant!==tenantId)||!equal(hash(key),row.value.keyHash))return json({error:'会话不存在，或需要重新登录企业'},404);let chat=row.value;
 if(path==='/api/v2/chat/read'&&!post)return json({chat:publicChat(chat)});
 if(path==='/api/v2/chat/send'&&post){if(chat.run?.status==='running')return json({error:'上一条消息还在处理，请继续执行或停止'},409);const question=z.string().trim().min(1).max(2000).parse(b.message);await rate('chat-send/'+ip,30,3600000);if(chat.messages.length>=80)throw Error('此会话已达到 40 轮，请新建咨询');if(chat.run){chat.history=[...(chat.history??[]),publicChat(chat).run].slice(-20)}chat.messages.push({role:'user',content:question});chat.run=await newRun(repo,chat,question);if(!await repo.put('chats/'+id,chat,row.version))return json({error:'会话已更新，请刷新'},409);return json({chat:publicChat(chat)})}
 if(path==='/api/v2/chat/retry'&&post){if(chat.run?.status!=='failed')return json({error:'只有失败的对话可以重试'},409);await rate('chat-send/'+ip,30,3600000);chat.history=[...(chat.history??[]),publicChat(chat).run].slice(-20);chat.run=await newRun(repo,chat,chat.run.question);if(!await repo.put('chats/'+id,chat,row.version))return json({error:'会话已更新，请刷新'},409);return json({chat:publicChat(chat)})}
 if(path==='/api/v2/chat/cancel'&&post){if(chat.run?.status==='running'){chat.run.status='cancelled';chat.run.finishedAt=new Date().toISOString();chat.messages.push({role:'assistant',content:'本次执行已停止，未完成节点不会继续运行。已发出的模型请求仍可能计入额度。',agent:'系统'});if(!await repo.put('chats/'+id,chat,row.version))return json({error:'状态发生变化，请刷新重试'},409)}return json({chat:publicChat(chat)})}
 if(path==='/api/v2/chat/step'&&post){if(!chat.run||chat.run.status!=='running')return json({chat:publicChat(chat)});const index=chat.run.steps.findIndex((s:any)=>s.status==='pending'||s.status==='running');if(index<0)return json({chat:publicChat(chat)});const step=chat.run.steps[index];if(step.status==='running'&&step.leaseUntil>Date.now())return json({chat:publicChat(chat),busy:true});step.status='running';step.leaseUntil=Date.now()+75000;step.lease=randomBytes(12).toString('hex');if(!await repo.put('chats/'+id,chat,row.version))return json({error:'节点正在执行，请刷新'},409);const claim=await repo.get('chats/'+id);if(claim?.value.run?.steps[index]?.lease!==step.lease)return json({error:'执行状态发生变化'},409);
 chat=await executeStep(repo,env.SESSION_SECRET??'',chat,index);
 if(!await repo.put('chats/'+id,chat,claim!.version))return json({error:'结果保存冲突，请刷新查看'},409);if(chat.preview&&chat.run.status==='completed'&&chat.run.steps.every((s:any)=>!s.error)){const k='tests/draft/'+chat.run.draftHash;const old=await repo.get(k);await repo.put(k,{chatId:id,at:new Date().toISOString(),model:chat.run.modelEnabled,question:chat.run.question},old?.version??null)}return json({chat:publicChat(chat)});
 }
 }
 if(path==='/api/v2/actions'){
 if(!admin&&tenantId==='demo')return json({error:'游客不能提交业务审批'},403);
 if(!post){const keys=await repo.list('actions/');const rows=await Promise.all(keys.map(async k=>(await repo.get(k))!.value));return json({actions:rows.filter(a=>admin||a.tenant===tenantId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
 const b=await body();if(b.id){if(!admin)return json({error:'只有后台管理员可以审批'},403);const input=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),revision:z.number().int(),status:z.enum(['approved','rejected']),note:z.string().trim().min(1).max(2000)}).parse(b),old=await repo.get('actions/'+input.id);if(!old||old.value.revision!==input.revision||old.value.status!=='pending')return json({error:'审批记录已更新，请刷新'},409);const next={...old.value,status:input.status,note:input.note,reviewedAt:new Date().toISOString(),revision:input.revision+1};if(!await repo.put('actions/'+input.id,next,old.version))return json({error:'审批冲突，请刷新'},409);return json({action:next})}
 if(tenantId==='demo')return json({error:'请以企业身份提交'},403);await rate('actions/'+tenantId,20,3600000);const input=z.object({title:z.string().trim().min(1).max(100),content:z.string().trim().min(1).max(9000)}).parse(b),id=randomBytes(16).toString('hex'),action={id,tenant:tenantId,...input,status:'pending',revision:1,createdAt:new Date().toISOString()};await repo.put('actions/'+id,action,null);return json({action},201)
 }
 if(!admin)return json({error:'请先登录管理后台'},401);
 if(path==='/api/v2/company-select'&&post){const b=await body();const row=typeof b.id==='string'&&/^co_[a-f0-9]{16}$/.test(b.id)?await repo.get('companies/'+b.id):null;if(!row)return json({error:'企业不存在'},404);if(!env.SESSION_SECRET)throw Error('服务器登录配置缺失');const data=Buffer.from(JSON.stringify({id:b.id,version:row.value.accessVersion,exp:Date.now()+8*3600000})).toString('base64url');return json({ok:true},200,{'Set-Cookie':`zhilian_company=${data}.${sign(data)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${url.protocol==='https:'?'; Secure':''}`})}
 if(path==='/api/v2/finance'&&!post){const id=url.searchParams.get('tenant')??'demo';if(id!=='demo'&&!await repo.get('companies/'+id))throw Error('企业不存在');return json(await ledgerView(repo,id,url.searchParams.get('from')??'',url.searchParams.get('to')||'9999-12-31'))}
 if(path==='/api/v2/history-finance'&&!post){const id=url.searchParams.get('tenant');if(!id||id==='demo'||!await repo.get('companies/'+id))throw Error('请先选择已导入的企业');return json(await financialView(repo,id,url.searchParams.get('from')??'',url.searchParams.get('to')??''))}
 if(path==='/api/v2/database-capabilities'&&!post)return json({schemaVersion:2,maxRowsPerTable:5000,maxDatabaseBytes:16777216,nullableCosts:true,signedFractionalSales:true});
 if(path==='/api/v2/releases'&&!post)return json(await releaseInfo(repo));
 if(path==='/api/v2/releases'&&post){const b=z.object({revision:z.number().int().min(1),hash:z.string(),rollback:z.number().int().min(1).optional()}).parse(await body());return json(await publishAgents(repo,b.revision,b.hash,b.rollback))}
 if(path==='/api/v2/model'&&!post)return json(await modelSettings(repo));
 if(path==='/api/v2/model'&&post)return json(await saveModel(repo,env.SESSION_SECRET??'',await body()));
 if(path==='/api/v2/model/remove'&&post)return json(await removeModelKey(repo));
 if(path==='/api/v2/model/test'&&post){await rate('model-test',5,60000);const result=await callModel(repo,env.SESSION_SECRET??'','仅回答：连接成功。','测试连接，不包含企业数据。');return json({ok:true,text:result.text})}
 if(path==='/api/v2/companies'&&!post){const keys=await repo.list('companies/');return json({companies:await Promise.all(keys.map(async k=>{const {accessHash,...c}=(await repo.get(k))!.value;return c}))})}
 if(path==='/api/v2/companies'&&post){const b=z.object({name:z.string().trim().min(1).max(80)}).parse(await body()),id='co_'+randomBytes(8).toString('hex'),accessCode=randomBytes(24).toString('base64url');await repo.put('companies/'+id,{id,name:b.name,accessHash:hash(accessCode),accessVersion:1,createdAt:new Date().toISOString()},null);return json({id,name:b.name,accessCode},201)}
 if(path==='/api/v2/database'&&!post){const id=url.searchParams.get('tenant')??'demo';if(id!=='demo'&&!await repo.get('companies/'+id))throw Error('企业不存在');return json(await ledgerDatabase(repo,id,url.searchParams.get('table')??'products',url.searchParams.get('from')??'',url.searchParams.get('to')||'9999-12-31',Number(url.searchParams.get('offset')??0)));}
 if(path==='/api/v2/database'&&post)return json({error:'经营账套须通过业务单据过账；历史资料请使用 history-database 导入，不自动记入财务。'},400);
 if(path==='/api/v2/history-database'){const b=post?await body():null,tenant=post?b.tenant:url.searchParams.get('tenant')??'demo';if(tenant!=='demo'&&!await repo.get('companies/'+tenant))throw Error('企业不存在');if(post)return json(await importBusiness(repo,tenant,b.tables,b.revision));return json(await databaseView(repo,tenant,(url.searchParams.get('table')??'products') as any))}
 if(path==='/api/v2/chats'&&!post){const keys=await repo.list('chats/');const chats=await Promise.all(keys.map(async k=>{const c=(await repo.get(k))!.value;return {...publicChat(c),createdAt:c.createdAt}}));return json({chats:chats.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
 return json({error:'接口不存在'},404);
 }catch(e){return json({error:e instanceof z.ZodError?'输入格式不正确':e instanceof Error?e.message:'请求失败'},400)}
}
