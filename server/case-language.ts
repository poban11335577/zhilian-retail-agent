const digits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
export function numberValue(s:string){
 if(/^-?\d+(?:\.\d+)?$/.test(s))return Number(s);
 let total=0,part=0,last=0;for(const c of s){if(c in digits){last=digits[c];continue}const unit=({十:10,百:100,千:1000,万:10000} as any)[c];if(!unit)return NaN;if(unit===10000){total+=(part+last)*unit;part=0}else part+=(last||1)*unit;last=0}return total+part+last;
}
export function normalizeNumbers(q:string){return q.replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296)).replace(/[零〇一二两三四五六七八九十百千万]+/g,(s,offset)=>{const after=q[offset+s.length]??'';return /[天日号月年成元％%个种名款周]/.test(after)||/百分之$/.test(q.slice(0,offset))?String(numberValue(s)):s});}
const numeral='-?\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万]+';
export function parameters(q:string,old:any={}){
 const text=normalizeNumbers(q),dm=text.match(/(-?\d+(?:\.\d+)?)\s*天/);
 const days=dm?Number(dm[1]):/明天|次日/.test(q)?1:/后天/.test(q)?1:/两周|2周/.test(text)?14:/一周|1周|下周/.test(text)?7:old.days??7;
 if(!Number.isInteger(days)||days<1||days>60)throw Error('预测天数应为1至60的整数，请确认活动天数。');
 let uplift=old.uplift??0,explicit=false;
 const changed=text.match(/(?:调整|改|变|降|减|提高|增加)[^。？%％]{0,8}(?:为|到|至|成)\s*(-?\d+(?:\.\d+)?)\s*[%％]/);
 const rate=changed??text.match(/(?:增幅|增长|提升|提高|增加|涨|下降|减少|降低|下跌|回落)[^\d-]{0,8}(-?\d+(?:\.\d+)?)\s*[%％]/);
 if(rate){uplift=Number(rate[1]);if(/下降|减少|降低|下跌|回落|降到|减到/.test(rate[0])&&uplift>0)uplift=-uplift;explicit=true}
 if(!explicit){const pct=text.match(/(?:增长|增幅|提高|增加|下降|减少|降低)?\s*百分之\s*(-?\d+(?:\.\d+)?)/),fraction=text.match(new RegExp('(?:增长|增幅|提高|增加|下降|减少|降低)[^。？]{0,4}('+numeral+')成(半)?'));if(pct){uplift=Number(pct[1]);explicit=true;if(/下降|减少|降低/.test(pct[0]))uplift=-Math.abs(uplift)}else if(fraction){uplift=numberValue(fraction[1])*10+(fraction[2]?5:0);explicit=true;if(/下降|减少|降低/.test(fraction[0]))uplift=-Math.abs(uplift)}}
 if(!Number.isFinite(uplift)||uplift< -100||uplift>300)throw Error('需求变化应为-100%至300%，下降请用负数或“下降”。');
 if(/后天/.test(q))throw Error('请指定预测开始日期；当前备货窗口从账期结束的次日开始，不能把后天当作明天。');
 const budgetMatch=text.match(/(?:预算|资金|最多花|不超过)[^\d-]{0,8}(-?\d+(?:\.\d+)?)\s*(万)?\s*(?:元|块)?/),budget=budgetMatch?Math.round(Number(budgetMatch[1])*(budgetMatch[2]?10000:1)*10000):/取消预算|不限预算|不设预算/.test(q)?null:old.budget_scaled??null;
 if(budget!==null&&(!Number.isSafeInteger(budget)||budget<0||budget>1e13))throw Error('请确认采购预算金额。');
 return {days,uplift,budget_scaled:budget,assumptions:[dm||/明天|下周|周|次日|后天/.test(q)?'天数按本次需求':old.days?'天数沿用上一轮':'未指定天数，按7天情景（拟）',explicit?'需求变化按本次需求':old.uplift!==undefined?'需求变化沿用上一轮':'未指定需求变化，按0%情景（拟）',budgetMatch?'预算按本次需求':budget!==null?'预算沿用上一轮':'未设采购预算上限','安全库存、包装及缓冲为明确标注的测算规则（拟）。']};
}
export function queryOptions(q:string){const text=normalizeNumbers(q);let metric=/毛利率|利润率/.test(q)?'margin':/毛利|利润/.test(q)?'gross':/销量|数量|卖得|卖的/.test(q)?'quantity':'revenue';const ascending=/最低|最少|最差|倒数|滞销|从低到高|升序/.test(q);const m=text.match(/(?:前|后|倒数|最\S{0,4}的?)\s*(\d+)\s*(?:个|种|名|款)?/);const limit=m?Math.min(50,Math.max(1,Number(m[1]))):10;return {metric,ascending,limit,price:/单价|售价|价格|多少钱|卖多少钱/.test(q),comparison:/对比|比较|哪个好|哪个更|分别/.test(q),lossOnly:/亏损|负毛利/.test(q)};}
