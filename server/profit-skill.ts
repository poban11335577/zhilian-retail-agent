import {buildProfitBaseline,predictProfit,profitDefaults,profitScenarios} from '../lib/profit-forecast.ts';
import {normalizeNumbers} from './case-language.ts';
export const isProfitQuestion=(q:string)=>/(?:利润|盈利|赚)/.test(q)&&/预测|测算|情景|目标|未来|下月|下个月|做到|达到/.test(q);
export function profitConditions(q:string){
 const text=normalizeNumbers(q),p={...profitDefaults};
 if(/(?:\d{1,2}月|下月|下个月)/.test(text))throw Error('利润预测目前按账期结束后的未来天数测算，请使用“未来7天、14天或30天”；不将指定月份误当作30天。');
 const days=text.match(/(?:未来|预测|测算)?\s*(\d+)\s*天/);if(days)p.days=Number(days[1]);else if(/下周|未来1周/.test(text))p.days=7;else if(/未来2周/.test(text))p.days=14;
 const specs=[['quantityChange','销量|销售数量|需求','变化|增长|增加|提升|下降|减少'],['priceChange','售价|销售价格','变化|增长|提高|提升|上涨|下降|降低|减少'],['costChange','单位成本|采购成本|进货成本','变化|增长|提高|增加|上涨|下降|降低|减少'],['lossReduction','损耗费用|损耗','降低|减少|改善'],['fixedChange','其他费用|固定费用','变化|增长|增加|上涨|下降|降低|减少']] as const;
 for(const [key,noun,verbs] of specs){
  const m=text.match(new RegExp('(?:'+noun+')\\s*(?:'+verbs+')\\s*(-?\\d+(?:\\.\\d+)?)\\s*([%％]|成)'));
  if(m){let value=Number(m[1])*(m[2]==='成'?10:1);if(key!=='lossReduction'&&/下降|降低|减少/.test(m[0]))value=-Math.abs(value);p[key]=value;}
 }
 const goal=text.match(/(?:目标净利润|净利润目标|利润目标|目标利润)\s*(?:为|是|达到|到)?\s*(-?\d+(?:\.\d+)?)\s*(万)?\s*元/);
 if(goal)p.target_scaled=Math.round(Number(goal[1])*(goal[2]?10000:1)*10000);
 // Unsupported percentages must not silently become zero assumptions.
 const percentages=[...text.matchAll(/(?:销量|销售数量|需求|售价|销售价格|单位成本|采购成本|进货成本|损耗费用|损耗|其他费用|固定费用)[^，。；]{0,14}[%％成]/g)];
 if(percentages.some(m=>!specs.some(([,noun,verbs])=>new RegExp('(?:'+noun+')\\s*(?:'+verbs+')\\s*-?\\d+(?:\\.\\d+)?\\s*([%％]|成)').test(m[0]))))throw Error('请用明确条件，例如“销量变化20%，损耗费用降低10%”。');
 return p;
}
const money=(n:number)=>(n/10000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:4})+'元';
export function profitEvidence(c:any,q:string){
 const baseline=buildProfitBaseline(c),parameters=profitConditions(q),result=predictProfit(baseline,parameters),scenarios=profitScenarios(baseline,parameters);
 return {data:{baseline,result,scenarios},text:`利润预测 Skill：${result.horizon.from}至${result.horizon.to}，共${parameters.days}天（拟）。基线销售原始日期${baseline.originalFrom}至${baseline.originalTo}，成本及费用（拟）。\n输入条件（拟）：销量变化${parameters.quantityChange}%，售价变化${parameters.priceChange}%，单位成本变化${parameters.costChange}%，损耗费用相对降低${parameters.lossReduction}%，其他费用变化${parameters.fixedChange}%。未指定变化按0%，未指定天数按30天；未指定目标按10000元演示目标（拟）。\n预测销售净额${money(result.revenue_scaled)} − 销售成本${money(result.cost_scaled)} − 损耗费用${money(result.loss_scaled)} − 其他费用${money(result.fixed_scaled)} = 净利润${money(result.profit_scaled)}（拟）。较同天数基准情景变化${money(result.delta_scaled)}（拟）。\n利润目标${money(result.target_scaled)}（拟），${result.targetMet?'按当前假设条件满足':'尚差'+money(result.gap_scaled)}。保持其他条件不变，目标所需销量变化${result.requiredQuantityChange===null?'无法仅靠增加销量求解（单位贡献不为正）':result.requiredQuantityChange.toFixed(2)+'%（拟），是代数条件而非需求保证'}。\n贡献分解（拟）：${result.bridge.map(v=>v.name+money(v.amount_scaled)).join('；')}。\n敏感性情景（拟）：${scenarios.map(s=>s.name+'净利润'+money(s.profit_scaled)).join('；')}。三种情景不代表发生概率。\n${result.assumptions.join('\n')}\n打开 /growth 调整条件、保存演示方案和回查数据。`};
}
