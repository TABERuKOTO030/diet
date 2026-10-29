// nag-push：每天早/中/晚定点催促提醒（diet / ledger）。由 pg_cron 每 5 分钟调用；也支持设备自测 {test:true,token,app}
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { L, TITLE } from './lines.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'mailto:admin@example.com',Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!);
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const J=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,'content-type':'application/json'}});
const hex=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const hnum=(s:string)=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0}return h};
// 按“设备+时段”做固定洗牌，按天数轮换 → 一整轮之内不会重复
function pick(arr:string[],seed:string,day:number){const a=arr.map((_,i)=>i);let x=hnum(seed)||1;for(let i=a.length-1;i>0;i--){x=Math.imul(x^(x>>>15),2246822519)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return arr[a[day%a.length]]}
const local=(tz:string,d=new Date())=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return{date:`${p.year}-${p.month}-${p.day}`,min:+p.hour*60+ +p.minute}};
const toMin=(t:string)=>{const m=/^(\d\d):(\d\d)$/.exec(t||'');return m?+m[1]*60+ +m[2]:-1};
const WIN_START:Record<string,number>={m:4*60,n:10*60+30,e:16*60}; // 这个时段内有过记录 → 换成夸夸
const DEF:any={m:{on:true,t:'08:30'},n:{on:true,t:'12:30'},e:{on:true,t:'19:30'}};
async function send(s:any,payload:any){try{const r=await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload),{TTL:4*3600,urgency:'high'});return r.statusCode}
  catch(e:any){if(e.statusCode===404||e.statusCode===410)await admin.from('nag_subs').delete().eq('id',s.id);return e.statusCode||0}}
function compose(s:any,slot:string,date:string,lt:{date:string,min:number}){
  const day=Math.floor(Date.parse(date+'T00:00:00Z')/864e5);const pool=L[s.app][slot];
  let acted=false;if(s.last_act){const la=local(s.tz,new Date(s.last_act));acted=la.date===lt.date&&la.min>=WIN_START[slot]}
  return{title:TITLE[s.app][slot],body:pick(acted?pool.ok:pool.nag,s.id+slot+(acted?'ok':''),day),tag:'nag-'+slot,app:s.app,acted}}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const body=await req.json().catch(()=>({}));
    if(body.test){ // 设备自测：凭本机令牌
      if(typeof body.token!=='string'||body.token.length<32)return J({error:'bad token'},400);
      const {data:s}=await admin.from('nag_subs').select('*').eq('app',body.app).eq('token_hash',await hex(body.token)).maybeSingle();
      if(!s)return J({sent:0,error:'not subscribed'},404);
      const slot=['m','n','e'].includes(body.slot)?body.slot:['m','n','e'][Math.floor(Math.random()*3)];const lt=local(s.tz);
      const p=compose(s,slot,lt.date,lt);p.body=pick(L[s.app][slot].nag,String(Math.random()),0);p.title+='（测试）';p.tag='nag-test';
      const st=await send(s,p);return J({sent:st>=200&&st<300?1:0,status:st,title:p.title,body:p.body})}
    if(req.headers.get('x-cron-secret')!==Deno.env.get('NAG_CRON_SECRET'))return J({error:'forbidden'},403);
    const {data:subs}=await admin.from('nag_subs').select('*').eq('enabled',true);
    const out:any[]=[];
    for(const s of subs||[]){const lt=local(s.tz);const slots={...DEF,...(s.slots||{})};const ls={...(s.last_sent||{})};let changed=false;
      for(const k of ['m','n','e']){const c=slots[k];const t=toMin(c?.t);if(!c?.on||t<0)continue;
        if(lt.min>=t&&lt.min<t+180&&ls[k]!==lt.date){const p=compose(s,k,lt.date,lt);const st=await send(s,p);ls[k]=lt.date;changed=true;out.push({id:s.id.slice(0,8),app:s.app,slot:k,status:st,acted:p.acted});if(st===404||st===410)break}}
      if(changed)await admin.from('nag_subs').update({last_sent:ls}).eq('id',s.id)}
    console.log('nag results',JSON.stringify(out));return J({checked:(subs||[]).length,sent:out.filter(o=>o.status>=200&&o.status<300).length,results:out});
  }catch(e){return J({error:String(e)},500)}
});
