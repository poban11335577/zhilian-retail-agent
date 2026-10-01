import json,hashlib,statistics
from pathlib import Path
from decimal import Decimal,ROUND_HALF_UP
from collections import defaultdict

import sys
folder=Path(sys.argv[1] if len(sys.argv)>1 else 'scripts/data-inputs/domestic')
def load(n):return json.loads(next(folder.glob('*'+str(n)+'.json')).read_text(encoding='utf-8'))
def rounded(v):return int(Decimal(str(v)).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
def grams(v):return rounded(Decimal(str(v))*1000)
def money(v):return rounded(Decimal(str(v))*10000)
def code(v):return str(v).split('.')[0]
info={code(r[1]):{'name':r[2],'category_code':str(r[3]),'category':r[4]} for r in load(1)['rows']}
losses={code(r[1]):float(r[3]) for r in load(4)['rows']}
wholesale=load(3);bycode=defaultdict(list)
for r in wholesale['rows']:bycode[code(r[2])].append({'row':r[0],'date':r[1][:10],'price_scaled':money(r[3])})
original=load(2);rows=[];sales_meta={};byday=defaultdict(list)
for r in original['rows']:
 row,dt,tm,sku,quantity,price,sale_type,discount=r
 sku=code(sku);g=grams(quantity);g=-abs(g) if sale_type=='退货' else g
 timestamp=dt[:10]+'T'+tm;demo=timestamp.replace('2022-09','2026-09',1)
 invoice=('日退-' if g<0 else '日销-')+dt[:10].replace('-','')+'（拟）'
 p=money(price);amount=rounded(Decimal(g)*p/1000)
 record=[row,invoice,sku,info[sku]['name'],g/1000,demo,p,amount,'中国']
 rows.append(record);byday[demo[:10]].append(record)
 sales_meta[str(row)]={'original_date':timestamp,'sale_type':sale_type,'discount':discount,'quantity_grams':g,'source_file':'附件2.xlsx'}
rows.sort(key=lambda r:(r[5],r[0]))
group=defaultdict(list)
for r in rows:group[r[2]].append(r)
categories=sorted({info[sku]['category'] for sku in group});suppliers=[{'id':f'供{i+1:02}','name':cat+'产地配送商（拟）','category':cat,'lead_days':1,'payment_terms':'采购时付80%，其余应付（拟）','source':'（拟）'} for i,cat in enumerate(categories)]
supplier_ids={s['category']:s['id'] for s in suppliers};products=[];costs={}
for sku,rs in group.items():
 refs=bycode[sku]
 if not refs:raise ValueError('缺少公开批发价格依据 '+sku)
 reference=statistics.median(r['price_scaled'] for r in refs)
 cost=rounded(Decimal(str(reference))/1000)*1000
 cost=max(1000,cost);costs[sku]=cost
 products.append({'id':sku,'name':info[sku]['name'],'original_name':info[sku]['name'],'unit':'千克','category':info[sku]['category'],'stocked':True,'supplier_id':supplier_ids[info[sku]['category']],'cost_scaled':cost,'wholesale_reference_scaled':reference,'wholesale_refs':refs,'loss_percent':losses[sku],'loss_note':'附件4近期损耗率，非2022年9月逐笔实测','source_price_min_scaled':min(r[6] for r in rs),'source_price_max_scaled':max(r[6] for r in rs),'pack_size':0.5,'safety_days':0.2,'shelf_life_days':1,'purchase_quantity':0,'source':'商品名称、分类、销量与售价来自官方公开数据；供货关系、采购成本、库存（拟）'})
ps={p['id']:p for p in products};stocks=defaultdict(int);purchases=[];stock_losses=[];invoices={};cost_by_row={}
def value(sku,g):return g*costs[sku]//1000
for dt,rs in sorted(byday.items()):
 # One-day fitted fresh batches: dispose of yesterday's balance before restocking.
 for sku,g in list(stocks.items()):
  if g>0:
   stock_losses.append({'id':'隔夜耗-'+dt.replace('-','')+'-'+sku+'（拟）','date':dt,'timestamp':dt+'T00:01:00','product_id':sku,'quantity':g/1000,'amount_scaled':value(sku,g),'source':'上一日拟定结存按一日生鲜效期清理（拟），不是实际报损凭证'})
   stocks[sku]=0
 day_groups=defaultdict(list)
 for r in rs:day_groups[r[2]].append(r)
 supplier_lines=defaultdict(list)
 for sku,items in day_groups.items():
  positive=sum(max(0,grams(r[4])) for r in items);net=sum(grams(r[4]) for r in items)
  cumul=maximum=0
  for r in items:cumul+=grams(r[4]);maximum=max(maximum,cumul)
  loss_g=rounded(Decimal(positive)*Decimal(str(ps[sku]['loss_percent']))/(100-Decimal(str(ps[sku]['loss_percent']))))
  reserve=rounded(Decimal(positive)*Decimal('0.2'))
  incoming=max(0,max(maximum,net+loss_g+reserve)-stocks[sku]);stocks[sku]+=incoming;ps[sku]['purchase_quantity']+=incoming/1000
  if incoming:supplier_lines[ps[sku]['supplier_id']].append({'product_id':sku,'name':ps[sku]['name'],'quantity':incoming/1000,'unit_price_scaled':costs[sku],'amount_scaled':value(sku,incoming),'source':'数量按当日历史销量、参考损耗与少量结存生成（拟）'})
  stock_losses.append({'id':'耗-'+dt.replace('-','')+'-'+sku+'（拟）','date':dt,'timestamp':dt+'T23:59:59','product_id':sku,'quantity':loss_g/1000,'amount_scaled':value(sku,loss_g),'source':'按附件4近期损耗率换算当日拟定损耗，不是原始盘点（拟）'})
 for supplier_id,lines in supplier_lines.items():
  amount=sum(l['amount_scaled'] for l in lines);purchases.append({'id':'采-'+dt.replace('-','')+'-'+supplier_id+'（拟）','date':dt,'timestamp':dt+'T03:00:00','type':'purchase','partner':next(s['name'] for s in suppliers if s['id']==supplier_id),'amount_scaled':amount,'cash_scaled':-(amount*80//100),'cost_scaled':0,'lines':lines,'source':'（拟）'})
 for r in rs:
  sku=r[2];g=grams(r[4]);cost=value(sku,g);cost_by_row[str(r[0])]=cost;stocks[sku]-=g
  if stocks[sku]<0:raise ValueError('库存负数 '+sku)
  doc=invoices.setdefault(r[1],{'id':r[1],'date':dt,'type':'sale','partner':'国内商超扫码零售','amount_scaled':0,'cost_scaled':0,'records':0,'source':'销量和售价来自附件2；金额为乘积演算，日汇总单号、成本和收退款（拟）'})
  doc['amount_scaled']+=r[7];doc['cost_scaled']+=cost;doc['records']+=1
 for loss in stock_losses:
  if loss['date']==dt and 'T23:' in loss['timestamp']:stocks[loss['product_id']]-=grams(loss['quantity'])
for p in products:p['purchase_quantity']=round(p['purchase_quantity'],3)
for v in invoices.values():v['cash_scaled']=v['amount_scaled']
marketing=[]
for i,(start,end,name,amount) in enumerate([('05','11','秋季鲜蔬促销',500),('12','18','中秋家宴蔬菜活动',700),('23','30','会员菜篮子活动',400)],1):
 dt='2026-09-'+start;marketing.append({'id':'营-'+str(i)+'（拟）','name':name+'（拟）','date':dt,'end':'2026-09-'+end,'expense_scaled':amount*10000,'status':'已结束（拟）','invoice_reference':next(v['id'] for v in invoices.values() if v['date']==dt and v['amount_scaled']>0),'source':'（拟）'})
fulfillment=[{'id':'履-'+v['id'],'invoice':v['id'],'date':v['date'],'tracking':'门店交付登记-'+v['date']+'（拟）','status':'线下扫码交付（拟）','country':'中国','order_amount_scaled':v['amount_scaled'],'source':'按日正向销售汇总建立交付登记（拟），不是物流原始运单'} for v in invoices.values() if v['amount_scaled']>0]
aftersales=[{'id':'售后-原表'+str(r[0])+'（拟）','invoice':r[1],'date':r[5][:10],'product_id':r[2],'source_row':r[0],'quantity':-r[4],'status':'退货处理完成（拟）','reason':'附件2销售类型为退货；实物质量与处理过程（拟）','refund_scaled':-r[7],'source':'退货类型、数量与售价为公开原始记录；退款及处理流程（拟）'} for r in rows if r[4]<0]
expenses=[{'id':'费-'+m['id'],'date':m['date'],'type':'expense','partner':m['name'],'amount_scaled':m['expense_scaled'],'cash_scaled':-m['expense_scaled'],'cost_scaled':0,'source':'（拟）'} for m in marketing]
for name,amount in [('房租',3000),('人员工资',9000),('水电及冷藏',1200),('配送费用',1800)]:expenses.append({'id':'费-'+name+'（拟）','date':'2026-09-30','type':'expense','partner':name+'（拟）','amount_scaled':amount*10000,'cash_scaled':-amount*10000,'cost_scaled':0,'source':'（拟）'})
loss_docs=[{'id':r['id'],'date':r['date'],'type':'stock_loss','partner':'蔬菜损耗（拟）','amount_scaled':r['amount_scaled'],'cash_scaled':0,'cost_scaled':0,'source':r['source']} for r in stock_losses if r['amount_scaled']]
capital=50000*10000
documents=[{'id':'资-20260901（拟）','date':'2026-09-01','type':'capital','partner':'期初经营资金（拟）','amount_scaled':capital,'cash_scaled':capital,'cost_scaled':0,'source':'（拟）'},*purchases,*invoices.values(),*expenses,*loss_docs]
journal=[]
def entry(v,a,n):
 if n:journal.append({'document_id':v['id'],'date':v['date'],'account':a,'debit_scaled':max(n,0),'credit_scaled':max(-n,0),'source':'（拟）'})
for v in documents:
 a=v['amount_scaled'];cash=v['cash_scaled'];entry(v,'cash',cash)
 if v['type']=='capital':entry(v,'capital',-a)
 elif v['type']=='purchase':entry(v,'inventory',a);entry(v,'payable',-a-cash)
 elif v['type']=='sale':entry(v,'receivable',a-cash);entry(v,'revenue',-a);entry(v,'cogs',v['cost_scaled']);entry(v,'inventory',-v['cost_scaled'])
 elif v['type']=='stock_loss':entry(v,'expense',a);entry(v,'inventory',-a)
 else:entry(v,'expense',a)
hashes=json.loads((folder/'file-hashes.json').read_text(encoding='utf-8'))
if (folder/'vegetables').exists():
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (folder/'vegetables').glob('*.xlsx')}
source={'case_id':'国内商超-202609-人民币-v3','region':'中国','name':'全国大学生数学建模竞赛2023年C题商超公开数据','url':'https://www.mcm.edu.cn/html_cn/node/c74d72127066f510a5723a94b5323a26.html','release_url':'https://dxs.moe.gov.cn/zx/a/hd_sxjm_sthb/230523/1840580.shtml','download_url':'https://univs-news-1256833609.file.myqcloud.com/52Kw7CxOBXSKw/2%40Q%40dFHtlmYSo.rar','currency':'CNY','original_currency':'CNY','conversion_rate':1,'quantity_unit':'千克','original_period':'2022-09','demo_period':'2026-09','date_note':'原始销售为2022年9月，演示日期平移至2026年9月（拟），原始日期与行号完整保留。','file':'附件2.xlsx','sheet':'Sheet1','license':'组委会公开发布赛题数据，版权归原权利人；用于教学及参赛演示，非商业授权','doi':'无DOI；官方发布页面可核验','sha256':next(v for k,v in hashes.items() if k.endswith('2.xlsx')),'file_hashes':hashes,'invoice_note':'原表没有交易单号；日销售汇总编号（拟）','amount_note':'销售金额由原始销量×原始售价演算，保留4位小数；原表未给出小票实收金额。'}
policy='官方公开商品名称、分类、销量、售价及退货类型保持原值；销售原始日期2022年9月，2026年9月为演示日期（拟）。单位千克，货币人民币，无汇率换算。销售金额由数量与售价乘积演算到万分之一元。参考成本取本月公开批发价中位数，再保留一位小数作为演示采购单位成本（拟）；原批发价与原表行号保留。每日按当日历史销售、附件4近期损耗率与20%结存生成采购、损耗和库存（拟）；上一日拟定结存按一日生鲜效期在次日采购前清理（拟），这是回放账套，不能作为预测准确性的证明。供应关系、每日汇总单号、营销履约售后处理、初始资金与费用均（拟）。采购80%现金、其余应付；零售及退款100%现金（拟）。拟定库存没有实测批次效期，生鲜补货应分日到货，拟定库存能否次日销售须人工确认。拟定利润不代表原商超真实利润，未计提税费。'
supplement={'scale':10000,'quantity_scale':1000,'products':products,'suppliers':suppliers,'purchases':purchases,'stock_losses':stock_losses,'cost_by_row':cost_by_row,'marketing':marketing,'fulfillment':fulfillment,'aftersales':aftersales,'documents':documents,'journal':journal,'policy':policy}
target=Path('public/data')
(target/'domestic-retail-september.json').write_text(json.dumps({'source':source,'rows':rows,'sales_meta':sales_meta,'wholesale':wholesale,'loss_reference':load(4)},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(target/'domestic-operating-supplement.json').write_text(json.dumps(supplement,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'sales':len(rows),'products':len(products),'suppliers':len(suppliers),'purchases':len(purchases),'aftersales':len(aftersales),'saleRevenue':sum(r[7] for r in rows)/10000,'originalPeriod':source['original_period'],'cashMinimumPendingCheck':'以计算器独立核验'},ensure_ascii=False))

