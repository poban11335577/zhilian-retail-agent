import {buildProfitBaseline,predictProfit,profitDefaults,profitScenarios,type ProfitInputs} from '../lib/profit-forecast.ts';
import {buildGoalReport,validateGoalConditions,type GoalConditions} from '../lib/goal-planner.ts';
import {normalizeNumbers} from './case-language.ts';
export const isProfitQuestion=(q:string)=>/(?:利润|盈利|赚)/.test(q)&&/预测|测算|情景|目标|未来|下月|下个月|做到|达到|方案|想赚|要赚/.test(q);
export const isProfitFollowup=(q:string,previous:any)=>!!previous?.profitContext&&!/历史|上个月|9月.*(?:多少|情况)|商品|编码\d|供货商|供应商|采购单|售后|履约|明细|查库存|备货.*(?:椒|菜|菇)/.test(q)&&/^(?:那|再|把|只|保留|其他|其它|预算|销量|需求|售价|损耗|单位成本|采购成本|其他费用|固定费用|目标|改|调整|未来|解释|为什么|哪|选|采用|用|就|这个|第|按|帮我|请帮|如果|假如|那么)/.test(q.trim());
export function followupGoalBase(q:string,previous:any):GoalConditions|undefined {
 if(!isProfitFollowup(q,previous))return undefined;
 const text=normalizeNumbers(q),plans=previous.goalPlans??[];
 const index=text.match(/(?:选|采用|用|按)\s*第\s*(\d+)\s*(?:个|种)?\s*方案/);
 const named=plans.find((p:any)=>q.includes(p.name)&&/选|采用|用|按/.test(q));
 const chosen=index?plans[Number(index[1])-1]:named??(/(?:采用|用|按)推荐方案/.test(q)?plans.find((p:any)=>p.id===previous.recommendedId):null);
 if(index&&!chosen)throw Error('上一轮没有这个方案，请选择已列出的方案。');
 return chosen?.conditions??previous.profitContext;
}
export function goalChanges(old:GoalConditions|undefined,next:GoalConditions){
 if(!old)return '首次设置目标条件（拟）；未指定变化按0%、天数30、目标10000元。';
 const labels:any={days:'预测天数',quantityChange:'销量变化%',priceChange:'售价变化%',costChange:'单位成本变化%',lossReduction:'降损改善%',fixedChange:'其他费用变化%',target_scaled:'目标净利润（元）'};
 const diffs=Object.entries(next.inputs).filter(([k,v])=>v!==old.inputs[k as keyof ProfitInputs]).map(([k,v])=>`${labels[k]}：${k==='target_scaled'?old.inputs.target_scaled/10000:old.inputs[k as keyof ProfitInputs]} → ${k==='target_scaled'?v/10000:v}`);
 if(old.budget_scaled!==next.budget_scaled)diffs.push(`全周期采购预算（元）：${old.budget_scaled===null?'未设上限':old.budget_scaled/10000} → ${next.budget_scaled===null?'未设上限':next.budget_scaled/10000}`);
 return diffs.length?'本轮更新（拟）：'+diffs.join('；')+'。其他条件沿用上一轮。':'本轮沿用上一轮全部条件（拟），重新展示比较结果。';
}
export function goalConditions(q:string,old?:GoalConditions):GoalConditions {
 const text=normalizeNumbers(q).replace(/百分之\s*(-?\d+(?:\.\d+)?)/g,'$1%').replace(/(降低|减少|改善)\s*(损耗费用|损耗)\s*(\d+(?:\.\d+)?)\s*[%％]/g,'$2$1$3%');
 const p:ProfitInputs={...(old?.inputs??profitDefaults)};let budget=old?.budget_scaled??null;
 if(/(?:\d{1,2}月|下月|下个月)/.test(text))throw Error('利润预测目前按账期结束后的未来天数测算，请使用“未来7天、14天或30天”；不将指定月份误当作30天。');
 const days=text.match(/(?:未来|预测|测算)?\s*(\d+)\s*天/);if(days)p.days=Number(days[1]);else if(/下周|未来1周/.test(text))p.days=7;else if(/未来2周/.test(text))p.days=14;
 const specs=[['quantityChange','销量|销售数量|需求','变化|增长|增加|提升|下降|减少|改为|改成|改到|改|调整为|调整到|提高到|降到'],['priceChange','售价|销售价格','变化|增长|提高|提升|上涨|下降|降低|减少|改为|改成|改到|改'],['costChange','单位成本|采购成本|进货成本','变化|增长|提高|增加|上涨|下降|降低|减少|改为|改成|改'],['lossReduction','损耗费用|损耗','降低|减少|改善|改为|改成|改到|改'],['fixedChange','其他费用|固定费用','变化|增长|增加|上涨|下降|降低|减少|改为|改成|改']] as const;
 for(const [key,noun,verbs] of specs){
  const m=text.match(new RegExp('(?:'+noun+')\\s*(?:'+verbs+')\\s*(?:为|到|至)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*([%％]|成)'));
  if(m){let value=Number(m[1])*(m[2]==='成'?10:1);if(key!=='lossReduction'&&/下降|降低|减少/.test(m[0]))value=-Math.abs(value);p[key]=value;}
 }
 const goal=text.match(/(?:目标净利润|净利润目标|利润目标|目标利润|目标(?:赚|盈利)?|想赚|要赚|赚到)\s*(?:为|是|达到|到)?\s*(-?\d+(?:\.\d+)?)\s*(万)?\s*(?:元|块)?/);
 if(goal)p.target_scaled=Math.round(Number(goal[1])*(goal[2]?10000:1)*10000);
 const percentages=[...text.matchAll(/(?:销量|销售数量|需求|售价|销售价格|单位成本|采购成本|进货成本|损耗费用|损耗|其他费用|固定费用)[^，。；]{0,14}[%％成]/g)];
 if(percentages.some(m=>!specs.some(([,noun,verbs])=>new RegExp('(?:'+noun+')\\s*(?:'+verbs+')\\s*(?:为|到|至)?\\s*-?\\d+(?:\\.\\d+)?\\s*([%％]|成)').test(m[0]))))throw Error('请用明确条件，例如“销量改10%，损耗降低20%”。');
 const bm=text.match(/(?:采购预算|预算|资金|最多花|不超过)\s*(?:为|是|改为|改成|改到|调整为|调整到|改|上限)?\s*(-?\d+(?:\.\d+)?)\s*(万)?\s*(?:元|块)?/);
 if(bm)budget=Math.round(Number(bm[1])*(bm[2]?10000:1)*10000);
 else if(/(?:预算|资金)\s*(?:减半|砍半|减少一半)/.test(q)){if(budget===null)throw Error('上一轮没有采购预算，请先给出金额，例如“预算60000元”。');budget=Math.round(budget/2);}
 else if(/(?:预算|资金)\s*(?:翻倍|加倍)/.test(q)){if(budget===null)throw Error('上一轮没有采购预算，请先给出金额。');budget*=2;}
 else if(/取消预算|不限预算|不设预算/.test(q))budget=null;
 if(/只改损耗/.test(q)&&!/(?:降低|减少|改善|改)\s*(?:\d|[一二两三四五六七八九十])/.test(q))throw Error('其他条件已保留，请说明损耗相对降低多少，例如“只改损耗，损耗降低20%”。');
 return validateGoalConditions({inputs:p,budget_scaled:budget});
}
export function profitConditions(q:string,old?:ProfitInputs){return goalConditions(q,old?{inputs:old,budget_scaled:null}:undefined).inputs}
const money=(n:number)=>(n/10000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:4})+'元';
export function profitEvidence(c:any,q:string,context?:GoalConditions,policy?:any){
 const baseline=buildProfitBaseline(c,policy),conditions=context??goalConditions(q),parameters=conditions.inputs,result=predictProfit(baseline,parameters),scenarios=profitScenarios(baseline,parameters),planning=buildGoalReport(baseline,conditions);
 const chosen=planning.plans.find(p=>p.id===planning.recommendedId)!;
 return {data:{baseline,result,scenarios,planning},text:`目标经营智能体 / 利润预测 Skill\n${planning.summary}\n${planning.steps.map((s,i)=>`${i+1}．${s.name}：${s.detail}`).join('\n')}\n方案比较（拟）：${planning.plans.map(s=>`${s.name}：累计采购${money(s.purchase_scaled)}，可支持销售${money(s.revenue_scaled)}，净利润${money(s.profit_scaled)}，目标缺口${money(s.gap_scaled)}，需求覆盖${(s.coverage*100).toFixed(2)}%`).join('；')}。\n推荐方案逐项对账（拟）：销售净额${money(chosen.revenue_scaled)} − 净售商品成本${money(chosen.cost_scaled)} − 报损成本${money(chosen.loss_scaled)} − 其他费用${money(chosen.fixed_scaled)} = 净利润${money(chosen.profit_scaled)}。累计采购${money(chosen.purchase_scaled)}已分解到销售成本和报损，不再重复扣减。\n当前输入（拟）：${parameters.days}天，目标${money(parameters.target_scaled)}，销量变化${parameters.quantityChange}%，售价变化${parameters.priceChange}%，单位成本变化${parameters.costChange}%，损耗改善${parameters.lossReduction}%，其他费用变化${parameters.fixedChange}%，采购预算${conditions.budget_scaled===null?'未设累计上限':money(conditions.budget_scaled)}。${context?'跟进时只更新明确提到的条件，其他条件沿用已保存上下文。':'首次未指定变化按0%、天数30、目标10000元（拟）。'}\n月度费用口径的未约束情景净利润${money(result.profit_scaled)}（拟）单独保留，用于解释原情景计算，不能当作已具备供货条件的销售结果。\n下一步：${planning.actions.join('；')}\n${planning.assumptions.join('\n')}\n打开 /growth 查看全部商品分日采购、方案比较及中文报告。`};
}
