import type {Database} from 'sql.js';
import {z} from 'zod';
import {query} from './business-db.ts';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'无效日期');
export const salesFilterSchema=z.object({from:date.optional(),to:date.optional(),productCode:z.string().trim().min(1).max(100).optional()}).refine(v=>!v.from||!v.to||v.from<=v.to,'日期范围顺序错误');
export type SalesFilter=z.infer<typeof salesFilterSchema>;
export function salesAnalysis(db:Database,allowed:Set<string>,question:string,filter:SalesFilter={},selectedId?:string){
 if(!allowed.has('sales_orders'))return {text:'没有销售表的读取权限，无法分析。',evidence:[{sql:'未执行：缺少数据权限',tables:['sales_orders'],rowCount:0,rows:[]}]};
 const f=salesFilterSchema.parse(filter),evidence:any[]=[],hasProducts=allowed.has('products');
 // Explicit dates still work in rule-only mode. Ambiguous month-only requests require clarification.
 if(!f.from&&!f.to){const month=question.match(/(20\d{2})(?:年|[-/])(\d{1,2})月?(?![\d\-/日])/);if(month&&!/20\d{2}[-/]\d{1,2}[-/]\d{1,2}/.test(question)){const y=+month[1],m=+month[2];if(m<1||m>12)throw Error('请提供有效月份');f.from=`${y}-${String(m).padStart(2,'0')}-01`;f.to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)}}
 const conditions:string[]=[],args:any[]=[];
 if(f.from){conditions.push('s.date>=?');args.push(f.from)}if(f.to){conditions.push('s.date<=?');args.push(f.to)}
 if(selectedId){conditions.push('s.product_id=?');args.push(selectedId)}else if(f.productCode){if(hasProducts){conditions.push('(s.product_id=? OR p.source_code=?)');args.push(f.productCode,f.productCode)}else{conditions.push('s.product_id=?');args.push(f.productCode)}}
 const from=' FROM sales_orders s'+(hasProducts?' JOIN products p ON p.id=s.product_id':'')+(conditions.length?' WHERE '+conditions.join(' AND '):''),amount='COALESCE(s.amount_cents,ROUND(s.quantity*s.unit_price_cents))';
 const read=(sql:string)=>{const rows=query(db,sql,args);const displayed=rows.map(row=>Object.fromEntries(Object.entries(row).flatMap(([k,v])=>['revenue','cost','negative_amount'].includes(k)?[[k==='negative_amount'?k:k+'_amount',v==null?null:(Number(v)/100).toFixed(2)]]:[[k,v]])));evidence.push({sql,args:[...args],tables:hasProducts?['sales_orders','products']:['sales_orders'],rowCount:rows.length,rows:displayed,displayTransform:'金额字段已除以100，*_amount 为原表金额单位的精确小数字符串；原表未声明币种，不要换算成万元。'});return rows};
 const total=read(`SELECT COUNT(*) records,MIN(s.date) period_start,MAX(s.date) as_of,COALESCE(SUM(${amount}),0) revenue,SUM(ROUND(s.quantity*s.unit_cost_cents)) cost,SUM(CASE WHEN s.unit_cost_cents IS NULL THEN 1 ELSE 0 END) missing_cost,SUM(CASE WHEN s.quantity<0 THEN 1 ELSE 0 END) negative_records,COALESCE(SUM(CASE WHEN s.quantity<0 THEN ${amount} ELSE 0 END),0) negative_amount${from}`)[0];
 if(!total.records)return {text:`指定范围${f.from??'起始'}至${f.to??'末尾'}没有销售记录，不能当成零销售，也不能推断当前库存。`,evidence};
 read(`SELECT substr(s.date,1,7) month,COUNT(*) records,SUM(${amount}) revenue${from} GROUP BY month ORDER BY month`);
 read(`SELECT s.product_id${hasProducts?',p.name,p.source_code,p.unit,p.category':''},SUM(${amount}) revenue,SUM(s.quantity) quantity,COUNT(*) records${from} GROUP BY s.product_id ORDER BY revenue DESC,s.product_id LIMIT 10`);
 if(hasProducts)read(`SELECT COALESCE(p.category,'未分类') category,SUM(${amount}) revenue,COUNT(*) records${from} GROUP BY p.category ORDER BY revenue DESC LIMIT 30`);
 return {text:`本次查询日期范围：${f.from??'最早记录'}至${f.to??'最后记录'}；实际记录期间 ${total.period_start} 至 ${total.as_of}。共 ${total.records} 条销售，销售净额（按源数据金额单位） ${(Number(total.revenue)/100).toFixed(2)}。${Number(total.missing_cost)>0?'缺少进货成本，无法计算毛利或净利润':'销售毛利 '+((Number(total.revenue)-Number(total.cost))/100).toFixed(2)+'，尚未扣除费用及税费，不是净利润'}。${total.negative_records??0} 条负数销售合计 ${(Number(total.negative_amount)/100).toFixed(2)}，为冲销或退货候选，退款未核验。证据另含月度趋势${hasProducts?'、品类汇总':''}和销售净额前十的商品。不同单位销量不能合计。历史记录不是当前库存，数据缺失日不自动当作零。`,evidence};
}
