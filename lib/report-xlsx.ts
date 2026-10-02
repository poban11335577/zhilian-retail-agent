import {reportTables,type ReportTable,type ReportCell} from './decision-report.ts';
import type {ProfitBaseline} from './profit-forecast.ts';
import type {GoalReport} from './goal-planner.ts';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const col=(n:number):string=>n<26?String.fromCharCode(65+n):col(Math.floor(n/26)-1)+String.fromCharCode(65+n%26);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc32=(data:Uint8Array)=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0};
// The workbook's formatting and structure are authored with Artifact Tool.
// Runtime exports populate its five snapshot tables without a server dependency.
export async function unzipReportTemplate(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
 if(end<0)throw Error('Excel模板格式无效。');
 const entries=new Map<string,Uint8Array>();let pos=view.getUint32(end+16,true),count=view.getUint16(end+10,true);
 if(count>500)throw Error('Excel模板条目异常。');
 for(let i=0;i<count;i++){
  if(view.getUint32(pos,true)!==0x02014b50)throw Error('Excel模板目录无效。');
  const method=view.getUint16(pos+10,true),expectedCrc=view.getUint32(pos+16,true),size=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true),nameSize=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
  const name=decoder.decode(bytes.slice(pos+46,pos+46+nameSize));if(uncompressed>20_000_000||name.includes('..'))throw Error('Excel模板条目异常。');
  const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true),data=bytes.slice(start,start+size);
  const content=method===0?data:method===8?new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()):null;
  if(!content||content.length!==uncompressed||crc32(content)!==expectedCrc)throw Error('Excel模板校验失败。');entries.set(name,content);pos+=46+nameSize+extra+comment;
 }
 return entries;
}
function zip(entries:Map<string,Uint8Array>){
 const pieces:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;
 for(const [name,data] of entries){const n=encoder.encode(name),crc=crc32(data),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);h.set(n,30);pieces.push(h,data);
  const d=new Uint8Array(46+n.length),w=new DataView(d.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);d.set(n,46);directory.push(d);offset+=h.length+data.length;
 }
 const length=directory.reduce((n,d)=>n+d.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.size,true);e.setUint16(10,entries.size,true);e.setUint32(12,length,true);e.setUint32(16,offset,true);pieces.push(...directory,end);
 const result=new Uint8Array(offset+length+end.length);let pos=0;for(const p of pieces){result.set(p,pos);pos+=p.length}return result;
}
function writeCell(value:ReportCell,ref:string,style:string){
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('导出包含无效数值。');return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;}
 if(typeof value==='object')return `<c r="${ref}" s="${style}"><f>${esc(value.formula)}</f><v>${value.value}</v></c>`;
 return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}
function populate(xml:string,t:ReportTable){
 xml=xml.replace(/(<\/?)x:/g,'$1').replace('xmlns:x=','xmlns=');
 const styleAt=(ref:string)=>xml.match(new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*`))?.[0].match(/\bs="(\d+)"/)?.[1];
 const styles=t.headers.map((_,i)=>styleAt(col(i)+'6')??'0');
 const header=xml.match(/<c\b[^>]*r="A5"[^>]*s="(\d+)"/)?.[1]??'0',title=xml.match(/<c\b[^>]*r="A2"[^>]*s="(\d+)"/)?.[1]??'0',note=xml.match(/<c\b[^>]*r="A3"[^>]*s="(\d+)"/)?.[1]??'0';
 const sheetData=`<sheetData><row r="2" ht="28" customHeight="1">${writeCell(t.title,'A2',title)}</row><row r="3" ht="24" customHeight="1">${writeCell(t.context,'A3',note)}</row><row r="5" ht="34" customHeight="1">${t.headers.map((v,i)=>writeCell(v,col(i)+'5',header)).join('')}</row>${t.rows.map((r,i)=>`<row r="${i+6}" ht="${t.name==='数据与口径'?54:24}" customHeight="1">${r.map((v,j)=>writeCell(v,col(j)+(i+6),t.name==='方案总览'?styleAt(col(j)+(i+6))??styles[j]:styles[j])).join('')}</row>`).join('')}</sheetData>`;
 const range='A5:'+col(t.headers.length-1)+(t.rows.length+5);
 return xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/,sheetData).replace(/<dimension[^>]*\/>/,`<dimension ref="A1:${col(t.headers.length-1)}${t.rows.length+5}"/>`).replace(/<autoFilter[^>]*\/>/,`<autoFilter ref="${range}"/>`);
}
export async function decisionWorkbook(template:Uint8Array,b:ProfitBaseline,r:GoalReport,selectedId=r.recommendedId){
 const entries=await unzipReportTemplate(template),tables=reportTables(b,r,selectedId);
 for(let i=0;i<tables.length;i++){const key=`xl/worksheets/sheet${i+1}.xml`,value=entries.get(key);if(!value)throw Error('Excel模板缺少工作表。');entries.set(key,encoder.encode(populate(decoder.decode(value),tables[i])));}
 // Exported formulas have matching cached values; Excel recalculates on open.
 const workbook=decoder.decode(entries.get('xl/workbook.xml')!).replace(/(<\/?)x:/g,'$1').replace('xmlns:x=','xmlns=');
 const calc='<calcPr calcId="191029" fullCalcOnLoad="1"/>';
 entries.set('xl/workbook.xml',encoder.encode(/<calcPr/.test(workbook)?workbook.replace(/<calcPr[^>]*\/>/,calc):workbook.replace('</workbook>',calc+'</workbook>')));
 return zip(entries);
}
