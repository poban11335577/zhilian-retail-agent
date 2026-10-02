import {forecastProduct} from './stock-forecast.ts';
// Shared by the demonstration UI, agent tool and reusable profit-forecast skill.
export interface SupplyProfile {
 id:string;name:string;category:string;supplierId:string;stock:number;availableStock:number;packSize:number;
 cost_scaled:number;lossPercent:number;average:number;method:string;mae:any;safety:number;bufferPercent:number;
 netRevenuePerKg_scaled:number;netGramsPerSoldGram:number;demand:number[];sourceRows:number[];sourceRowCount:number;
}
export interface ProfitBaseline {
 version:string; caseId:string; from:string; to:string; originalFrom:string; originalTo:string;
 days:number; rowCount:number; productCount:number; soldGrams:number; returnedGrams:number;
 revenue_scaled:number; cost_scaled:number; loss_scaled:number; fixed_scaled:number; profit_scaled:number;
 source:{name:string; url:string; file:string; sha256:string}; checks:{name:string;difference:number}[];
 daily:{date:string;originalDate:string;revenue_scaled:number;soldGrams:number;rows:number}[];
 products:{id:string;name:string;category:string;revenue_scaled:number;recent_scaled:number;previous_scaled:number;delta_scaled:number;growth:number|null;sourceRows:number[]}[];
 comparison:{recentFrom:string;recentTo:string;previousFrom:string;previousTo:string;recent_scaled:number;previous_scaled:number;delta_scaled:number;growth:number|null}|null;
 supply:SupplyProfile[];
}
export interface ProfitInputs {
 days:number; quantityChange:number; priceChange:number; costChange:number;
 lossReduction:number; fixedChange:number; target_scaled:number;
}
export const profitDefaults:ProfitInputs={days:30,quantityChange:0,priceChange:0,costChange:0,lossReduction:0,fixedChange:0,target_scaled:100000000};
const addDay=(s:string,n:number)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const countDays=(a:string,b:string)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1;
export function buildProfitBaseline(c:any,policy={packSize:.5,bufferPercent:0}):ProfitBaseline {
 const days=countDays(c.from,c.to);
 if(!Number.isInteger(days)||days<1||!c.sales.length)throw Error('所选期间没有足够的销售样本。');
 if(c.checks.some((v:any)=>v.difference!==0))throw Error('账套对账异常，暂停利润测算。');
 const originalDate=(r:any[])=>c.salesMeta[String(r[0])]?.original_date?.slice(0,10);
 if(c.sales.some((r:any[])=>!originalDate(r)))throw Error('销售缺少原始日期，不能作为可追溯基线。');
 const daily=Array.from({length:days},(_,i)=>({date:addDay(c.from,i),originalDate:'',revenue_scaled:0,soldGrams:0,rows:0}));
 const dates=new Map(daily.map(d=>[d.date,d]));
 const products=c.products.map((p:any)=>({id:p.id,name:p.name,category:p.category,revenue_scaled:0,recent_scaled:0,previous_scaled:0,delta_scaled:0,growth:null as number|null,sourceRows:[] as number[]}));
 const items=new Map<string,typeof products[number]>(products.map((p:typeof products[number])=>[p.id,p]));
 const recentFrom=addDay(c.to,-6),previousFrom=addDay(c.to,-13),previousTo=addDay(c.to,-7);
 let soldGrams=0,returnedGrams=0;
 for(const r of c.sales){
  const d=dates.get(r[5].slice(0,10))!,p=items.get(r[2]);
  const grams=Math.round(r[4]*1000);
  d.originalDate=originalDate(r);d.revenue_scaled+=r[7];d.soldGrams+=Math.max(0,grams);d.rows++;
  soldGrams+=Math.max(0,grams);returnedGrams+=Math.max(0,-grams);
  if(p){p.revenue_scaled+=r[7];if(d.date>=recentFrom)p.recent_scaled+=r[7];else if(d.date>=previousFrom&&d.date<=previousTo)p.previous_scaled+=r[7];if(p.sourceRows.length<5)p.sourceRows.push(r[0]);}
 }
 // Empty calendar days remain zero; reconstruct their source date using the verified offset.
 const anchor=daily.find(d=>d.originalDate)!;
 const offset=Math.round((Date.parse(anchor.originalDate)-Date.parse(anchor.date))/86400000);
 for(const d of daily)if(!d.originalDate)d.originalDate=addDay(d.date,offset);
 for(const p of products){p.delta_scaled=p.recent_scaled-p.previous_scaled;p.growth=p.previous_scaled>0?p.delta_scaled/p.previous_scaled*100:null;}
 const recent_scaled=daily.filter(d=>d.date>=recentFrom).reduce((n,d)=>n+d.revenue_scaled,0),previous_scaled=daily.filter(d=>d.date>=previousFrom&&d.date<=previousTo).reduce((n,d)=>n+d.revenue_scaled,0);
 const i=c.income;
 const supply=c.products.filter((p:any)=>p.stocked&&p.sold>0).map((p:any)=>{
  const f=forecastProduct(c,p,{days:60,uplift:0,assumptions:[]},policy);
  return {id:p.id,name:p.name,category:p.category,supplierId:p.supplier_id,stock:p.stock,availableStock:f.availableStock,packSize:f.packSize,cost_scaled:p.cost_scaled,lossPercent:f.lossPercent,average:f.average,method:f.method,mae:f.mae,safety:f.safety,bufferPercent:f.bufferPercent,netRevenuePerKg_scaled:p.revenue_scaled/p.sold,netGramsPerSoldGram:(p.sold-p.returned)/p.sold,demand:f.dailyPlan.map((d:any)=>d.unroundedDemand??d.demand),sourceRows:f.sourceRows,sourceRowCount:f.sourceRowCount};
 });
 return {version:'profit-scenario-v2',caseId:c.source.case_id,from:c.from,to:c.to,originalFrom:daily[0].originalDate,originalTo:daily.at(-1)!.originalDate,days,rowCount:c.sales.length,productCount:products.length,soldGrams,returnedGrams,revenue_scaled:i.revenue_scaled,cost_scaled:i.cost_scaled,loss_scaled:i.loss_scaled,fixed_scaled:i.expense_scaled-i.loss_scaled,profit_scaled:i.net_profit_scaled,source:{name:c.source.name,url:c.source.url,file:c.source.file,sha256:c.source.sha256},checks:c.checks,daily,products,supply,comparison:days>=14?{recentFrom,recentTo:c.to,previousFrom,previousTo,recent_scaled,previous_scaled,delta_scaled:recent_scaled-previous_scaled,growth:previous_scaled>0?(recent_scaled-previous_scaled)/previous_scaled*100:null}:null};
}
export function validateProfitInputs(input:ProfitInputs){
 const ranges:Record<keyof ProfitInputs,[number,number]>={days:[1,60],quantityChange:[-50,100],priceChange:[-20,20],costChange:[-20,50],lossReduction:[0,100],fixedChange:[-50,100],target_scaled:[-1e11,1e11]};
 for(const [key,[min,max]] of Object.entries(ranges)){const value=input[key as keyof ProfitInputs];if(!Number.isFinite(value)||value<min||value>max)throw Error('利润测算参数超出范围：'+key);}
 if(!Number.isInteger(input.days)||!Number.isSafeInteger(input.target_scaled))throw Error('天数须为整数，目标金额最多保留4位小数。');
 return input;
}
export function predictProfit(b:ProfitBaseline,parameters:ProfitInputs){
 const p=validateProfitInputs(parameters);
 if(!Number.isInteger(b.days)||b.days<1||[b.revenue_scaled,b.cost_scaled,b.loss_scaled,b.fixed_scaled].some(v=>!Number.isSafeInteger(v)))throw Error('利润基线格式无效。');
 const factor=p.days/b.days,quantity=1+p.quantityChange/100;
 const base={revenue_scaled:Math.round(b.revenue_scaled*factor),cost_scaled:Math.round(b.cost_scaled*factor),loss_scaled:Math.round(b.loss_scaled*factor),fixed_scaled:Math.round(b.fixed_scaled*factor)};
 const baseProfit=base.revenue_scaled-base.cost_scaled-base.loss_scaled-base.fixed_scaled;
 const volumeRevenue=Math.round(base.revenue_scaled*quantity),volumeCost=Math.round(base.cost_scaled*quantity),volumeLoss=Math.round(base.loss_scaled*quantity);
 const revenue=Math.round(volumeRevenue*(1+p.priceChange/100)),cost=Math.round(volumeCost*(1+p.costChange/100)),lossBefore=Math.round(volumeLoss*(1+p.costChange/100));
 const loss=Math.round(lossBefore*(1-p.lossReduction/100)),fixed=Math.round(base.fixed_scaled*(1+p.fixedChange/100));
 const profit=revenue-cost-loss-fixed;
 const bridge=[{name:'销量变化',amount_scaled:(volumeRevenue-base.revenue_scaled)-(volumeCost-base.cost_scaled)-(volumeLoss-base.loss_scaled)},{name:'售价变化',amount_scaled:revenue-volumeRevenue},{name:'单位成本变化',amount_scaled:-(cost-volumeCost)-(lossBefore-volumeLoss)},{name:'损耗费用改善',amount_scaled:lossBefore-loss},{name:'其他费用变化',amount_scaled:base.fixed_scaled-fixed}].map(v=>({...v,amount_scaled:v.amount_scaled||0}));
 const unitContribution=base.revenue_scaled*(1+p.priceChange/100)-(base.cost_scaled+base.loss_scaled*(1-p.lossReduction/100))*(1+p.costChange/100);
 return {kind:'情景预测（拟）',engine:b.version,parameters:{...p},horizon:{from:addDay(b.to,1),to:addDay(b.to,p.days),days:p.days},base:{...base,profit_scaled:baseProfit},revenue_scaled:revenue,cost_scaled:cost,loss_scaled:loss,fixed_scaled:fixed,profit_scaled:profit,margin:revenue>0?profit/revenue:null,delta_scaled:profit-baseProfit,bridge,target_scaled:p.target_scaled,gap_scaled:Math.max(0,p.target_scaled-profit),targetMet:profit>=p.target_scaled,requiredQuantityChange:unitContribution>0?((p.target_scaled+fixed)/unitContribution-1)*100:null,assumptions:['沿用基线日均销售、商品结构及费用结构；销量、售价、成本变化按输入假设整体作用。','损耗改善表示损耗费用相对降低，并非损耗率降低同样的百分点；销量和单位成本增加会同步增加损耗费用。','其他费用按周期天数同比例折算，再应用费用变化；未模拟阶梯租金、人力、税费或资金占用。','未估计价格对销量的影响、促销因果、季节或节假日效应；目标与预测均为（拟），不代表已实现增长。','成本、损耗和其他费用来自拟定账套；这不是原企业真实利润或统计置信区间。']};
}
export function profitScenarios(b:ProfitBaseline,p:ProfitInputs){
 const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
 return [{name:'压力情景',input:{...p,quantityChange:clamp(p.quantityChange-10,-50,100),priceChange:clamp(p.priceChange-2,-20,20),costChange:clamp(p.costChange+5,-20,50),lossReduction:clamp(p.lossReduction-10,0,100)}},{name:'当前设想',input:p},{name:'顺利情景',input:{...p,quantityChange:clamp(p.quantityChange+5,-50,100),priceChange:clamp(p.priceChange+1,-20,20),costChange:clamp(p.costChange-2,-20,50),lossReduction:clamp(p.lossReduction+5,0,100)}}].map(s=>({name:s.name,...predictProfit(b,s.input)}));
}
