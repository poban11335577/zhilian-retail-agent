import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseFacts} from './case-agent.ts';
import {forecastProduct} from './case-forecast.ts';
import {buildProfitBaseline,profitDefaults} from '../lib/profit-forecast.ts';
import {buildGoalReport,evaluateOperatingPlan} from '../lib/goal-planner.ts';
import {goalConditions,followupGoalBase} from './profit-skill.ts';
import {newCaseRun,stepCaseRun} from './case-workflow.ts';
import {saveModel} from './model.ts';
import {reportTables,chineseReportHTML} from '../lib/decision-report.ts';
import {decisionWorkbook,unzipReportTemplate} from '../lib/report-xlsx.ts';
import type {Repository} from './api.ts';
const c=caseFacts(),b=buildProfitBaseline(c),scope={from:'2026-09-01',to:'2026-09-30'},secret='goal-planner-test-secret'.repeat(3);
function memory():Repository{const rows=new Map<string,any>();return {async get(k){return structuredClone(rows.get(k)??null)},async list(p){return [...rows.keys()].filter(k=>k.startsWith(p))},async put(k,v,version){if((rows.get(k)?.version??null)!==version)return false;rows.set(k,{value:structuredClone(v),version:String(Number(version??0)+1)});return true}}}
async function run(repo:Repository,q:string,previous?:any,mock?:typeof fetch){const r=await newCaseRun(repo,q,scope,previous);for(let i=0;i<3&&r.status==='running';i++)await stepCaseRun(repo,secret,r,mock);return r}

test('operating procurement matches the original stock engine exactly, including fractional growth and configured buffer',()=>{
 for(const bufferPercent of [0,10])for(const quantityChange of [0,13,30]){
  const baseline=buildProfitBaseline(c,{packSize:.5,bufferPercent}),plan=evaluateOperatingPlan(baseline,{inputs:{...profitDefaults,days:7,quantityChange},budget_scaled:null});
  for(const l of plan.lines){const product=c.products.find(p=>p.id===l.id)!,f=forecastProduct(c,product,{days:7,uplift:quantityChange,assumptions:[]},{packSize:.5,bufferPercent});
   assert.equal(l.purchaseGrams/1000,f.suggested);assert.equal(l.purchase_scaled,f.budget_scaled);assert.equal(l.stock,f.stock);assert.equal(l.availableStock,f.availableStock);
   assert.equal(l.demandGrams/1000,f.dailyPlan.reduce((n,d)=>n+Math.round(d.demand*1000),0)/1000);
  }
 }
});
test('limited and zero budgets constrain actual supported sales; purchase, sale, loss and profit reconcile for every day',()=>{
 for(const budget of [0,100,300000000,600000000,null]){
  const report=buildGoalReport(b,{inputs:profitDefaults,budget_scaled:budget});
  for(const p of report.plans){assert(p.checks.every(v=>v.difference===0));if(budget!==null)assert(p.purchase_scaled<=budget);assert.equal(p.profit_scaled,p.revenue_scaled-p.cost_scaled-p.loss_scaled-p.fixed_scaled);
   for(const l of p.lines)for(const d of l.daily){assert(d.soldGrams<=d.demandGrams);assert.equal(d.purchaseGrams,d.netSoldGrams+d.discardGrams);assert.equal(d.purchase_scaled,d.cost_scaled+d.loss_scaled);}
  }
  if(budget===0)for(const p of report.plans){assert.equal(p.revenue_scaled,0);assert.equal(p.soldGrams,0);assert.equal(p.profit_scaled,-p.fixed_scaled);assert(p.gap_scaled>0);}
 }
 const high=buildGoalReport(b,{inputs:profitDefaults,budget_scaled:600000000}),low=buildGoalReport(b,{inputs:profitDefaults,budget_scaled:300000000});
 assert(low.plans[0].revenue_scaled<high.plans[0].revenue_scaled);assert(low.plans.every(p=>!p.targetMet));assert.match(low.summary,/尚差|还差/);
});
test('goal search uses explicit conditions and reports unsupported targets without changing source records',()=>{
 const before=JSON.stringify(caseFacts().income),report=buildGoalReport(b,{inputs:{...profitDefaults,target_scaled:10000000000},budget_scaled:null});
 assert.equal(report.plans.length,3);assert(report.plans.every(p=>p.conditions.inputs.quantityChange<=30));assert(report.plans.every(p=>!p.targetMet));assert(report.plans.every(p=>p.gap_scaled>0));assert.equal(JSON.stringify(caseFacts().income),before);
 assert.throws(()=>evaluateOperatingPlan(b,{inputs:profitDefaults,budget_scaled:-1}));assert.throws(()=>evaluateOperatingPlan(b,{inputs:{...profitDefaults,costChange:NaN},budget_scaled:null}));
 const sixty=evaluateOperatingPlan(b,{inputs:{...profitDefaults,days:60},budget_scaled:300000000});assert.equal(sixty.horizon.to,'2026-11-29');assert(sixty.lines.every(p=>p.daily.length===60));
});
test('Chinese followups update only named conditions, halve budgets and can adopt a prior compared plan',async()=>{
 const repo=memory();let r=await run(repo,'未来30天全店目标净利润一万元，采购预算六万元，销量变化20%，售价变化2%，损耗降低10%。');assert.equal(r.status,'completed');
 const initial=r.profitContext;r=await run(repo,'那预算减半',r);assert.equal(r.status,'completed');assert.equal(r.profitContext.budget_scaled,300000000);assert.deepEqual(r.profitContext.inputs,initial.inputs);assert.match(r.goalChanges,/60000.*30000/);
 r=await run(repo,'只改损耗，损耗降低30%',r);assert.equal(r.profitContext.inputs.lossReduction,30);assert.equal(r.profitContext.inputs.quantityChange,20);assert.equal(r.profitContext.inputs.priceChange,2);
 r=await run(repo,'保留其他条件，销量改10%',r);assert.equal(r.profitContext.inputs.quantityChange,10);assert.equal(r.profitContext.inputs.lossReduction,30);assert.equal(r.profitContext.budget_scaled,300000000);assert(r.answer.startsWith('建议先评估'));
 const selected=r.goalReport.plans[1].conditions;const adopted=await run(repo,'采用第二个方案，预算翻倍',r);assert.equal(adopted.profitContext.budget_scaled,600000000);assert.deepEqual(adopted.profitContext.inputs,selected.inputs);
 const independent=await run(repo,'预测未来7天全店净利润',adopted);assert.equal(independent.profitContext.budget_scaled,null);assert.equal(independent.profitContext.inputs.quantityChange,0);
 assert.throws(()=>goalConditions('预算减半'));assert.throws(()=>followupGoalBase('采用第九个方案',{profitContext:initial,goalPlans:[]}));
});
test('agent provides real planning traces and a compact model review instead of transmitting thousands of forecast lines',async()=>{
 const repo=memory();await saveModel(repo,secret,{provider:'Ark',model:'test-goal',apiKey:'fake-key',enabled:true,guestEnabled:true,guestDailyLimit:20,revision:0,dailyLimit:20});let calls=0;
 const mock:typeof fetch=async(_url,opts)=>{calls++;const body=JSON.parse(String(opts!.body)),input=JSON.parse(body.input);if(calls===2){assert(JSON.stringify(input).length<18000);assert.equal(input.evidence[0].data.plans.length,3);assert(!JSON.stringify(input).includes('dailyPlan'));}
  const text=calls===1?JSON.stringify({intents:['forecast','finance'],productIds:[],clarification:'',reason:'旧模型意图'}):JSON.stringify({notes:[{kind:'行动',text:'先核实分日供货和实际报损，再扩大活动范围',refs:['依据1']}]});return Response.json({status:'completed',output:[{content:[{type:'output_text',text}]}],usage:{total_tokens:50}});
 };
 const r=await run(repo,'未来30天全店目标净利润10000元，采购预算60000元，请比较备货与利润方案',undefined,mock);assert.equal(r.status,'completed');assert.deepEqual(r.plan.intents,['profit']);assert.equal(r.goalReport.plans.length,3);assert.equal(calls,2);assert(r.trace.some((t:any)=>t.name==='检查预算和供货'));assert(r.notes.length>0);assert.equal(r.evidence[0].data.planning,undefined);
});
test('Chinese report and Excel use the same selected plan, numeric amounts and complete product and daily rows',async()=>{
 const report=buildGoalReport(b,{inputs:profitDefaults,budget_scaled:300000000}),tables=reportTables(b,report,'current');assert.equal(tables.length,5);
 assert.equal(tables[2].rows.length,report.plans[0].lines.length);assert.equal(tables[3].rows.length,b.supply.length*30);assert.equal(typeof tables[1].rows[0][2],'number');assert.equal(typeof tables[3].rows[0][0],'number');
 assert.equal(Math.round(tables[2].rows.reduce((n,row)=>n+(row[10] as number),0)*10000),report.plans[0].purchase_scaled);
 const html=chineseReportHTML(b,report,'current');assert.match(html,/保持当前条件/);assert.match(html,/方案比较/);assert.match(html,/原始|历史销售/);
 const template=new Uint8Array(readFileSync(new URL('../public/data/decision-report-template.xlsx',import.meta.url))),bytes=await decisionWorkbook(template,b,report,'current'),files=await unzipReportTemplate(bytes),xml=new TextDecoder().decode(files.get('xl/worksheets/sheet2.xml'));
 assert.match(xml,/<f>ROUND\(D6-E6-F6-G6,4\)<\/f>/);assert.match(xml,new RegExp('<v>'+report.plans[0].profit_scaled/10000+'</v>'));assert.match(new TextDecoder().decode(files.get('xl/worksheets/sheet4.xml')),/2026|<v>46296<\/v>|分日/);
 const corrupt=template.slice(),v=new DataView(corrupt.buffer),start=30+v.getUint16(26,true)+v.getUint16(28,true);corrupt[start+10]^=1;await assert.rejects(()=>unzipReportTemplate(corrupt));
});
