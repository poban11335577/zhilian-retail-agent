import {test} from 'node:test';import assert from 'node:assert/strict';
import {ledgerWrite} from './ledger.ts';import {ledgerAnswer} from './ledger-query.ts';
import {createAPI,passwordHash,type Repository} from './api.ts';
function memory():Repository{const rows=new Map<string,any>();return {async get(k){return rows.has(k)?structuredClone(rows.get(k)):null},async put(k,v,version){const old=rows.get(k);if((old?.version??null)!==version)return false;rows.set(k,{value:structuredClone(v),version:String(Number(old?.version??0)+1)});return true},async list(p){return [...rows.keys()].filter(k=>k.startsWith(p));}};}
async function fixture(){const r=memory();let revision=0;for(const p of [{id:'T001',name:'轻醒无糖茶',unit:'瓶',price_cents:600},{id:'C001',name:'冰咖啡',unit:'瓶',price_cents:800}]){await ledgerWrite(r,'gold',{revision:revision++,product:p},'product');}const add=async(b:any)=>{const d=await ledgerWrite(r,'gold',{revision:revision++,...b});return d.id;};
 await add({key:'funding01',date:'2026-08-01',type:'capital',amount_cents:1000000,cash_cents:1000000});await add({key:'purchase1',date:'2026-08-01',type:'purchase',lines:[{product_id:'T001',quantity:20,unit_price_cents:200},{product_id:'C001',quantity:10,unit_price_cents:400}],cash_cents:8000});await add({key:'sale-aug1',date:'2026-08-31',type:'sale',lines:[{product_id:'T001',quantity:5,unit_price_cents:600},{product_id:'C001',quantity:1,unit_price_cents:800}],cash_cents:3800});await add({key:'purchase2',date:'2026-09-01',type:'purchase',lines:[{product_id:'T001',quantity:10,unit_price_cents:300}],cash_cents:3000});const sale=await add({key:'sale-sep1',date:'2026-09-02',type:'sale',lines:[{product_id:'T001',quantity:10,unit_price_cents:600},{product_id:'C001',quantity:3,unit_price_cents:800}],cash_cents:8400});await add({key:'sale-sep2',date:'2026-09-03',type:'sale',lines:[{product_id:'T001',quantity:2,unit_price_cents:500}],cash_cents:0});await add({key:'return01',date:'2026-09-04',type:'sale_return',reference:sale,lines:[{product_id:'T001',quantity:2,unit_price_cents:600}],cash_cents:1200});await add({key:'expense01',date:'2026-09-05',type:'expense',amount_cents:1000,cash_cents:1000});return r;}
const cases:[string,string[]][]=[
 ['2026年9月无糖茶买了多少卖了多少',['买入10瓶','卖出12瓶','退回2瓶','期末库存15瓶','58.00元','34.00元']],
 ['2026年8月无糖茶销量',['卖出5瓶','30.00元','20.00元']],
 ['2026年9月咖啡销量',['买入0瓶','卖出3瓶','24.00元','12.00元']],
 ['2026年9月T001销售额',['58.00元']],
 ['2026年9月C001销售额',['24.00元']],
 ['2026年9月全店销售额',['58.00元','24.00元']],
 ['2026年9月净利润是多少',['82.00元','36.00元','46.00元','10.00元']],
 ['2026年9月现金和利润为什么不同',['经营现金净流量32.00元','期末现金9990.00元','应收10.00元']],
 ['2026年9月财务对账',['9/9项对账通过']],
 ['2026年9月应收是多少',['应收10.00元']],
 ['2026年9月应付是多少',['应付0.00元']],
 ['2026年9月经营费用',['经营费用10.00元']],
 ['2026年9月整体经营情况',['经营净利润36.00元']],
 ['无糖茶库存多少',['库存15瓶','库存价值36.00元']],
 ['咖啡库存多少',['库存6瓶','库存价值24.00元']],
 ['哪些商品库存低于安全库存',['冰咖啡','低于安全库存']],
 ['2026年9月无糖茶价格',['当前标价6.00元','最近采购价3.00元']],
 ['2026年9月咖啡售价',['当前标价8.00元']],
 ['2026年9月销售额排名前1',['轻醒无糖茶','58.00元']],
 ['2026年9月销量排名前1',['轻醒无糖茶','净卖出10瓶']],
 ['2026年9月哪些采购单没到货',['1张已收货','没有未收货采购计划']],
 ['无糖茶促销补多少货',['活动持续几天','预计销量增长百分比']],
 ['无糖茶做7天促销补货',['预计销量增长百分比']],
 ['无糖茶销量增长20%补货',['活动持续几天']],
 ['无糖茶做7天促销增长20%补货',['活动 7 天','增长20%','包装倍数']],
 ['无糖茶做7天促销增长20%打5折补货',['折扣约束','单件预计毛利0.60元']],
 ['2025年9月无糖茶销量',['没有已过账业务单据']],
 ['2026年9月可乐卖了多少',['没有找到“可乐”']],
 ['“不存在的商品”库存多少',['没有找到“ 不存在的商品 ”'.replaceAll(' ','')]],
 ['2026-09-02至2026-09-04无糖茶销量',['买入0瓶','卖出12瓶','58.00元']],
 ['全部日期无糖茶销量',['卖出17瓶','88.00元','54.00元']],
];
test('31 reference questions match an independently hand-calculated ledger',async()=>{const r=await fixture();for(const [question,expected] of cases){const answer=await ledgerAnswer(r,'gold',question);for(const part of expected)assert(answer.text.includes(part),question+' missing '+part+'\n'+answer.text);}});
test('multi-turn changes month, product and promotion duration without mixing scopes',async()=>{const r=await fixture();let a=await ledgerAnswer(r,'gold','2026年9月无糖茶卖了多少');let context={...a.query,question:'2026年9月无糖茶卖了多少'};a=await ledgerAnswer(r,'gold','那八月呢？',context);assert(a.text.includes('卖出5瓶'));assert(!a.text.includes('咖啡'));context={...a.query,question:'2026年8月无糖茶卖了多少'};a=await ledgerAnswer(r,'gold','那咖啡呢？',context);assert(a.text.includes('卖出1瓶'));assert(!a.text.includes('无糖茶'));a=await ledgerAnswer(r,'gold','无糖茶做7天促销，增长20%，补多少货');context={...a.query,question:'无糖茶做7天促销，增长20%，补多少货'};a=await ledgerAnswer(r,'gold','那只做3天呢？',context);assert(a.text.includes('活动 3 天'));assert(a.text.includes('增长20%'));await assert.rejects(ledgerAnswer(r,'gold','2026年13月销量'),/月份/);});
test('ledger API rejects cross-company access, guest writes and unauthenticated seed',async()=>{const r=memory(),secret='test-secret-not-production-'.repeat(3),app=createAPI(r,{SESSION_SECRET:secret,ADMIN_PASSWORD_HASH:passwordHash('test-admin')});async function req(path:string,b?:any,cookie=''){const x=await app(new Request('http://localhost/api/'+path,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',cookie},...(b?{body:JSON.stringify(b)}:{})}),'ledger-auth');return {status:x.status,data:await x.json() as any,cookie:x.headers.get('set-cookie')?.split(';')[0]??''};}const admin=(await req('login',{password:'test-admin'})).cookie;const a=(await req('v2/companies',{name:'门店A'},admin)).data,b=(await req('v2/companies',{name:'门店B'},admin)).data,own=(await req('v2/company-login',{id:a.id,accessCode:a.accessCode})).cookie;assert.equal((await req('v2/ledger?tenant='+a.id)).status,403);assert.equal((await req('v2/ledger?tenant='+b.id,undefined,own)).status,403);assert.equal((await req('v2/ledger',{tenant:'demo',revision:0})).status,403);assert.equal((await req('v2/ledger/seed',{tenant:a.id,revision:0},own)).status,403);assert.equal((await req('v2/ledger/seed',{tenant:a.id,revision:0},admin)).status,200);assert.equal((await req('v2/ledger?tenant='+a.id,undefined,own)).data.products.length,12);assert.equal((await req('v2/ledger?tenant='+b.id,undefined,admin)).data.documents.length,0);assert.equal((await req('v2/ledger/seed',{tenant:a.id,revision:1},admin)).status,400);});

test('a single product purchase query sums only its matching document lines',async()=>{const r=await fixture();const a=await ledgerAnswer(r,'gold','2026年8月无糖茶采购单');assert(a.text.includes('所选商品行金额40.00元'));assert(!a.text.includes('80.00元'));assert.equal(a.evidence[0].rows[0].amount_cents,4000);});

test('a new undated inventory question resets the previous historical month',async()=>{const r=memory();const a=await ledgerAnswer(r,'demo','2026年8月矿泉水买了多少卖了多少');const b=await ledgerAnswer(r,'demo','哪些商品库存低于安全库存？',{...a.query,question:'2026年8月矿泉水买了多少卖了多少'});assert(b.text.includes('库存6瓶'));assert(b.text.includes('截至2026-09-30'));});
