export const tables={
 products:{name:'商品',columns:['id','name','price_cents','cost_cents','source_code','unit','category','specification']},
 suppliers:{name:'供应商',columns:['id','name','lead_days','on_time_percent']},
 purchase_orders:{name:'采购单',columns:['id','supplier_id','product_id','quantity','unit_cost_cents','due_date','status']},
 inventory:{name:'库存',columns:['product_id','stock','safety_stock','as_of']},
 sales_orders:{name:'销售明细',columns:['id','product_id','date','quantity','unit_price_cents','unit_cost_cents','amount_cents','is_promotion']},
 campaigns:{name:'营销活动',columns:['id','product_id','name','start_date','end_date','discount_percent','budget_cents']},
 deliveries:{name:'履约记录',columns:['id','order_id','promised_date','delivered_date','status']},
 returns:{name:'售后记录',columns:['id','order_id','quantity','reason','status']}
} as const;
export type TableName=keyof typeof tables;
export const agentTables:Record<string,TableName[]>={orchestrator:[],procurement:['suppliers','purchase_orders','products'],demand:['campaigns','sales_orders'],forecast:['sales_orders','products'],inventory:['inventory','products'],replenish:['inventory','purchase_orders','suppliers','sales_orders'],strategy:['campaigns','products','sales_orders','inventory'],fulfillment:['deliveries','returns','sales_orders'],review:[]};
export function businessSample(){const products=[{id:'T001',name:'轻醒无糖茶',price_cents:600,cost_cents:280},{id:'W001',name:'矿泉水',price_cents:200,cost_cents:85},{id:'C001',name:'冰咖啡',price_cents:800,cost_cents:420}];const sales_orders=products.flatMap((p,j)=>Array.from({length:28},(_,i)=>({id:`S${j}-${i}`,product_id:p.id,date:new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10),quantity:[80,120,35][j]+(i%7-3)*3,unit_price_cents:p.price_cents,unit_cost_cents:p.cost_cents})));return {
 products,suppliers:[{id:'V001',name:'青禾饮品供应商（模拟）',lead_days:3,on_time_percent:96},{id:'V002',name:'校园商贸供应商（模拟）',lead_days:5,on_time_percent:88}],
 purchase_orders:[{id:'P001',supplier_id:'V001',product_id:'T001',quantity:500,unit_cost_cents:280,due_date:'2026-10-01',status:'pending'},{id:'P002',supplier_id:'V002',product_id:'W001',quantity:1000,unit_cost_cents:85,due_date:'2026-10-03',status:'pending'}],
 inventory:[{product_id:'T001',stock:1200,safety_stock:500,as_of:'2026-09-28'},{product_id:'W001',stock:1800,safety_stock:600,as_of:'2026-09-28'},{product_id:'C001',stock:160,safety_stock:100,as_of:'2026-09-28'}],sales_orders,
 campaigns:[{id:'C001',product_id:'T001',name:'运动会饮品促销（模拟）',start_date:'2026-10-01',end_date:'2026-10-07',discount_percent:10,budget_cents:30000}],
 deliveries:[{id:'D001',order_id:'S0-20',promised_date:'2026-09-22',delivered_date:'2026-09-23',status:'delayed'},{id:'D002',order_id:'S1-25',promised_date:'2026-09-27',delivered_date:'2026-09-27',status:'delivered'}],
 returns:[{id:'R001',order_id:'S0-20',quantity:2,reason:'包装破损（模拟）',status:'pending'}]
};}
