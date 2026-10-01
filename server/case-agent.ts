// Public source records and fitted supplement are the same files used by all views.
// @ts-ignore JSON is bundled into the server function.
import original from '../public/data/domestic-retail-september.json' with {type:'json'};
// @ts-ignore
import supplement from '../public/data/domestic-operating-supplement.json' with {type:'json'};
import {retailCase} from '../lib/retail-case.ts';
const money=(n:number)=>(n/10000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:4})+'元';
export function caseFacts(from='2026-09-01',to='2026-09-30'){return retailCase(original,supplement,from,to)}
export function caseAnswer(question:string,from='2026-09-01',to='2026-09-30',previous=''){
 question=question.replace(/九月/g,'9月');const bare=question.match(/(?:^|[^0-9])(\d{1,2})月/);if((bare&&Number(bare[1])!==9)||/[一二三四五六七八十]+月|今年/.test(question))return '当前案例仅提供2026年9月演示记录（拟）；请查询该月份，其他月份不能从本账套推断。';
 const explicit=question.match(/(\d{4})[年\/-](\d{1,2})(?:月|[\/-])/);if(explicit&&(explicit[1]!=='2026'||Number(explicit[2])!==9))return '当前演示账期为2026年9月（拟），原始记录为2022年9月，其他月份不在这份数据中。请切换到2026年9月；补齐部分标（拟）。';
 const c=caseFacts(from,to),prefix=`当前账套：原始销售 + 补齐记录（拟），${from}至${to}，币种人民币，数量单位千克；官方原始日期2022年9月，演示日期2026年9月（拟）。\n`,q=question.toLowerCase(),ctx=/^(那|它|这个|该商品|同一个)/.test(question)?q+' '+previous.toLowerCase():q;
 const found=c.products.filter(p=>new RegExp('(^|[^a-z0-9])'+p.id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z0-9]|$)','i').test(ctx)||ctx.includes(p.name.toLowerCase())||ctx.includes(p.original_name?.toLowerCase()??'__no_original__'));
 if(found.length){return prefix+found.slice(0,10).map(p=>`${p.name}（编码${p.id}）：买入${p.bought}${p.unit.replace('（拟）','')}（拟），正向销售数量${p.sold}，负向销售数量${p.returned}；期末库存${p.stock}${p.unit.replace('（拟）','')}（拟），库存金额${money(p.stock_value_scaled)}（拟）。原始销售单价范围${money(p.source_price_min_scaled)}至${money(p.source_price_max_scaled)}（完整月份）；采购单价${money(p.cost_scaled)}（拟）。本期销售净额${money(p.revenue_scaled)}，成本${money(p.cost_total_scaled)}（拟），毛利${money(p.gross_profit_scaled)}（拟）。`).join('\n')}
 if(/真实|来源|造假|原始|拟.*意思|什么意思.*拟/.test(q))return prefix+'中文商品、编码、销量、售价与退货类型来自全国大学生数学建模竞赛2023年C题附件；原始2022年9月日期与行号保留。销售金额为销量乘售价的演算结果，原表没有实收金额；日汇总单号（拟）。参考批发价来自附件3，近期损耗率来自附件4，均不能当作真实采购凭证或本月盘点。采购、供货商、库存、营销、履约、售后、成本、收付款及会计凭证标（拟）；净利润（拟）由这些记录计算，不是原企业真实利润。';
 if(/利润|亏损|财务|报表|现金|收入|费用|赚|成本/.test(q)){const i=c.income,b=c.balance;return prefix+`销售净额${money(i.revenue_scaled)}；减销售成本${money(i.cost_scaled)}（拟），毛利${money(i.gross_profit_scaled)}（拟）；再减经营费用${money(i.expense_scaled)}（拟，含损耗费用${money(i.loss_scaled)}），净利润${money(i.net_profit_scaled)}（拟）。\n期末现金${money(b.cash)}（拟）、应收${money(b.receivable)}（拟）、库存${money(b.inventory)}（拟）、应付${money(b.payable)}（拟）。现金包含拟定初始投入，采购付款与利润中的销售成本口径不同，因此现金余额不等于净利润。\n${c.checks.filter(r=>!r.difference).length}/${c.checks.length}项对账通过。可在财务报表和会计凭证逐笔回查。`}
 if(/供货商|供应商|采购|进货|买了|入库/.test(q))return prefix+c.purchases.map((p:any)=>`${p.partner}：采购单${p.id}，${p.lines.length}个商品，金额${money(p.amount_scaled)}（拟），付款${money(-p.cash_scaled)}（拟），应付${money(p.amount_scaled+p.cash_scaled)}（拟）。`).join('\n');
 if(/营销|活动|促销/.test(q))return prefix+c.marketing.map((m:any)=>`${m.name}：${m.date}至${m.end}，费用${money(m.expense_scaled)}（拟），关联原始销售单${m.invoice_reference}。`).join('\n');
 if(/履约|赴约|发货|交付|物流/.test(q))return prefix+`${c.fulfillment.length}条履约记录（拟），按每日正向销售汇总建立，交付登记和状态均标（拟）。每条记录可打开销售原单及关联凭证。`+(/售后|退货|退款/.test(q)?`\n${c.aftersales.length}条售后记录（拟），关联原始负向销售单；处理状态及退款标（拟）。`:'');
 if(/售后|退货|退款|冲销/.test(q))return prefix+`${c.aftersales.length}条售后记录（拟），关联原始负向销售单。拟定退款合计${money(c.aftersales.reduce((n:number,r:any)=>n+r.refund_scaled,0))}（拟）。原始取消/负向记录不等于已真实退款，退款及处理状态均标（拟）。`;
 if(/库存|缺货|补货/.test(q))return prefix+`期末库存账面金额${money(c.balance.inventory)}（拟），逐笔库存流水${c.flow.length}条，库存明细与总账差额为0。要查看某个商品的数量、成本和出入库，请给出商品编码或原始名称；可以从商品页复制。`;
 if(/销售|卖了|销售额|多少产品|商品|产品/.test(q))return prefix+`${c.products.length}个商品编码，${c.sales.length}条原始记录，销售净额${money(c.income.revenue_scaled)}。每笔销售保留原表行号、原始日期、数量和单价；日汇总编号（拟），拟定成本及毛利也能逐行回查。`;
 return prefix+'可以查询本账套的商品买卖数量、价格、库存、供货采购、营销、履约、售后和利润。比如：“小米椒买了多少、卖了多少，毛利多少？”或“利润和现金为什么不同？”';
}
