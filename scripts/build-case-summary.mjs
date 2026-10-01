import {readFileSync,writeFileSync} from 'node:fs';
import {retailCase} from '../lib/retail-case.ts';
const data=JSON.parse(readFileSync('public/data/domestic-retail-september.json','utf8'));
const supplement=JSON.parse(readFileSync('public/data/domestic-operating-supplement.json','utf8'));
const c=retailCase(data,supplement,'2026-09-01','2026-09-30');
writeFileSync('public/data/case-summary.json',JSON.stringify({caseId:data.source.case_id,from:c.from,to:c.to,products:c.products.length,sales:c.sales.length,checks:c.checks.map(({name,difference})=>({name,difference}))}));
console.log('Case summary generated from the full ledger.');
