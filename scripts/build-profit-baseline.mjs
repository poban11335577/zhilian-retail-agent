import {readFileSync,writeFileSync} from 'node:fs';
import {retailCase} from '../lib/retail-case.ts';
import {buildProfitBaseline} from '../lib/profit-forecast.ts';
const original=JSON.parse(readFileSync('public/data/domestic-retail-september.json','utf8'));
const supplement=JSON.parse(readFileSync('public/data/domestic-operating-supplement.json','utf8'));
const baseline=buildProfitBaseline(retailCase(original,supplement));
writeFileSync('public/data/profit-baseline.json',JSON.stringify(baseline));
console.log(`Profit baseline generated: ${baseline.rowCount} source rows, ${baseline.days} calendar days.`);
