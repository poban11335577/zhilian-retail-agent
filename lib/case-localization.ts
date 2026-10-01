// Display adaptations never overwrite the source data or its original currency.
// @ts-ignore The reviewed name map is bundled for browser and server alike.
import dictionary from '../public/data/chinese-names.json' with {type:'json'};
export const CASE_RATE=10;
export const CASE_ID='国内商超-202609-人民币-v3';
export const CASE_DATE_NOTE='演示账期：2026年9月1日至30日（拟）；原始销售日期为2011年9月，同月同日平移，原表不变。';
export const caseDate=(s:string)=>s.replace(/^2011-09-/, '2026-09-');
export const CASE_CURRENCY_NOTE='人民币 · 固定演示汇率：1英镑＝10元（拟）';
const countries:Record<string,string>={'Australia':'澳大利亚','Belgium':'比利时','Channel Islands':'海峡群岛','Cyprus':'塞浦路斯','Denmark':'丹麦','EIRE':'爱尔兰','Finland':'芬兰','France':'法国','Germany':'德国','Hong Kong':'中国香港','Israel':'以色列','Italy':'意大利','Japan':'日本','Netherlands':'荷兰','Norway':'挪威','Poland':'波兰','Portugal':'葡萄牙','Spain':'西班牙','Sweden':'瑞典','Switzerland':'瑞士','United Arab Emirates':'阿拉伯联合酋长国','United Kingdom':'英国','Unspecified':'原表未指定'};
const cache=new WeakMap<object,WeakMap<object,any>>();
export function prepareChineseCase(original:any,supplement:any){
 if(original.source.case_id==='国内商超-202609-人民币-v3')return {original,supplement};
 if(original.source.currency==='CNY'&&original.source.conversion_rate===CASE_RATE)return {original,supplement};
 let bySupplement=cache.get(original);if(!bySupplement){bySupplement=new WeakMap();cache.set(original,bySupplement)}const prior=bySupplement.get(supplement);if(prior)return prior;
 const names=dictionary.products as Record<string,{name:string;original_name:string}>;
 const d={...original,source:{...original.source,currency:'CNY',original_currency:'GBP',conversion_rate:CASE_RATE,currency_note:CASE_CURRENCY_NOTE,case_id:'经营案例-202609-人民币-v2',original_period:'2011-09',demo_period:'2026-09',date_note:CASE_DATE_NOTE},rows:original.rows.map((r:any[])=>[r[0],r[1],r[2],names[r[2]]?.name??'库存调整项目',r[4],caseDate(r[5]),r[6]*CASE_RATE,r[7]*CASE_RATE,countries[r[8]]??r[8]])};
 function adapt(v:any):any{if(Array.isArray(v))return v.map(adapt);if(!v||typeof v!=='object')return v;const o:any={};for(const [k,x] of Object.entries(v)){o[k]=typeof x==='number'&&k.endsWith('_scaled')?x*CASE_RATE:typeof x==='string'&&['date','end'].includes(k)?caseDate(x):adapt(x)}if(o.country)o.country=countries[o.country]??o.country;if(o.partner)o.partner=countries[o.partner]??o.partner;const productId=o.product_id??(o.stocked!==undefined?o.id:null);if(productId&&names[productId]){o.original_name=names[productId].original_name;o.name=names[productId].name}return o}
 const s=adapt(supplement);s.policy=CASE_DATE_NOTE+CASE_CURRENCY_NOTE+'。中文商品名为原始描述译名，编码、数量和原始英镑文件不变；所有金额按同一固定演示汇率换算，非实时汇率。'+supplement.policy;
 for(const p of s.products)p.source='编码、数量沿用原表；名称为中文译名，金额人民币换算；单位、分类及成本（拟）';
 for(const d of s.documents)if(d.type==='sale')d.source='销售与调整按原始金额换算人民币；成本、收付款（拟）';
 for(const a of s.aftersales)a.source='负向销售按原金额换算人民币；售后流程与退款（拟）';
 const result={original:d,supplement:s};bySupplement.set(supplement,result);return result;
}
