import {predictProfit,validateProfitInputs,type ProfitBaseline,type ProfitInputs,type SupplyProfile} from './profit-forecast.ts';

export interface GoalConditions {inputs:ProfitInputs;budget_scaled:number|null}
export interface SupplyDay {
 date:string;demandGrams:number;purchaseGrams:number;soldGrams:number;netSoldGrams:number;discardGrams:number;
 purchase_scaled:number;revenue_scaled:number;cost_scaled:number;loss_scaled:number;shortageGrams:number;
}
export interface SupplyLine {
 id:string;name:string;category:string;supplierId:string;stock:number;availableStock:number;packSize:number;
 cost_scaled:number;lossPercent:number;method:string;sourceRows:number[];sourceRowCount:number;
 demandGrams:number;purchaseGrams:number;soldGrams:number;discardGrams:number;shortageGrams:number;
 requested_scaled:number;purchase_scaled:number;revenue_scaled:number;cost_total_scaled:number;loss_scaled:number;daily:SupplyDay[];
}
export interface OperatingPlan {
 id:string;name:string;conditions:GoalConditions;horizon:{from:string;to:string;days:number};
 revenue_scaled:number;cost_scaled:number;loss_scaled:number;fixed_scaled:number;profit_scaled:number;
 requested_scaled:number;purchase_scaled:number;remainingBudget_scaled:number|null;budgetLimited:boolean;
 demandGrams:number;soldGrams:number;shortageGrams:number;purchaseGrams:number;discardGrams:number;
 coverage:number;targetMet:boolean;gap_scaled:number;lines:SupplyLine[];checks:{name:string;difference:number}[];
}
export interface GoalReport {
 version:string;conditions:GoalConditions;plans:OperatingPlan[];recommendedId:string;summary:string;
 comparison:{historicalProfit_scaled:number;unconstrainedProfit_scaled:number;conditionalTargetMet:boolean};
 search:{maxAdditionalQuantityPercent:number;lossImprovementPercent:number;tested:number};
 steps:{name:string;detail:string}[];actions:string[];assumptions:string[];
}
const add=(s:string,n:number)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const total=(a:any[],key:string)=>a.reduce((n,r)=>n+r[key],0);
const money=(n:number)=>(n/10000).toLocaleString('zh-CN',{maximumFractionDigits:2,minimumFractionDigits:2})+'元';
export function validateGoalConditions(c:GoalConditions){
 validateProfitInputs(c.inputs);
 if(c.budget_scaled!==null&&(!Number.isSafeInteger(c.budget_scaled)||c.budget_scaled<0||c.budget_scaled>1e13))throw Error('采购预算须为非负金额，最多保留4位小数。');
 return c;
}
// Each gram and each 1/10000 yuan has a single owner. Fresh goods are received daily;
// unverified closing stock is not carried into the future window.
export function evaluateOperatingPlan(b:ProfitBaseline,c:GoalConditions,id='current',name='当前条件'):OperatingPlan {
 validateGoalConditions(c);const p=c.inputs;
 if(!b.supply?.length)throw Error('缺少同源商品供货基线，请重新生成利润基线。');
 const cells:{profile:SupplyProfile;day:number;demand:number;wanted:number;packs:number;packGrams:number;cost:number;yield:number;spent:number;priority:number}[]=[];
 for(const f of b.supply){
  if(f.demand.length<p.days||f.availableStock!==0||!Number.isFinite(f.netRevenuePerKg_scaled)||!Number.isFinite(f.bufferPercent)||f.bufferPercent<0||f.cost_scaled<=0||f.lossPercent<0||f.lossPercent>=100)throw Error('商品供货基线无效：'+f.id);
  const packGrams=Math.round(f.packSize*1000),unitCost=Math.round(f.cost_scaled*(1+p.costChange/100));
  if(packGrams<1||unitCost<1)throw Error('包装和采购单价必须为正。');
  const yieldRate=1-f.lossPercent/100*(1-p.lossReduction/100);
  for(let d=0;d<p.days;d++){
   const demand=Math.ceil(f.demand[d]*1000*(1+p.quantityChange/100)-1e-8);
   const wanted=Math.ceil((Math.ceil(demand/yieldRate-1e-8)+Math.round(f.safety*1000))*(1+f.bufferPercent/100)/packGrams-1e-8);
   const costPerPack=Math.round(packGrams/1000*unitCost);
   cells.push({profile:f,day:d,demand,wanted,packs:wanted,packGrams,cost:unitCost,yield:yieldRate,spent:costPerPack,
    priority:f.netRevenuePerKg_scaled*(1+p.priceChange/100)*yieldRate-unitCost});
  }
 }
 const requested=cells.reduce((n,r)=>n+r.wanted*r.spent,0),budget=c.budget_scaled;
 if(budget!==null&&budget<requested){
  // Proportionally cover all days first. Remaining packs go to higher marginal
  // contribution, then earlier day and stable product id. No global-optimum claim.
  const ratio=requested?budget/requested:0;
  for(const r of cells)r.packs=Math.floor(r.wanted*ratio);
  let left=budget-cells.reduce((n,r)=>n+r.packs*r.spent,0);
  const ranked=[...cells].sort((a,b)=>b.priority-a.priority||a.day-b.day||a.profile.id.localeCompare(b.profile.id));
  for(const r of ranked){const remaining=r.wanted-r.packs;const affordable=Math.min(remaining,Math.floor(left/r.spent));r.packs+=affordable;left-=affordable*r.spent;}
 }
 const lines:SupplyLine[]=b.supply.map(f=>{
  const daily:SupplyDay[]=cells.filter(r=>r.profile.id===f.id).map(r=>{
   const purchaseGrams=r.packs*r.packGrams,soldGrams=Math.min(r.demand,Math.floor(purchaseGrams*r.yield+1e-8));
   const netSoldGrams=Math.min(soldGrams,Math.max(0,Math.round(soldGrams*f.netGramsPerSoldGram)));
   const purchase_scaled=r.packs*r.spent,cost_scaled=Math.min(purchase_scaled,Math.round(netSoldGrams/1000*r.cost));
   return {date:add(b.to,r.day+1),demandGrams:r.demand,purchaseGrams,soldGrams,netSoldGrams,discardGrams:purchaseGrams-netSoldGrams,purchase_scaled,
    revenue_scaled:Math.round(soldGrams/1000*f.netRevenuePerKg_scaled*(1+p.priceChange/100)),cost_scaled,loss_scaled:purchase_scaled-cost_scaled,shortageGrams:r.demand-soldGrams};
  });
  return {id:f.id,name:f.name,category:f.category,supplierId:f.supplierId,stock:f.stock,availableStock:f.availableStock,packSize:f.packSize,cost_scaled:Math.round(f.cost_scaled*(1+p.costChange/100)),lossPercent:f.lossPercent*(1-p.lossReduction/100),method:f.method,sourceRows:f.sourceRows,sourceRowCount:f.sourceRowCount,
   demandGrams:total(daily,'demandGrams'),purchaseGrams:total(daily,'purchaseGrams'),soldGrams:total(daily,'soldGrams'),discardGrams:total(daily,'discardGrams'),shortageGrams:total(daily,'shortageGrams'),
   requested_scaled:cells.filter(r=>r.profile.id===f.id).reduce((n,r)=>n+r.wanted*r.spent,0),purchase_scaled:total(daily,'purchase_scaled'),revenue_scaled:total(daily,'revenue_scaled'),cost_total_scaled:total(daily,'cost_scaled'),loss_scaled:total(daily,'loss_scaled'),daily};
 });
 const revenue_scaled=total(lines,'revenue_scaled'),cost_scaled=total(lines,'cost_total_scaled'),loss_scaled=total(lines,'loss_scaled'),purchase_scaled=total(lines,'purchase_scaled');
 const fixed_scaled=Math.round(Math.round(b.fixed_scaled*p.days/b.days)*(1+p.fixedChange/100)),profit_scaled=revenue_scaled-cost_scaled-loss_scaled-fixed_scaled;
 const demandGrams=total(lines,'demandGrams'),soldGrams=total(lines,'soldGrams'),purchaseGrams=total(lines,'purchaseGrams'),discardGrams=total(lines,'discardGrams'),shortageGrams=total(lines,'shortageGrams');
 const checks=[{name:'销售净额减全部费用等于净利润',difference:revenue_scaled-cost_scaled-loss_scaled-fixed_scaled-profit_scaled},
  {name:'采购成本等于销售成本加报损成本',difference:purchase_scaled-cost_scaled-loss_scaled},
  {name:'采购数量等于净售数量加期末清理数量',difference:purchaseGrams-total(lines.flatMap(l=>l.daily),'netSoldGrams')-discardGrams},
  {name:'预计需求等于可支持正向销量加未满足量',difference:demandGrams-soldGrams-shortageGrams},
  {name:'采购预算超支金额',difference:budget===null?0:Math.max(0,purchase_scaled-budget)}];
 if(checks.some(v=>v.difference!==0))throw Error('供销利润联动对账异常。');
 return {id,name,conditions:structuredClone(c),horizon:{from:add(b.to,1),to:add(b.to,p.days),days:p.days},revenue_scaled,cost_scaled,loss_scaled,fixed_scaled,profit_scaled,
  requested_scaled:requested,purchase_scaled,remainingBudget_scaled:budget===null?null:budget-purchase_scaled,budgetLimited:budget!==null&&purchase_scaled<requested,
  demandGrams,soldGrams,shortageGrams,purchaseGrams,discardGrams,coverage:demandGrams?soldGrams/demandGrams:0,targetMet:profit_scaled>=p.target_scaled,gap_scaled:Math.max(0,p.target_scaled-profit_scaled),lines,checks};
}
export function buildGoalReport(b:ProfitBaseline,c:GoalConditions):GoalReport {
 validateGoalConditions(c);const current=evaluateOperatingPlan(b,c,'current','保持当前条件');
 const lowerLoss={...c,inputs:{...c.inputs,lossReduction:Math.max(c.inputs.lossReduction,20)}};
 const loss=evaluateOperatingPlan(b,lowerLoss,'loss','优先降低损耗');
 let balanced=loss,tested=2;
 for(let delta=5;delta<=30;delta+=5){
  const quantityChange=Math.min(100,c.inputs.quantityChange+delta);
  const candidate=evaluateOperatingPlan(b,{...lowerLoss,inputs:{...lowerLoss.inputs,quantityChange}},'balanced','销量与降损配合');tested++;
  balanced=candidate;if(candidate.targetMet||quantityChange===100)break;
 }
 const plans=[current,loss,{...balanced,id:'balanced',name:'销量与降损配合'}];
 const met=plans.filter(r=>r.targetMet),pool=met.length?met:plans;
 const recommended=[...pool].sort((a,b)=>met.length?a.conditions.inputs.quantityChange-b.conditions.inputs.quantityChange||a.purchase_scaled-b.purchase_scaled:b.profit_scaled-a.profit_scaled||a.purchase_scaled-b.purchase_scaled)[0];
 const summary=`建议先评估“${recommended.name}”。按这些条件，可支持销售${money(recommended.revenue_scaled)}，净利润${money(recommended.profit_scaled)}（拟），${recommended.targetMet?'按条件达到目标':'距目标还差'+money(recommended.gap_scaled)}。`+
  (recommended.shortageGrams?`预算限制留下${(recommended.shortageGrams/1000).toFixed(3)}千克未满足需求（拟），不能把原需求全算成销售。`:'采购数量能覆盖此情景需求（拟），仍需核实到货。');
 const conditional=predictProfit(b,c.inputs);
 const actions=['按分日清单核实供货商交期、验收数量和资金安排，确认后再扩大推广。','每日记录采购、实际售出、退货与报损，对比本方案的需求缺口和损耗。'];
 if(recommended.conditions.inputs.lossReduction>c.inputs.lossReduction)actions.unshift('先验证冷藏、陈列和分批到货能否降低报损，再采用降损条件。');
 if(recommended.conditions.inputs.quantityChange>c.inputs.quantityChange)actions.unshift('先小范围验证销量提升条件；历史回落不能证明未来会自然增长。');
 return {version:'goal-supply-profit-v1',conditions:structuredClone(c),plans,recommendedId:recommended.id,summary,
  comparison:{historicalProfit_scaled:b.profit_scaled,unconstrainedProfit_scaled:conditional.profit_scaled,conditionalTargetMet:conditional.targetMet},
  search:{maxAdditionalQuantityPercent:30,lossImprovementPercent:lowerLoss.inputs.lossReduction,tested},
  steps:[{name:'读取同源账套',detail:`${b.rowCount}笔销售，${b.supply.length}种可备货商品；${b.checks.length}项台账对账。`},{name:'测算分日需求',detail:'沿用备货引擎的日均或星期模型、原始行号、采购单价与包装。'},{name:'比较经营方案',detail:'保持当前条件、优先降损、销量与降损配合；仅搜索销量额外增加0至30个百分点。'},{name:'检查预算和供货',detail:'采购按包装分配到每天和商品，再按可用数量限制可支持销售。'},{name:'复算利润并推荐',detail:'收入、售出成本、报损成本和其他费用逐项汇总，比较目标差距与执行条件。'}],actions,
  assumptions:['原始销售为2022年9月；2026年9月为演示账期（拟）。采购成本、库存、供货关系、费用与未来方案（拟）。',
   '需求与原备货测算共用日均/星期模型。销量提升与降损是待验证的经营条件，不是模型预测出的增长，也不证明活动因果。',
   '参考损耗率来自附件4；降损改善在联动方案中相对降低该参考率。月度历史费用情景采用不同的损耗费用比例口径，单独列示，不混作同一预测。',
   '生鲜分日到货，账面库存缺少效期和次日验收，未来可售按0计；每天净售后剩余全部按期末清理报损（拟），不计残值。',
   '销售净额单价=历史商品销售净额÷正向销量，沿用历史退货比例；实际退款和清理时间仍需单据确认。包装、安全余量沿用备货基线，采购价格按单位成本变化取万分之一元。',
   '预算为整个预测周期累计采购总额上限，不是期初现金或仅增量预算。先按比例覆盖每天，再按单位贡献分配剩余包装，未证明全局最优。',
   '销售成本只计净售商品；未售及参考损耗转报损，采购支出未重复扣除。净利润不等于现金余额。',
   '其他费用沿用历史日均；未测算价格弹性、节假日、税费、新增活动费用、阶梯人力和供应商真实产能。超出搜索范围的目标报告缺口，不承诺必达。']};
}
