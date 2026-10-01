import {useEffect,useState} from 'react';
export const ledgerTableNames:Record<string,string>={products:'商品',purchases:'采购入库明细',sales:'销售明细',returns:'销售退回明细',inventory:'库存余额',documents:'业务单据',journal:'会计凭证',flow:'全流程流水',plans:'采购计划',suppliers:'供货商',marketing:'营销活动',fulfillment:'履约记录',aftersales:'售后记录'};
function saved(){try{return JSON.parse(sessionStorage.getItem('zhilian-ledger-period')??'null')??{from:'2026-09-01',to:'2026-09-30'};}catch{return {from:'',to:''};}}
export function useLedgerPeriod(){const [from,setFrom]=useState<string>(()=>saved().from),[to,setTo]=useState<string>(()=>saved().to);useEffect(()=>{sessionStorage.setItem('zhilian-ledger-period',JSON.stringify({from,to}));},[from,to]);return {from,to,setFrom,setTo};}
