import type {Repository} from './api.ts';
import {openBusiness,query} from './business-db.ts';
export async function financialView(repo:Repository,tenant:string,from='',to=''){
 for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date).toISOString().slice(0,10)!==date))throw Error('请选择有效日期');
 if(from&&to&&from>to)throw Error('开始日期不能晚于结束日期');
 const {db,source,revision}=await openBusiness(repo,tenant);
 try{
  const where=' WHERE (? = \'\' OR s.date >= ?) AND (? = \'\' OR s.date <= ?)',args=[from,from,to,to];
  const amount='COALESCE(s.amount_cents,ROUND(s.quantity*s.unit_price_cents))';
  const summary=query(db,`SELECT COUNT(*) records,MIN(s.date) first_date,MAX(s.date) last_date,COUNT(DISTINCT s.date) days,COUNT(DISTINCT s.product_id) products,COALESCE(SUM(${amount}),0) net_cents,COALESCE(SUM(CASE WHEN s.quantity>=0 THEN ${amount} ELSE 0 END),0) positive_cents,COALESCE(SUM(CASE WHEN s.quantity<0 THEN ${amount} ELSE 0 END),0) reversal_cents,SUM(CASE WHEN s.quantity<0 THEN 1 ELSE 0 END) reversal_records,SUM(CASE WHEN s.unit_cost_cents IS NULL THEN 1 ELSE 0 END) missing_costs,COALESCE(SUM(ROUND(s.quantity*s.unit_cost_cents)),0) cost_cents FROM sales_orders s${where}`,args)[0];
  if(!summary.records||summary.missing_costs)summary.cost_cents=null;
  summary.gross_profit_cents=summary.cost_cents===null?null:summary.net_cents-summary.cost_cents;
  const monthly=query(db,`SELECT substr(s.date,1,7) month,COUNT(*) records,SUM(${amount}) net_cents FROM sales_orders s${where} GROUP BY month ORDER BY month`,args);
  const daily=query(db,`SELECT s.date,SUM(${amount}) net_cents FROM sales_orders s${where} GROUP BY s.date ORDER BY s.date`,args);
  const products=query(db,`SELECT p.id,p.name,p.source_code,p.unit,COUNT(*) records,SUM(s.quantity) quantity,SUM(${amount}) net_cents FROM sales_orders s JOIN products p ON p.id=s.product_id${where} GROUP BY p.id ORDER BY net_cents DESC,p.id LIMIT 100`,args);
  const categories=query(db,`SELECT COALESCE(p.category,'未分类') category,COUNT(*) records,SUM(${amount}) net_cents FROM sales_orders s JOIN products p ON p.id=s.product_id${where} GROUP BY p.category ORDER BY net_cents DESC`,args);
  const units=query(db,`SELECT COALESCE(p.unit,'未声明单位') unit,SUM(s.quantity) quantity FROM sales_orders s JOIN products p ON p.id=s.product_id${where} GROUP BY p.unit`,args);
  const counts=Object.fromEntries(['products','suppliers','purchase_orders','inventory','sales_orders'].map(t=>[t,query(db,'SELECT COUNT(*) n FROM '+t)[0].n]));
  const eligible=query(db,"SELECT COUNT(*) n FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.price_cents IS NOT NULL AND i.stock>0 AND i.as_of=date('now') AND p.name NOT LIKE '商品编码 %'")[0].n;
  return {tenant,source,revision,summary,monthly,daily,products,units,categories,counts,eligible,from,to,currency:'原表币种未声明',limitations:['负数销售单独列为冲销/退货候选，尚未核验退款状态。','销售记录不等于收款；未接入银行流水、应收应付、税费和经营费用。','不同计量单位分别统计，不能合并为销售件数。','历史销量和成交价格不能证明当前有货；缺少商品名称、现价或当日库存的商品不开放销售。']};
 }finally{db.close()}
}
