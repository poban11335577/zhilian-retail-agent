import {test} from 'node:test';import assert from 'node:assert/strict';
import {importBusiness,openBusiness} from './business-db.ts';import {salesAnalysis,salesFilterSchema} from './sales-analysis.ts';
test('sales filters preserve actual amounts, returns, missing costs and read permissions',async()=>{
 const rows=new Map();const repo={async get(k:string){return rows.get(k)??null},async put(k:string,v:any,version:string|null){rows.set(k,{value:structuredClone(v),version:String(Number(version??0)+1)});return true},async list(p:string){return [...rows.keys()].filter(k=>k.startsWith(p))}};
 await importBusiness(repo,'test',{products:[{id:'a',name:'原商品 A',unit:'斤',category:'生鲜'},{id:'b',name:'原商品 B',unit:'袋',category:'粮油'}],sales_orders:[{id:'1',product_id:'a',date:'2025-01-01',quantity:1.5,unit_price_cents:100,amount_cents:145},{id:'2',product_id:'a',date:'2025-01-02',quantity:-.5,unit_price_cents:100,amount_cents:-50},{id:'3',product_id:'b',date:'2025-02-01',quantity:2,unit_price_cents:100,amount_cents:200}]},0);
 const {db}=await openBusiness(repo,'test');try{
  const permissions=new Set(['sales_orders','products']);const all=salesAnalysis(db,permissions,'销售情况');assert.equal(all.evidence[0].rows[0].revenue_amount,'2.95');assert(all.text.includes('无法计算毛利'));
  const jan=salesAnalysis(db,permissions,'2025年1月销售情况');assert.equal(jan.evidence[0].rows[0].revenue_amount,'0.95');assert.equal(jan.evidence[0].rows[0].negative_amount,'-0.50');assert.equal(jan.evidence[1].rows.length,1);
  const feb=salesAnalysis(db,permissions,'销售',{from:'2025-02-01',to:'2025-02-28'});assert.equal(feb.evidence[0].rows[0].revenue_amount,'2.00');
  const scoped=salesAnalysis(db,permissions,'商品 A',{},'a');assert.equal(scoped.evidence[0].rows[0].revenue_amount,'0.95');
  const hidden=salesAnalysis(db,new Set(['sales_orders']),'销售');assert(!JSON.stringify(hidden.evidence).includes('原商品'));assert(!JSON.stringify(hidden.evidence).includes('生鲜'));
  assert.equal(salesAnalysis(db,new Set(),'销售').evidence[0].rowCount,0);assert.throws(()=>salesFilterSchema.parse({from:'2025-02-30'}));assert.throws(()=>salesFilterSchema.parse({from:'2025-02-01',to:'2025-01-01'}));
 }finally{db.close()}
});
