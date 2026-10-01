import {readFileSync} from 'node:fs';
import {retailCase} from '../../../lib/retail-case.ts';
import {buildProfitBaseline,predictProfit,profitScenarios,profitDefaults} from '../../../lib/profit-forecast.ts';
const root=new URL('../../../',import.meta.url);
try{
 const original=JSON.parse(readFileSync(new URL('public/data/domestic-retail-september.json',root),'utf8'));
 const supplement=JSON.parse(readFileSync(new URL('public/data/domestic-operating-supplement.json',root),'utf8'));
 const overrides=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):{};
 const allowed=new Set(Object.keys(profitDefaults));
 if(!overrides||Array.isArray(overrides)||typeof overrides!=='object'||Object.keys(overrides).some(k=>!allowed.has(k)))throw Error('条件文件含未知字段，请按SKILL.md使用输入结构。');
 const baseline=buildProfitBaseline(retailCase(original,supplement)),parameters={...profitDefaults,...overrides};
 console.log(JSON.stringify({baseline,result:predictProfit(baseline,parameters),scenarios:profitScenarios(baseline,parameters)},null,2));
}catch(error){console.error('利润预测未完成：'+error.message);process.exitCode=1;}
