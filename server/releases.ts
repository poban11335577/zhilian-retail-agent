import {createHash} from 'node:crypto';
import {defaults,type AgentConfig} from '../lib/agents.ts';
import type {Repository} from './api.ts';
export async function drafts(repo:Repository){return Promise.all(defaults.map(async d=>({...d,...(await repo.get('agents/'+d.id))?.value})))}
export const fingerprint=(agents:any[])=>createHash('sha256').update(JSON.stringify(agents)).digest('hex');
export async function releaseState(repo:Repository){
 let row=await repo.get('settings/releases');
 if(!row){const agents=await drafts(repo);await repo.put('settings/releases',{revision:1,current:{version:1,agents,hash:fingerprint(agents),at:new Date().toISOString(),note:'初始发布'},history:[]},null);row=await repo.get('settings/releases')}
 return row!;
}
export async function publishedAgents(repo:Repository):Promise<AgentConfig[]>{return (await releaseState(repo)).value.current.agents}
export async function releaseInfo(repo:Repository){const row=await releaseState(repo),agents=await drafts(repo),hash=fingerprint(agents),test=await repo.get('tests/draft/'+hash);return {revision:row.value.revision,current:row.value.current,history:row.value.history,draftHash:hash,changed:hash!==row.value.current.hash,test:test?.value??null}}
export async function publishAgents(repo:Repository,revision:number,hash:string,rollback?:number){
 const row=await releaseState(repo);if(row.value.revision!==revision)throw Error('发布状态已更新，请刷新');
 const agents=rollback?row.value.history.find((r:any)=>r.version===rollback)?.agents:await drafts(repo);if(!agents)throw Error('历史版本不存在');
 if(!rollback&&(fingerprint(agents)!==hash||!(await repo.get('tests/draft/'+hash))))throw Error('请先用当前已保存草稿完成一次试运行，再发布');
 const current={version:row.value.current.version+1,agents,hash:fingerprint(agents),at:new Date().toISOString(),note:rollback?'回退自 v'+rollback:'草稿发布'};
 if(!await repo.put('settings/releases',{revision:revision+1,current,history:[row.value.current,...row.value.history].slice(0,20)},row.version))throw Error('发布冲突，请刷新');
 return releaseInfo(repo);
}
