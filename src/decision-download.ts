import type {ProfitBaseline} from '../lib/profit-forecast';
import type {GoalReport} from '../lib/goal-planner';
import {chineseReportHTML} from '../lib/decision-report';
import {decisionWorkbook} from '../lib/report-xlsx';
function download(data:Blob,name:string){const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function downloadChineseReport(b:ProfitBaseline,r:GoalReport,id?:string){download(new Blob([chineseReportHTML(b,r,id)],{type:'text/html;charset=utf-8'}),'智链销经营目标报告（拟）.html')}
export async function downloadDecisionExcel(b:ProfitBaseline,r:GoalReport,id?:string){const response=await fetch('/data/decision-report-template.xlsx');if(!response.ok)throw Error('Excel模板未加载，请刷新后重试。');const bytes=await decisionWorkbook(new Uint8Array(await response.arrayBuffer()),b,r,id);download(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'智链销经营方案与分日流水（拟）.xlsx')}
