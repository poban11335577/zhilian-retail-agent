import {useEffect,useRef,useState} from 'react';
import {ArrowDownToLine,ArrowUpRight,BookOpen,CalendarDays,ChevronDown,Database,Layers,Menu,MessageSquare,MessageSquarePlus,PackageSearch,ShieldCheck,TrendingUp,X} from 'lucide-react';
import CaseAssistant from './case-assistant';

export default function AgentHome(){
 const [menu,setMenu]=useState(false),[busy,setBusy]=useState(false),[reset,setReset]=useState(0),[summary,setSummary]=useState<any>(null),[summaryError,setSummaryError]=useState(false);
 const [from,setFrom]=useState(()=>sessionStorage.getItem('zhilian-case-from')??'2026-09-01'),[to,setTo]=useState(()=>sessionStorage.getItem('zhilian-case-to')??'2026-09-30');
 const menuButton=useRef<HTMLButtonElement>(null),sidebarRef=useRef<HTMLElement>(null);
 useEffect(()=>{fetch('/data/case-summary.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(setSummary).catch(()=>setSummaryError(true))},[]);
 useEffect(()=>{sessionStorage.setItem('zhilian-case-from',from);sessionStorage.setItem('zhilian-case-to',to)},[from,to]);
 useEffect(()=>{if(!menu)return;sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();function keys(e:KeyboardEvent){if(e.key==='Escape'){setMenu(false);menuButton.current?.focus()}if(e.key==='Tab'){const nodes=sidebarRef.current?.querySelectorAll<HTMLElement>('a,button');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys)},[menu]);
 function closeMenu(){setMenu(false);menuButton.current?.focus()}
 const [promptRequest]=useState(()=>{const text=new URLSearchParams(location.search).get('prompt')?.slice(0,1800);return text?{text,id:Date.now()}:undefined});
 const scope='?from='+from+'&to='+to;
 return <div className="agent-workspace">
 {menu&&<button className="agent-menu-backdrop" aria-label="关闭导航菜单" onClick={closeMenu}/>}
 <aside id="agent-navigation" className={'agent-sidebar '+(menu?'mobile-open':'')} ref={sidebarRef} aria-label="主导航">
  <div className="agent-brand"><a href="/" aria-label="智链销首页"><span><Layers size={23}/></span><div><b>智链销</b><small>让经营决策有据可依</small></div></a><button className="sidebar-close" aria-label="关闭导航菜单" onClick={closeMenu}><X size={20}/></button></div>
  <button className="agent-new-chat" disabled={busy} onClick={()=>{setReset(reset+1);closeMenu()}}><MessageSquarePlus size={18}/>开启新会话<span>＋</span></button>
  <span className="agent-nav-label">经营工作台</span>
  <nav><a className="selected" href="/" aria-current="page"><MessageSquare size={18}/>经营对话<span>主页</span></a><a href="/growth"><TrendingUp size={18}/>利润预测与目标<ArrowUpRight size={14}/></a><a href={'/scenario'+scope}><PackageSearch size={18}/>备货测算<ArrowUpRight size={14}/></a><a href={'/real-data'+scope}><Database size={18}/>经营数据与报表<ArrowUpRight size={14}/></a></nav>
  <div className="sidebar-case"><div><span className="case-dot"/>当前经营案例</div><b>国内生鲜商超</b><p>采购 · 库存 · 销售 · 财务<br/>同一账套，逐笔可回查</p><a href={'/real-data'+scope}>打开完整台账 <ArrowUpRight size={14}/></a></div>
  <div className="agent-sidebar-bottom"><a href="/data/完整经营流水与对账.xlsx" download><ArrowDownToLine size={17}/>下载完整 Excel</a><a href="/admin"><ShieldCheck size={17}/>管理后台<ArrowUpRight size={14}/></a><span>智链销 · 供销协同经营助手</span></div>
 </aside>
 <div className="agent-main">
  <header className="agent-topbar"><div className="agent-topbar-title"><button ref={menuButton} className="agent-menu-toggle" aria-label="打开导航菜单" aria-expanded={menu} aria-controls="agent-navigation" onClick={()=>setMenu(!menu)}><Menu size={21}/></button><div><b>经营智能体</b><small>有数据依据的经营建议</small></div></div><details className="agent-scope"><summary><CalendarDays size={15}/><span>{from.slice(5).replace('-','/')} — {to.slice(5).replace('-','/')}</span><em>（拟）</em><ChevronDown size={14}/></summary><div><b>分析账期 · 2026年9月（拟）</b><label>开始日期<input type="date" min="2026-09-01" max="2026-09-30" value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label><label>结束日期<input type="date" min="2026-09-01" max="2026-09-30" value={to} disabled={busy} onChange={e=>setTo(e.target.value)}/></label><button disabled={busy} onClick={()=>{setFrom('2026-09-01');setTo('2026-09-30')}}>使用完整月份</button><p>“明天”以所选结束日期为基准；原始销售日期为2022年9月。</p></div></details></header>
  <div className="agent-body"><CaseAssistant from={from} to={to} workspace promptRequest={promptRequest} newConversation={reset} onBusyChange={setBusy}/>
   <aside className="agent-context" aria-label="数据与决策依据"><div className="context-heading"><BookOpen size={17}/><b>决策依据</b><span>可回查</span></div><section><span className="context-kicker">当前案例</span><h2>国内生鲜商超</h2><p>2026年9月 · 人民币（拟）</p><div className="context-stat-grid"><div><strong>{summary?.products??'—'}</strong><small>商品编码</small></div><div><strong>{summary?.sales?.toLocaleString('zh-CN')??'—'}</strong><small>销售明细</small></div></div>{summaryError&&<small>概览暂未加载，可在经营台账查看明细。</small>}<a className="context-link" href={'/real-data'+scope}>查看八类业务明细<ArrowUpRight size={14}/></a></section>
   <section className="context-growth"><span className="context-kicker">利润预测 Skill</span><h2>找到经营增长点</h2><p>历史销售趋势 · 利润贡献拆解 · 目标差距测算（拟）</p><a className="context-link" href="/growth">打开增长与目标工作台<ArrowUpRight size={14}/></a></section><section><span className="context-kicker">怎么得出建议</span><ol className="context-steps"><li><span>01</span><div><b>理解经营目标</b><small>识别商品、时间与预算</small></div></li><li><span>02</span><div><b>查询与计算</b><small>读取账套，核算关键数字</small></div></li><li><span>03</span><div><b>生成与核查</b><small>建议附执行步骤与数据依据</small></div></li></ol><p className="context-tip">每条回答下方可展开实际执行轨迹。采购建议需人工审核。</p></section>
   <section className="context-source"><ShieldCheck size={20}/><b>来源清楚，口径明确</b><p>原始销售来自数学建模竞赛公开数据；日期平移、采购、库存与利润等拟定业务标（拟）。</p><a href="https://www.mcm.edu.cn/html_cn/node/c74d72127066f510a5723a94b5323a26.html" target="_blank" rel="noreferrer">查看官方数据来源<ArrowUpRight size={13}/></a></section>
   <a className="context-export" href="/data/完整经营流水与对账.xlsx" download><ArrowDownToLine size={19}/><div><b>完整经营账套</b><small>八类明细 · 流水 · 财务报表</small></div></a>
   </aside>
  </div>
 </div>
 </div>
}
