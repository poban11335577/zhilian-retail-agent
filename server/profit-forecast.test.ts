import {test} from 'node:test';import assert from 'node:assert/strict';
import {caseFacts} from './case-agent.ts';
import {buildProfitBaseline,predictProfit,profitScenarios,profitDefaults} from '../lib/profit-forecast.ts';
import {profitConditions} from './profit-skill.ts';
import {newCaseRun,stepCaseRun} from './case-workflow.ts';
import type {Repository} from './api.ts';
const b=buildProfitBaseline(caseFacts());
test('profit baseline reconciles daily and product summaries with ledger and keeps original dates',()=>{
 assert.equal(b.rowCount,24040);assert.equal(b.originalFrom,'2022-09-01');assert.equal(b.originalTo,'2022-09-30');
 assert.equal(b.daily.reduce((n,d)=>n+d.revenue_scaled,0),b.revenue_scaled);assert.equal(b.products.reduce((n,p)=>n+p.revenue_scaled,0),b.revenue_scaled);
 assert.equal(b.products.reduce((n,p)=>n+p.delta_scaled,0),b.comparison!.delta_scaled);
 assert.equal(b.revenue_scaled-b.cost_scaled-b.loss_scaled-b.fixed_scaled,b.profit_scaled);
});
test('zero assumptions reproduce baseline; profit bridge reconciles with joint volume, price, cost and loss changes',()=>{
 assert.equal(predictProfit(b,profitDefaults).profit_scaled,b.profit_scaled);
 const r=predictProfit(b,{...profitDefaults,quantityChange:20,priceChange:-5,costChange:8,lossReduction:30,fixedChange:5});
 assert.equal(r.profit_scaled,r.revenue_scaled-r.cost_scaled-r.loss_scaled-r.fixed_scaled);
 assert.equal(r.base.profit_scaled+r.bridge.reduce((n,s)=>n+s.amount_scaled,0),r.profit_scaled);
 assert(r.cost_scaled>b.cost_scaled);assert(r.loss_scaled<b.loss_scaled);
 assert.equal(profitScenarios(b,profitDefaults)[1].profit_scaled,b.profit_scaled);
});
test('loss and price scenarios expose full accounting contribution; invalid assumptions cannot silently predict',()=>{
 const loss=predictProfit(b,{...profitDefaults,lossReduction:100});assert.equal(loss.loss_scaled,0);assert.equal(loss.delta_scaled,b.loss_scaled);
 const price=predictProfit(b,{...profitDefaults,priceChange:10});assert.equal(price.delta_scaled,Math.round(b.revenue_scaled*1.1)-b.revenue_scaled);
 const week=predictProfit(b,{...profitDefaults,days:7});assert.equal(week.horizon.to,'2026-10-07');assert.equal(week.horizon.from,'2026-10-01');
 assert.throws(()=>predictProfit(b,{...profitDefaults,days:0}));assert.throws(()=>predictProfit(b,{...profitDefaults,priceChange:NaN}));assert.throws(()=>predictProfit(b,{...profitDefaults,lossReduction:101}));
 const deficit={...b,cost_scaled:b.revenue_scaled*2};assert.equal(predictProfit(deficit,profitDefaults).requiredQuantityChange,null);
});
test('profit skill recognizes explicit Chinese assumptions and agent calls profit rather than stock forecasting',async()=>{
 const q='预测未来30天全店净利润，销量增长两成，售价下降5%，单位成本变化8%，损耗费用降低30%，其他费用变化5%，目标净利润一万元。';
 const p=profitConditions(q);assert.equal(p.quantityChange,20);assert.equal(p.priceChange,-5);assert.equal(p.costChange,8);assert.equal(p.target_scaled,100000000);
 const rows=new Map();const repo:Repository={async get(k){return structuredClone(rows.get(k)??null)},async list(prefix){return [...rows.keys()].filter(k=>k.startsWith(prefix))},async put(k,v,version){if((rows.get(k)?.version??null)!==version)return false;rows.set(k,{value:structuredClone(v),version:String(Number(version??0)+1)});return true}};
 const r=await newCaseRun(repo,q,{from:'2026-09-01',to:'2026-09-30'});for(let i=0;i<3&&r.status==='running';i++)await stepCaseRun(repo,'local-test-secret',r);
 assert.equal(r.status,'completed');assert(r.plan.intents.includes('profit'));assert(!r.plan.intents.includes('forecast'));assert(!r.plan.intents.includes('ranking'));assert.equal(r.forecasts.length,0);
 const e=r.evidence.find((e:any)=>e.tool==='利润预测与目标测算');assert.equal(e.data.result.profit_scaled,predictProfit(b,p).profit_scaled);assert.equal(caseFacts().income.net_profit_scaled,b.profit_scaled);
 assert.throws(()=>profitConditions('预测利润，销量大幅增加20%'));assert.throws(()=>profitConditions('预测下个月净利润'));assert.match(r.answer,/利润预测 Skill/);
});
