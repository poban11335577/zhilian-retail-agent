import {drafts,publishedAgents,releaseState} from './releases.ts';
import {platform} from './platform.ts';
import {createHash,createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {defaults} from '../lib/agents.ts';
import {sample,retailSchema,summarize} from '../lib/retail.ts';
export interface Repository {get(key:string):Promise<{value:any,version:string}|null>; put(key:string,value:any,version:string|null):Promise<boolean>; list(prefix:string):Promise<string[]>}
class HttpError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
const bad=(message:string,status=400)=>{throw new HttpError(status,message)};
const requestSchema=z.object({store:z.string().trim().min(1).max(80),product:z.string().trim().min(1).max(80),goal:z.string().trim().min(1).max(1000),days:z.number().int().min(1).max(60),uplift:z.number().min(0).max(300),average:z.number().min(0).max(1000000),stock:z.number().int().min(0).max(10000000),safety:z.number().int().min(0).max(10000000),dataSource:z.enum(['demo','provided'])});
const agentSchema=z.object({id:z.string(),name:z.string().trim().min(1).max(50),description:z.string().max(300),prompt:z.string().min(1).max(12000),tools:z.array(z.enum(['products','orders','inventory','campaigns','suppliers','purchase_orders','sales_orders','deliveries','returns'])).max(9),packSize:z.number().int().min(1).max(10000),bufferPercent:z.number().min(0).max(100),revision:z.number().int().min(0),enabled:z.boolean().default(true),delegates:z.array(z.string()).max(7).optional()});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function equal(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)}
export function passwordHash(password:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,32).toString('hex')}
export function createAPI(repo:Repository,env:Record<string,string|undefined>){
 const secret=()=>{if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32||!env.ADMIN_PASSWORD_HASH)bad('后台尚未设置登录密码，请先完成服务器配置。',503);return env.SESSION_SECRET!};
 const sign=(s:string)=>createHmac('sha256',secret()).update(s).digest('base64url');
 function isAdmin(req:Request){if(!env.SESSION_SECRET||!env.ADMIN_PASSWORD_HASH)return false;try{const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('zhilian_session='))?.slice(16);if(!token)return false;const [data,sig]=token.split('.');const p=JSON.parse(Buffer.from(data,'base64url').toString());return equal(sign(data),sig)&&p.exp>Date.now()&&p.role==='admin'&&p.v===hash(env.ADMIN_PASSWORD_HASH)}catch{return false}}
 async function rate(key:string,max:number,period:number){const k='rate/'+hash(key)+':'+Math.floor(Date.now()/period);for(let i=0;i<5;i++){const old=await repo.get(k),n=(old?.value.count??0)+1;if(n>max)bad('请求较多，请稍后再试。',429);if(await repo.put(k,{count:n},old?.version??null))return}bad('请求较多，请稍后再试。',429)}
 async function agents(){return publishedAgents(repo)}
 async function body(req:Request){const text=await req.text();if(text.length>1000000)bad('请求过大，请减少数据量。',413);try{return JSON.parse(text)}catch{bad('请求格式不正确。')}}
 const json=(data:any,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
 return async function api(req:Request,ip='unknown'){
 try{
 const url=new URL(req.url),path=url.pathname.replace(/^\/\.netlify\/functions\/api/,'/api'),method=req.method;
 if(!['GET','POST'].includes(method))return json({error:'不支持此请求方法'},405);
 if(method==='POST'&&((req.headers.get('origin')&&req.headers.get('origin')!==url.origin)||req.headers.get('sec-fetch-site')==='cross-site'))bad('不允许跨站提交。',403);
 const feature=await platform(req,repo,env,isAdmin(req),ip,rate);if(feature)return feature;
 if(path==='/api/session'&&method==='GET')return json({authenticated:isAdmin(req),configured:Boolean(env.ADMIN_PASSWORD_HASH&&env.SESSION_SECRET)});
 if(path==='/api/login'&&method==='POST'){secret();await rate('login/'+ip,10,15*60000);const b=await body(req);if(typeof b.password!=='string'||b.password.length>256)bad('密码不正确',401);const [salt,expected]=env.ADMIN_PASSWORD_HASH!.split(':');const actual=scryptSync(b.password,salt,32).toString('hex');if(!equal(actual,expected))bad('密码不正确',401);const data=Buffer.from(JSON.stringify({role:'admin',exp:Date.now()+8*3600000,v:hash(env.ADMIN_PASSWORD_HASH!)})).toString('base64url');return json({ok:true},200,{'Set-Cookie':`zhilian_session=${data}.${sign(data)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${url.protocol==='https:'?'; Secure':''}`})}
 if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'Set-Cookie':'zhilian_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});
 if(path==='/api/requests'&&method==='POST'){
 await rate('submit/'+ip,20,3600000);const parsed=requestSchema.safeParse(await body(req));if(!parsed.success)bad('请检查门店、商品、活动描述和数值范围。');const input=parsed.data!,as=await agents();
 if(['products','orders','inventory','campaigns'].some(t=>!as[0].tools.includes(t)))bad('分析服务暂未开放，请联系管理员检查 Agent 数据能力。',503);
 const policy=as.find(a=>a.id==='replenish')!,forecast=Math.ceil(input.average*input.days*(1+input.uplift/100)),remaining=input.stock-forecast,gap=Math.max(0,input.safety-remaining),suggested=Math.ceil(gap*(1+policy.bufferPercent/100)/policy.packSize)*policy.packSize;
 const started=Date.now(),id=randomBytes(16).toString('hex'),accessKey=randomBytes(32).toString('base64url');
 const outputs:any={orchestrator:'收到 '+input.store+' 的促销备货需求',demand:`需求增幅 ${input.uplift}% 为客户填写的情景假设`,forecast:`日均 ${input.average} × ${input.days} 天 × ${1+input.uplift/100}，向上取整为 ${forecast}`,inventory:`当前 ${input.stock} − 预计销售 ${forecast} = ${remaining}；安全库存 ${input.safety}`,replenish:`缺口 ${gap}，缓冲 ${policy.bufferPercent}%，包装 ${policy.packSize}，建议补货 ${suggested}`,strategy:gap?'活动前先核实供应商到货量和日期，补货未落实前限制推广范围。':'库存可覆盖当前预测及安全库存。活动中每日复核销量，及时调整。'};
 const report={id,input,createdAt:new Date().toISOString(),status:'generated',note:'',revision:1,forecast,remaining,gap,suggested,packSize:policy.packSize,bufferPercent:policy.bufferPercent,engine:'规则计算 · 大模型未连接',trace:as.map(a=>({id:a.id,name:a.name,revision:a.revision,output:outputs[a.id]??(a.id==='review'?'已核对销量、库存及补货公式。本报告为规则计算，执行前需人工确认。':'结构化测算未提供此部门的数据，暂不能分析。'),status:'completed'})),durationMs:Date.now()-started};
 if(!await repo.put('requests/'+id,{...report,accessHash:hash(accessKey)},null))bad('保存失败，请重试。',503);return json({report,accessKey},201);
 }
 if(path==='/api/report'&&method==='GET'){const id=url.searchParams.get('id')??'',key=req.headers.get('x-report-key')??'';if(!/^[a-f0-9]{32}$/.test(id)||key.length>128)bad('报告不存在或访问凭证不正确',404);const row=await repo.get('requests/'+id);if(!row||!equal(hash(key),row.value.accessHash))bad('报告不存在或访问凭证不正确',404);const {accessHash,...report}=row!.value;return json({report})}
 if(!isAdmin(req))bad('请先登录管理后台。',401);
 if(path==='/api/agents'&&method==='GET')return json({user:{name:'管理员'},agents:await drafts(repo)});
 if(path==='/api/agents'&&method==='POST'){const p=agentSchema.safeParse(await body(req));if(!p.success||!defaults.some(d=>d.id===p.data?.id))bad('请检查名称、提示词和业务参数。');const c=p.data!;if(['orchestrator','review'].includes(c.id)&&!c.enabled)bad('总控与回顾节点不可禁用');if(c.delegates?.some(id=>!defaults.some(a=>a.id===id&&!['orchestrator','review'].includes(id))))bad('调度目标不正确');await releaseState(repo);const old=await repo.get('agents/'+c.id);if((old?.value.revision??0)!==c.revision)bad('配置已更新，请重新载入再修改。',409);const next={...c,revision:c.revision+1};if(!await repo.put('agents/'+c.id,next,old?.version??null))bad('配置已更新，请重新载入再修改。',409);return json({ok:true,revision:next.revision})}
 if(path==='/api/retail'&&method==='GET'){const own=url.searchParams.get('source')==='mine',rows=own?(await repo.get('retail/import'))?.value.rows??[]:sample();return json({rows,summary:summarize(rows),source:own?'管理员导入 · 未核验真实性':'模拟案例',user:{name:'管理员'}})}
 if(path==='/api/retail'&&method==='POST'){const b=await body(req),p=z.array(retailSchema).min(1).max(500).safeParse(b.rows);if(!p.success)bad('每次导入 1–500 行，且期初 + 入库 − 销售必须等于期末。');const rows=p.data!,keys=new Set(rows.map(r=>r.date+':'+r.sku));if(keys.size!==rows.length)bad('同一文件中日期与商品不能重复。');for(let i=0;i<5;i++){const old=await repo.get('retail/import'),map=new Map((old?.value.rows??[]).map((r:any)=>[r.date+':'+r.sku,r]));rows.forEach(r=>map.set(r.date+':'+r.sku,r));if(map.size>10000)bad('当前版本最多保存 10000 行经营明细。');if(await repo.put('retail/import',{rows:Array.from(map.values()).sort((a:any,b:any)=>a.date.localeCompare(b.date))},old?.version??null))return json({ok:true,count:rows.length})}bad('数据正在更新，请重试。',409)}
 if(path==='/api/retail/analyze'&&method==='POST'){const b=await body(req),rows=b.source==='mine'?(await repo.get('retail/import'))?.value.rows??[]:sample(),all=rows.filter((r:any)=>r.sku===b.sku).sort((a:any,b:any)=>a.date.localeCompare(b.date)),last=all.at(-1),baseline=all.filter((r:any)=>!r.promo).slice(-28);if(!last||!baseline.length)bad('缺少此商品的非促销日记录。');const valid=z.object({days:z.number().int().min(1).max(60),uplift:z.number().min(0).max(300)}).safeParse(b);if(!valid.success)bad('请检查天数和增幅。');const as=await agents(),policy=as.find(a=>a.id==='replenish')!,average=baseline.reduce((n:number,r:any)=>n+r.sold,0)/baseline.length,forecast=Math.ceil(average*b.days*(1+b.uplift/100)),remaining=last.closing-forecast,gap=Math.max(0,last.safety-remaining),suggested=Math.ceil(gap*(1+policy.bufferPercent/100)/policy.packSize)*policy.packSize;return json({name:last.name,forecast,remaining,gap,suggested,asOf:last.date,trace:as.map(a=>({name:a.name,revision:a.revision,output:a.id==='replenish'?`建议补货 ${suggested}`:a.id==='forecast'?`预计销售 ${forecast}`:a.id==='inventory'?`预计结余 ${remaining}`:'规则执行完成'}))})}
 if(path==='/api/admin/requests'&&method==='GET'){const keys=await repo.list('requests/'),rows=await Promise.all(keys.map(k=>repo.get(k)));return json({reports:rows.filter(Boolean).map(r=>{const {accessHash,...v}=r!.value;return v}).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))})}
 if(path==='/api/admin/review'&&method==='POST'){const p=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),revision:z.number().int(),note:z.string().trim().min(1).max(3000)}).safeParse(await body(req));if(!p.success)bad('请填写回复内容。');const b=p.data!,old=await repo.get('requests/'+b.id);if(!old)bad('需求不存在',404);if(old!.value.revision!==b.revision)bad('回复已被更新，请刷新后重试。',409);const report={...old!.value,note:b.note,status:'reviewed',revision:b.revision+1,reviewedAt:new Date().toISOString()};if(!await repo.put('requests/'+b.id,report,old!.version))bad('回复已被更新，请刷新后重试。',409);return json({ok:true})}
 return json({error:'接口不存在'},404);
 }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('API failure',e instanceof Error?e.name:'Error');return json({error:'服务暂时不可用，请稍后重试。'},500)}
 }
}



