(function(){
'use strict';
const S=window.Store;const $=(s,el=document)=>el.querySelector(s);const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r=Math.round,r1=x=>Math.round(x*10)/10;
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>ymd(new Date());
const addDays=(day,n)=>{const d=new Date(day+'T00:00');d.setDate(d.getDate()+n);return ymd(d)};
const WK='日一二三四五六';
const fmtDay=day=>{const d=new Date(day+'T00:00');return (d.getMonth()+1)+'月'+d.getDate()+'日 周'+WK[d.getDay()]};
const MEALS=[['breakfast','早餐','Breakfast'],['lunch','午餐','Lunch'],['dinner','晚餐','Dinner'],['snack','加餐','Snack']];
const PREFS=[['veg','素食'],['vegan','纯素'],['nospicy','不吃辣'],['lactose','乳糖不耐'],['lowcarb','控碳'],['halal','清真'],['noseafood','不吃海鲜'],['highprotein','高蛋白'],['lowsugar','控糖']];
const ACT=[[1.2,'久坐','办公室、几乎不运动'],[1.375,'轻度','每周运动1–3次'],[1.55,'中度','每周运动3–5次'],[1.725,'高度','每周6–7次或体力工作']];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

let route='home',logDay=today(),tipCat='全部',chat=[],foodCat='全部';

/* ---------- 计算 ---------- */
function latestWeight(){const ws=Object.values(S.db.weights).filter(w=>w.weight).sort((a,b)=>a.day<b.day?-1:1);return ws.length?ws[ws.length-1].weight:(S.db.profile?+S.db.profile.startWeight:60)}
function targets(p){
  p=p||S.db.profile;const w=latestWeight(),h=+p.height,age=Math.max(14,new Date().getFullYear()-(+p.birthYear||1995));
  const sex=p.gender==='male'?5:p.gender==='female'?-161:-78;
  const bmr=10*w+6.25*h-5*age+sex;const tdee=bmr*(+p.activity||1.375);
  const floor=p.gender==='male'?1500:p.gender==='female'?1200:1350;
  const deficit=+p.deficit||500;const kcal=r(Math.max(floor,tdee-deficit)/10)*10;
  const bmi=w/((h/100)**2);const pw=bmi>27?25*(h/100)**2:w;
  const protein=r(pw*((p.prefs||[]).includes('highprotein')?1.8:1.5));
  const fat=r(kcal*((p.prefs||[]).includes('lowcarb')?0.35:0.27)/9);
  const carbs=Math.max(50,r((kcal-protein*4-fat*9)/4));
  return {bmr:r(bmr),tdee:r(tdee),kcal,floor,protein,fat,carbs,weight:w,bmi,water:r(Math.min(3500,Math.max(1500,w*33))/50)*50,clamped:tdee-deficit<floor};
}
function foodById(id){return id&&id[0]==='b'?window.FOODS.find(f=>f.id===id):S.db.foods[id]}
function nutr(f,grams){const k=grams/100;return {kcal:r(f.kcal*k),protein:r1(f.protein*k),fat:r1(f.fat*k),carbs:r1(f.carbs*k)}}
function dayTotals(day){
  const t={kcal:0,protein:0,fat:0,carbs:0,ex:0,water:0,meals:{breakfast:0,lunch:0,dinner:0,snack:0},n:0,late:0};
  for(const l of S.logsOn(day)){const d=l.data;
    if(l.kind==='food'){t.kcal+=d.kcal;t.protein+=d.protein;t.fat+=d.fat;t.carbs+=d.carbs;t.meals[l.meal]=(t.meals[l.meal]||0)+d.kcal;t.n++;if(d.hour>=21||d.hour<4)t.late+=d.kcal}
    else if(l.kind==='exercise')t.ex+=d.kcal;else if(l.kind==='water')t.water+=d.ml}
  t.protein=r1(t.protein);t.fat=r1(t.fat);t.carbs=r1(t.carbs);return t;
}
function streak(){let n=0,d=today();if(!S.logsOn(d).length&&!S.db.weights[d])d=addDays(d,-1);while(S.logsOn(d).length||S.db.weights[d]){n++;d=addDays(d,-1)}return n}
function weightSeries(){return Object.values(S.db.weights).filter(w=>w.weight).sort((a,b)=>a.day<b.day?-1:1)}
function trend(){
  const ws=weightSeries();if(ws.length<2)return {n:ws.length};
  const avg7=day=>{const xs=ws.filter(w=>w.day<=day&&w.day>addDays(day,-7));return xs.length?xs.reduce((s,w)=>s+w.weight,0)/xs.length:null};
  const last=ws[ws.length-1];const rec=ws.filter(w=>w.day>addDays(last.day,-28));
  // 线性回归（kg/天）
  const t0=new Date(rec[0].day).getTime();const xs=rec.map(w=>(new Date(w.day).getTime()-t0)/864e5),ys=rec.map(w=>w.weight);
  const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
  let num=0,den=0;xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2});const slope=den?num/den:0;
  let plateau=0;const a=avg7(last.day);for(const w of ws.slice().reverse()){if(Math.abs(w.weight-a)<=0.4)plateau=(new Date(last.day)-new Date(w.day))/864e5;else break}
  return {n:ws.length,slope,weekly:slope*7,avg7:a,avg7fn:avg7,plateauDays:r(plateau),last};
}
function context(){
  const p=S.db.profile,g=targets(),days=[];for(let i=13;i>=0;i--){const d=addDays(today(),-i);const t=dayTotals(d);days.push({day:d,kcal:t.kcal,protein:t.protein,ex:t.ex,logged:t.n>0})}
  const t=dayTotals(today());return {profile:{name:p.name,gender:p.gender,height:+p.height,targetWeight:+p.targetWeight},prefs:p.prefs||[],targets:g,today:Object.assign(t,{hour:new Date().getHours()}),days,trend:trend(),streak:streak(),weight:latestWeight()};
}
function analyze(t,g){
  const flags=[],tips=[];const pk=t.protein*4,fk=t.fat*9,ck=t.carbs*4,tot=pk+fk+ck||1;const hr=new Date().getHours();
  if(!t.n){return {flags:[{lv:'info',t:'今天还没有饮食记录',d:'记录第一餐后这里会出现分析。'}],tips:[]}}
  const net=t.kcal-t.ex;
  if(net>g.kcal+150)flags.push({lv:'warn',t:'热量超出预算',d:'净摄入比目标多 '+r(net-g.kcal)+' kcal。'}),tips.push('下一餐以蔬菜+瘦蛋白为主，主食减半，不需要饿肚子补偿。');
  else if(hr>=20&&net<g.floor*0.85)flags.push({lv:'warn',t:'今天吃得太少',d:'净摄入仅 '+r(net)+' kcal，低于安全下限 '+g.floor+' kcal。'}),tips.push('过度节食会掉肌肉、加剧饥饿。可以补一杯牛奶/豆浆或一份酸奶。');
  else flags.push({lv:'good',t:'热量在预算内',d:'还可以吃约 '+Math.max(0,r(g.kcal-net))+' kcal。'});
  const pe=t.protein/g.protein;
  if(pe<0.6&&hr>=14)flags.push({lv:'warn',t:'蛋白质偏低',d:'已摄入 '+t.protein+'g，目标 '+g.protein+'g（'+r(pe*100)+'%）。'}),tips.push('加一份高蛋白：鸡蛋2个≈13g、北豆腐150g≈18g、鸡胸100g≈28g、希腊酸奶150g≈14g。');
  else if(pe>=0.9)flags.push({lv:'good',t:'蛋白质达标',d:'有助于减脂期保住肌肉，也更顶饱。'});
  if(fk/tot>0.38&&t.kcal>400)flags.push({lv:'warn',t:'脂肪占比偏高',d:'脂肪供能约 '+r(fk/tot*100)+'%（建议 20–35%）。'}),tips.push('留意烹调油、酱料、坚果和油炸食品，换成蒸、煮、烤会省很多。');
  if(ck/tot>0.65&&t.kcal>400)flags.push({lv:'info',t:'碳水占比较高',d:'碳水供能约 '+r(ck/tot*100)+'%。'}),tips.push('主食可换一半为粗粮/薯类，并先吃菜和蛋白质再吃主食。');
  if(t.late>200)flags.push({lv:'info',t:'夜间进食',d:'21点后摄入约 '+t.late+' kcal。'}),tips.push('夜宵常是额外加出来的热量。可以把加餐提前到下午，晚上饿了选热牛奶或无糖豆浆。');
  if(t.meals.breakfast===0&&hr>=11)flags.push({lv:'info',t:'没有记录早餐',d:'不吃早餐不一定有问题，但要注意午餐是否吃过量。'});
  if(t.meals.dinner>t.kcal*0.5&&t.kcal>600)flags.push({lv:'info',t:'晚餐占比过半',d:'把部分热量挪到早午餐，白天更有精力，晚上也不容易饿。'});
  if(t.water<g.water*0.5&&hr>=16)tips.push('今天喝水偏少，口渴有时会被误认为饥饿。');
  if(!t.ex)tips.push('今天还没运动记录：饭后散步 10–15 分钟能降低餐后血糖峰值。');
  return {flags,tips};
}

/* ---------- 小组件 ---------- */
const deco={
  dots:'<svg class="d-dots" viewBox="0 0 60 8" aria-hidden="true"><circle cx="4" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="32" cy="4" r="2"/><circle cx="46" cy="4" r="2"/></svg>',
  squig:'<svg class="d-squig" viewBox="0 0 60 16" aria-hidden="true"><path d="M2 10c6-8 10 4 16-2s10-6 14 0 10 6 16-2 8-4 10 0"/></svg>',
  dia:'<svg class="d-dia" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0 10 5 5 10 0 5z"/></svg>'
};
function ring(val,max,size,label,sub){
  const R=size/2-12,C=2*Math.PI*R,p=Math.min(1,max?val/max:0),over=val>max;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--mint-d)"/><stop offset="1" stop-color="var(--blue-d)"/></linearGradient></defs>
  <circle cx="${size/2}" cy="${size/2}" r="${R}" class="ring-bg"/>
  <circle cx="${size/2}" cy="${size/2}" r="${R}" class="ring-fg${over?' over':''}" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p)}" style="--c:${C}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>
  <div class="ring-in"><b class="num">${esc(label)}</b><small>${esc(sub)}</small></div></div>`;
}
function bar(v,max,cls){const p=Math.min(100,max?v/max*100:0);return `<div class="bar ${cls||''}"><i style="width:${p}%"></i></div>`}
function bottle(ml,goal){
  const p=Math.min(1,ml/goal);const y=150-p*112;
  return `<div class="bottle" role="img" aria-label="今日饮水 ${ml} 毫升，目标 ${goal} 毫升"><svg viewBox="0 0 100 160">
  <defs><clipPath id="bclip"><path d="M30 34h40v10c10 6 16 14 16 28v70a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V72c0-14 6-22 16-28z"/></clipPath>
  <linearGradient id="milk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9F5EF"/><stop offset="1" stop-color="#BFE0D1"/></linearGradient></defs>
  <path d="M30 34h40v10c10 6 16 14 16 28v70a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V72c0-14 6-22 16-28z" fill="#fff" fill-opacity=".75"/>
  <g clip-path="url(#bclip)"><g class="wave" style="transform:translateY(${y}px)"><path d="M-100 6 q12.5 -8 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 V200 H-100z" fill="url(#milk)"/></g></g>
  <path d="M30 34h40v10c10 6 16 14 16 28v70a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V72c0-14 6-22 16-28z" fill="none" stroke="#C9D8D2" stroke-width="2"/>
  <path d="M27 14h46v20H27z" rx="4" fill="#8E9AA6"/><path d="M27 30q5.75 6 11.5 0t11.5 0 11.5 0 11.5 0v4H27z" fill="#8E9AA6"/>
  <rect x="34" y="96" width="32" height="14" rx="3" fill="#fff" stroke="#DCE6E1"/><text x="50" y="106" text-anchor="middle" font-size="7.5" fill="#8BA79B" font-family="QLatin">MILK</text>
  </svg><div class="bottle-num"><b class="num">${ml}</b><small>/ ${goal} ml</small></div></div>`;
}
function biscuit(inner,cls){return `<div class="bwrap ${cls||''}"><div class="biscuit">${inner}</div></div>`}
function card(inner,cls){return `<section class="card ${cls||''}">${inner}</section>`}
function head(en,zh,extra){return `<div class="sec-h"><span class="en">${en}</span><h2 class="hz">${zh}</h2>${extra||''}</div>`}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}

/* ---------- 视图 ---------- */
const views={};
views.home=()=>{
  const g=targets(),t=dayTotals(today()),net=t.kcal-t.ex,left=g.kcal-net,tip=window.TIPS[(new Date().getDate()+new Date().getMonth()*31)%window.TIPS.length];
  const p=S.db.profile;const st=streak();
  return `<header class="hero">
    <div class="hero-l"><span class="ticket">No.${pad(new Date().getDate())} · A light day</span>
    <h1 class="hz big">${esc(p.name||'你')}的今日</h1><p class="muted">${fmtDay(today())} ${deco.dots}</p></div>
    <div class="sticker" title="连续记录"><span class="num">${st}</span><small>DAYS</small><em>连续记录</em></div></header>
  ${biscuit(`<div class="kcal-row">${ring(Math.max(0,left),g.kcal,168,left>=0?r(left):'+'+r(-left),left>=0?'还可以吃 kcal':'已超出 kcal')}
    <ul class="kcal-list"><li><span class="lg-dot c1"></span>摄入<b class="num">${r(t.kcal)}</b></li><li><span class="lg-dot c2"></span>运动<b class="num">−${r(t.ex)}</b></li><li><span class="lg-dot c3"></span>目标<b class="num">${g.kcal}</b></li></ul></div>
    <div class="macros">${[['蛋白质','protein','p'],['脂肪','fat','f'],['碳水','carbs','c']].map(([n,k,c])=>`<div><div class="m-h"><span>${n}</span><span class="num">${r(t[k])}<small>/${g[k]}g</small></span></div>${bar(t[k],g[k],c)}</div>`).join('')}</div>`,'hero-b')}
  <div class="grid2">
    ${card(`${head('Meals','今日三餐','<a class="link" href="#log">去记录 →</a>')}<div class="meal-mini">${MEALS.map(([k,zh,en])=>`<a href="#log" class="mm"><small class="en">${en}</small><b>${zh}</b><span class="num">${r(t.meals[k]||0)}</span><i>kcal</i></a>`).join('')}</div>`)}
    ${card(`${head('Water','喝水瓶')}<div class="water">${bottle(t.water,g.water)}<div class="water-b"><button class="btn soft" data-water="250">＋250ml<small>一杯</small></button><button class="btn soft" data-water="500">＋500ml<small>一瓶</small></button><button class="btn ghost sm" data-water="-250">撤销一杯</button></div></div>`,'mint')}
  </div>
  ${card(`${head('Today’s tip','今日小知识','<a class="link" href="#tips">全部 →</a>')}<div class="tip-today"><span class="pill">${esc(tip[0])}</span><h3>${esc(tip[1])}</h3><p>${esc(tip[2])}</p></div>`,'cream')}
  <div class="grid2">${card(`${head('Assistant','助手悄悄话','<a class="link" href="#assistant">聊聊 →</a>')}<div id="home-adv" class="adv-mini"><p class="muted">正在整理建议…</p></div>`)}
  ${card(`${head('Body','体重','<a class="link" href="#weight">记录 →</a>')}${weightMini()}`)}</div>`;
};
function weightMini(){const ws=weightSeries(),p=S.db.profile,last=latestWeight(),start=+p.startWeight,tg=+p.targetWeight;
  const prog=start>tg?Math.max(0,Math.min(1,(start-last)/(start-tg))):0;
  return `<div class="wmini"><div><b class="num big2">${last.toFixed(1)}</b><small> kg</small><p class="muted">较开始 <b class="num ${last<=start?'ok':'up'}">${(last-start>0?'+':'')+(last-start).toFixed(1)}</b> kg · 目标 ${tg} kg</p></div>${bar(prog,1,'w')}<p class="muted sm">已完成 ${r(prog*100)}%${ws.length>1?'':' · 每天记录体重可看到趋势'}</p></div>`}

views.log=()=>{
  const t=dayTotals(logDay),g=targets();const logs=S.logsOn(logDay);
  const isToday=logDay===today();
  return `<div class="day-nav"><button class="icon-btn" data-day="-1" aria-label="前一天">‹</button><div><span class="en">${isToday?'Today':'Diary'}</span><h1 class="hz">${fmtDay(logDay)}</h1></div><button class="icon-btn" data-day="1" ${isToday?'disabled':''} aria-label="后一天">›</button></div>
  <div class="sum-strip"><div><small>摄入</small><b class="num">${r(t.kcal)}</b></div><div><small>运动</small><b class="num">${r(t.ex)}</b></div><div><small>净摄入</small><b class="num">${r(t.kcal-t.ex)}</b></div><div><small>目标</small><b class="num">${g.kcal}</b></div></div>
  ${MEALS.map(([k,zh,en],i)=>{const items=logs.filter(l=>l.kind==='food'&&l.meal===k).sort((a,b)=>a.updated_at<b.updated_at?-1:1);
   return biscuit(`<div class="meal-h"><div><span class="en">0${i+1} · ${en}</span><h3 class="hz">${zh}</h3></div><div class="meal-k"><b class="num">${r(t.meals[k]||0)}</b><small>kcal</small></div></div>
   <ul class="items">${items.map(itemRow).join('')||'<li class="empty">还没有记录</li>'}</ul>
   <div class="meal-a"><button class="btn add" data-add="${k}">＋ 添加食物</button><button class="btn ghost sm" data-copy="${k}">复制昨天</button></div>`,'meal')}).join('')}
  ${card(`${head('Exercise','运动记录','<button class="btn add sm" data-addex>＋ 添加运动</button>')}<ul class="items">${logs.filter(l=>l.kind==='exercise').map(l=>`<li><div class="it-n"><b>${esc(l.data.name)}</b><small>${l.data.min} 分钟 · MET ${l.data.met}</small></div><span class="num it-k">−${l.data.kcal}</span><button class="x" data-del="${l.id}" aria-label="删除">×</button></li>`).join('')||'<li class="empty">今天还没有运动，散步也算哦</li>'}</ul>`,'mint')}`;
};
function itemRow(l){const d=l.data;return `<li><div class="it-n"><b>${esc(d.name)}</b><small>${esc(d.qty)} · ${d.grams}g · 蛋白 ${d.protein}g · 脂肪 ${d.fat}g · 碳水 ${d.carbs}g</small></div><span class="num it-k">${d.kcal}</span><button class="x" data-del="${l.id}" aria-label="删除">×</button></li>`}

views.analysis=()=>{
  const g=targets(),t=dayTotals(today()),a=analyze(t,g);const pk=t.protein*4,fk=t.fat*9,ck=t.carbs*4,tot=pk+fk+ck||1;
  const days=[];for(let i=6;i>=0;i--){const d=addDays(today(),-i);days.push(Object.assign({day:d},dayTotals(d)))}
  const logged=days.filter(d=>d.n);const avg=logged.length?logged.reduce((s,d)=>s+d.kcal,0)/logged.length:0;
  const ex=days.reduce((s,d)=>s+d.ex,0);const deficit=logged.reduce((s,d)=>s+(g.tdee-(d.kcal-d.ex)),0);
  const max=Math.max(g.kcal*1.3,...days.map(d=>d.kcal));
  const tr=trend();
  return `<div class="page-h"><span class="en">Analysis · 01</span><h1 class="hz">今日饮食分析</h1></div>
  ${biscuit(`<div class="an-top">${ring(t.kcal-t.ex,g.kcal,150,r(t.kcal-t.ex),'净摄入 / '+g.kcal)}
   <div class="pie-wrap">${pie([[pk,'var(--p)'],[fk,'var(--f)'],[ck,'var(--c)']])}<ul class="legend"><li><span class="lg-dot" style="background:var(--p)"></span>蛋白质 ${r(pk/tot*100)}%</li><li><span class="lg-dot" style="background:var(--f)"></span>脂肪 ${r(fk/tot*100)}%</li><li><span class="lg-dot" style="background:var(--c)"></span>碳水 ${r(ck/tot*100)}%</li></ul></div></div>
   <div class="macros">${[['蛋白质','protein','p'],['脂肪','fat','f'],['碳水','carbs','c']].map(([n,k,c])=>`<div><div class="m-h"><span>${n}</span><span class="num">${r(t[k])}<small>/${g[k]}g</small></span></div>${bar(t[k],g[k],c)}</div>`).join('')}</div>`)}
  ${card(`${head('Meals','三餐分布')}<div class="dist">${MEALS.map(([k,zh])=>{const v=t.meals[k]||0;return `<div class="dist-r"><span>${zh}</span>${bar(v,t.kcal||1,'m')}<b class="num">${t.kcal?r(v/t.kcal*100):0}%</b></div>`}).join('')}</div>`)}
  ${card(`${head('Check','今日检查')}<ul class="flags">${a.flags.map(f=>`<li class="fl ${f.lv}"><i></i><div><b>${esc(f.t)}</b><p>${esc(f.d)}</p></div></li>`).join('')}</ul>${a.tips.length?`<h3 class="sub">建议</h3><ul class="sugg">${a.tips.map(s=>`<li>${deco.dia}<span>${esc(s)}</span></li>`).join('')}</ul>`:''}`,'cream')}
  ${card(`${head('Weekly','本周小结')}<div class="wk-bars">${days.map(d=>`<div class="wb"><div class="wb-c"><i class="${d.kcal>g.kcal+150?'over':''}" style="height:${d.kcal/max*100}%"></i><em style="bottom:${g.kcal/max*100}%"></em></div><small>${WK[new Date(d.day+'T00:00').getDay()]}</small></div>`).join('')}</div>
   <div class="sum-strip"><div><small>日均摄入</small><b class="num">${r(avg)}</b></div><div><small>运动消耗</small><b class="num">${r(ex)}</b></div><div><small>估算缺口</small><b class="num">${r(deficit)}</b></div><div><small>≈脂肪</small><b class="num">${(Math.max(0,deficit)/7700).toFixed(2)}kg</b></div></div>
   <p class="muted sm">记录 ${logged.length}/7 天${tr.n>=2?' · 体重趋势 '+(tr.weekly>0?'+':'')+tr.weekly.toFixed(2)+' kg/周':''}。缺口按 TDEE ${g.tdee} kcal 估算，仅供参考。</p>`,'mint')}
  ${card(`${head('Calendar','打卡日历')}${calendar()}`)}`;
};
function pie(parts){const tot=parts.reduce((s,p)=>s+p[0],0);if(!tot)return '<div class="pie empty"></div>';let a=0;const st=parts.map(([v,c])=>{const s=a;a+=v/tot*360;return `${c} ${s}deg ${a}deg`}).join(',');return `<div class="pie" style="background:conic-gradient(${st})"><span></span></div>`}
function calendar(){const d=new Date();const y=d.getFullYear(),m=d.getMonth();const first=new Date(y,m,1).getDay(),n=new Date(y,m+1,0).getDate();let h='<div class="cal">'+[...WK].map(w=>`<b>${w}</b>`).join('');for(let i=0;i<first;i++)h+='<span></span>';
  for(let i=1;i<=n;i++){const day=y+'-'+pad(m+1)+'-'+pad(i);const has=S.logsOn(day).some(l=>l.kind==='food');const wt=!!S.db.weights[day];h+=`<span class="${has?'on':''} ${day===today()?'td':''}">${i}${wt?'<i></i>':''}</span>`}
  return h+'</div><p class="muted sm cal-l"><span class="lg-dot c1"></span>有饮食记录 <span class="lg-dot c4"></span>记了体重</p>'}

views.weight=()=>{
  const p=S.db.profile,ws=weightSeries(),tr=trend(),last=latestWeight(),h=+p.height/100,bmi=last/(h*h),start=+p.startWeight,tg=+p.targetWeight;
  let eta='记录至少 2 周体重后可估算';
  if(tr.n>=3&&tr.slope<-0.005&&last>tg){const dd=(last-tg)/-tr.slope;if(dd<730){const e=new Date();e.setDate(e.getDate()+dd);eta='按当前趋势约 '+(e.getMonth()+1)+'月'+e.getDate()+'日'+(e.getFullYear()!==new Date().getFullYear()?'（'+e.getFullYear()+'）':'')}}
  else if(last<=tg)eta='已达成目标 🎉';else if(tr.n>=3)eta='当前趋势未下降，暂无法估算';
  const bmiL=bmi<18.5?'偏瘦':bmi<24?'正常':bmi<28?'超重':'肥胖';
  const rec=ws.slice().reverse().slice(0,8);
  return `<div class="page-h"><span class="en">Body · 02</span><h1 class="hz">体重与身体</h1></div>
  ${biscuit(`<form id="wform" class="wform"><label><span>日期</span><input type="date" name="day" value="${today()}" max="${today()}" required></label><label><span>体重 kg</span><input type="number" name="weight" step="0.1" min="20" max="400" inputmode="decimal" value="${last.toFixed(1)}" required></label><label><span>腰围 cm<em>选填</em></span><input type="number" name="waist" step="0.5" min="30" max="250" inputmode="decimal"></label><button class="btn">记录</button></form>`)}
  <div class="stats">
   <div class="stat"><small>当前</small><b class="num">${last.toFixed(1)}</b><i>kg</i></div>
   <div class="stat"><small>7日均值</small><b class="num">${tr.avg7?tr.avg7.toFixed(1):'—'}</b><i>kg</i></div>
   <div class="stat"><small>较开始</small><b class="num">${(last-start>0?'+':'')+(last-start).toFixed(1)}</b><i>kg</i></div>
   <div class="stat"><small>BMI</small><b class="num">${bmi.toFixed(1)}</b><i>${bmiL}</i></div></div>
  ${card(`${head('Trend','体重曲线')}${chart(ws,tr,tg)}<div class="eta"><span class="ticket">ETA</span><span>${esc(eta)}</span></div>${bar(start>tg?(start-last)/(start-tg):0,1,'w')}<p class="muted sm">开始 ${start} kg（${esc(p.startDate||'')}）→ 目标 ${tg} kg</p>`,'cream')}
  ${card(`${head('Records','最近记录')}<ul class="items">${rec.map(w=>`<li><div class="it-n"><b>${fmtDay(w.day)}</b><small>${w.waist?'腰围 '+w.waist+' cm':''}</small></div><span class="num it-k">${(+w.weight).toFixed(1)} kg</span><button class="x" data-delw="${w.day}" aria-label="删除">×</button></li>`).join('')||'<li class="empty">还没有体重记录</li>'}</ul>`)}`;
};
function chart(ws,tr,tg){
  if(ws.length<2)return '<div class="chart-empty muted">记录 2 天以上体重后显示曲线</div>';
  const pts=ws.slice(-60);const narrow=innerWidth<600;const W=narrow?360:640,H=narrow?230:240,pl=36,pr=12,pt=14,pb=26;
  const t0=new Date(pts[0].day).getTime(),t1=new Date(pts[pts.length-1].day).getTime()||t0+1;
  const vals=pts.map(p=>p.weight).concat([tg]);let mn=Math.min(...vals)-0.5,mx=Math.max(...vals)+0.5;
  const X=d=>pl+(new Date(d).getTime()-t0)/((t1-t0)||1)*(W-pl-pr),Y=v=>pt+(mx-v)/(mx-mn)*(H-pt-pb);
  const line=pts.map((p,i)=>(i?'L':'M')+X(p.day).toFixed(1)+' '+Y(p.weight).toFixed(1)).join(' ');
  const ma=pts.map(p=>[p.day,tr.avg7fn(p.day)]).map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' ');
  const area=line+` L${X(pts[pts.length-1].day).toFixed(1)} ${H-pb} L${pl} ${H-pb}Z`;
  const ticks=[];for(let i=0;i<4;i++){const v=mn+(mx-mn)*i/3;ticks.push(`<line x1="${pl}" x2="${W-pr}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${pl-6}" y="${Y(v)+4}" text-anchor="end">${v.toFixed(1)}</text>`)}
  const lab=[pts[0],pts[Math.floor(pts.length/2)],pts[pts.length-1]].map(p=>`<text x="${X(p.day)}" y="${H-6}" text-anchor="middle">${+p.day.slice(5,7)}/${+p.day.slice(8)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="体重曲线"><defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mint-d)" stop-opacity=".35"/><stop offset="1" stop-color="var(--mint-d)" stop-opacity="0"/></linearGradient></defs>
  ${ticks.join('')}<line x1="${pl}" x2="${W-pr}" y1="${Y(tg)}" y2="${Y(tg)}" class="tg"/><text x="${W-pr}" y="${Y(tg)-5}" text-anchor="end" class="tgt">目标 ${tg}</text>
  <path d="${area}" fill="url(#ar)"/><path d="${line}" class="ln"/><path d="${ma}" class="ma"/>
  ${pts.map(p=>`<circle cx="${X(p.day).toFixed(1)}" cy="${Y(p.weight).toFixed(1)}" r="3.2" class="pt"/>`).join('')}${lab}</svg>
  <p class="legend-l muted sm"><span class="lg-line a"></span>每日体重 <span class="lg-line b"></span>7日平均</p>`;
}

views.assistant=()=>`<div class="page-h"><span class="en">Assistant · 03</span><h1 class="hz">AI 助手</h1><p class="muted sm">内置规则版 · 根据记录给建议，不替代医生或营养师</p></div>
  ${biscuit(`<div class="as-h"><div class="as-ava" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="17" fill="#fff"/><circle cx="18" cy="25" r="2" fill="#8A7A70"/><circle cx="30" cy="25" r="2" fill="#8A7A70"/><path d="M20 31q4 3 8 0" stroke="#8A7A70" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="14" cy="30" r="2.5" fill="#F4CFCF"/><circle cx="34" cy="30" r="2.5" fill="#F4CFCF"/><path d="M14 12q10-8 20 0" stroke="#B9DCCB" stroke-width="3" fill="none" stroke-linecap="round"/></svg></div><div><b class="hz">小奶瓶</b><p class="muted sm">今天的整体建议</p></div></div><div id="adv" class="adv"><p class="muted">正在分析…</p></div>`)}
  ${card(`${head('Ask','问问我')}<div class="quick">${window.Assistant.QUICK.map(q=>`<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div><div id="chat" class="chat" aria-live="polite">${chat.map(m=>`<div class="msg ${m.me?'me':''}">${esc(m.t).replace(/\n/g,'<br>')}</div>`).join('')}</div>`,'mint')}`;

views.tips=()=>{const list=window.TIPS.filter(t=>tipCat==='全部'||t[0]===tipCat);
  return `<div class="page-h"><span class="en">Tips · ${window.TIPS.length}</span><h1 class="hz">减肥小 Tips</h1><p class="muted sm">基于研究共识整理，不讲“多喝水少吃多动”</p></div>
  <div class="pills" role="tablist">${window.TIP_CATS.map(c=>`<button class="pill-b ${c===tipCat?'on':''}" data-tc="${c}">${c}</button>`).join('')}</div>
  <div class="tips">${list.map((t,i)=>`<article class="tip"><div class="tip-h"><span class="pill">${esc(t[0])}</span><span class="num tip-n">${pad(window.TIPS.indexOf(t)+1)}</span></div><h3>${esc(t[1])}</h3><p>${esc(t[2])}</p></article>`).join('')}</div>`};

views.me=()=>profileForm(false);
function profileForm(first){
  const p=S.db.profile||{gender:'female',activity:1.375,deficit:500,prefs:[],startDate:today()};
  const g=S.db.profile?targets():null;
  return `<div class="page-h"><span class="en">${first?'Welcome':'Profile · 04'}</span><h1 class="hz">${first?'先认识一下你':'我的资料'}</h1>${first?'<p class="muted sm">填写后会自动计算每日热量与营养目标</p>':''}</div>
  <form id="pform" class="pform">
  ${card(`${head('Basic','基本信息')}<div class="fgrid">
   <label class="full"><span>昵称</span><input name="name" maxlength="20" value="${esc(p.name||'')}" placeholder="怎么称呼你"></label>
   <fieldset class="full seg"><legend>性别</legend>${[['female','女'],['male','男'],['other','其他']].map(([v,n])=>`<label><input type="radio" name="gender" value="${v}" ${p.gender===v?'checked':''}><span>${n}</span></label>`).join('')}</fieldset>
   <label><span>出生年份</span><input name="birthYear" type="number" min="1930" max="${new Date().getFullYear()-12}" value="${esc(p.birthYear||'')}" required inputmode="numeric"></label>
   <label><span>身高 cm</span><input name="height" type="number" min="120" max="230" step="0.5" value="${esc(p.height||'')}" required inputmode="decimal"></label>
   <label><span>开始体重 kg</span><input name="startWeight" type="number" min="30" max="300" step="0.1" value="${esc(p.startWeight||'')}" required inputmode="decimal"></label>
   <label><span>开始日期</span><input name="startDate" type="date" value="${esc(p.startDate||today())}" max="${today()}" required></label>
   <label><span>目标体重 kg</span><input name="targetWeight" type="number" min="30" max="300" step="0.1" value="${esc(p.targetWeight||'')}" required inputmode="decimal"></label>
   <label><span>每日热量缺口</span><select name="deficit">${[[300,'温和 300'],[500,'标准 500（推荐）'],[700,'积极 700']].map(([v,n])=>`<option value="${v}" ${+p.deficit===v?'selected':''}>${n} kcal</option>`).join('')}</select></label>
  </div>`)}
  ${card(`${head('Activity','日常活动量')}<div class="acts">${ACT.map(([v,n,d])=>`<label class="act"><input type="radio" name="activity" value="${v}" ${+p.activity===v?'checked':''}><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</div>`,'mint')}
  ${card(`${head('Preference','饮食偏好')}<div class="chips">${PREFS.map(([v,n])=>`<label class="chk"><input type="checkbox" name="prefs" value="${v}" ${(p.prefs||[]).includes(v)?'checked':''}><span>${n}</span></label>`).join('')}</div>
   <label class="full"><span>过敏 / 忌口</span><input name="allergy" maxlength="80" value="${esc(p.allergy||'')}" placeholder="例如：花生、虾"></label>`,'cream')}
  ${g?card(`${head('Targets','你的目标')}<div class="stats"><div class="stat"><small>基础代谢</small><b class="num">${g.bmr}</b><i>kcal</i></div><div class="stat"><small>TDEE</small><b class="num">${g.tdee}</b><i>kcal</i></div><div class="stat"><small>每日目标</small><b class="num">${g.kcal}</b><i>kcal</i></div><div class="stat"><small>蛋白质</small><b class="num">${g.protein}</b><i>g</i></div></div><p class="muted sm">Mifflin-St Jeor 公式估算。脂肪 ${g.fat}g · 碳水 ${g.carbs}g · 饮水 ${g.water}ml。${g.clamped?'已按安全下限 '+g.floor+' kcal 设定。':''}</p>`):''}
  <div class="form-a"><button class="btn big">${first?'开始记录':'保存资料'}</button></div></form>
  ${first?'':card(`${head('Account','账号与数据')}<p class="muted sm">${S.DEMO?'演示模式：数据只保存在本浏览器。':'云端同步状态：<b id="sync-s">'+syncLabel()+'</b>'}</p><div class="meal-a"><button class="btn ghost sm" data-export>导出数据</button>${S.DEMO?'':'<button class="btn ghost sm" data-sync>立即同步</button><button class="btn ghost sm" data-logout>退出登录</button>'}</div>
   <h3 class="sub">我的自定义食物</h3><ul class="items">${Object.values(S.db.foods).map(f=>`<li><div class="it-n"><b>${esc(f.name)}</b><small>${f.kcal} kcal/100g · ${esc(f.unit)} ${f.unitG}g</small></div><button class="x" data-delf="${esc(f.id)}" aria-label="删除">×</button></li>`).join('')||'<li class="empty">在添加食物时可以新建</li>'}</ul>`)}`;
}
function syncLabel(){return {demo:'演示',idle:'待同步',syncing:'同步中…',synced:'已同步',error:'同步失败，稍后重试',offline:'离线（恢复网络后自动同步）'}[S.status]+(S.pending?' · '+S.pending+' 条待上传':'')}

/* ---------- 弹层：添加食物 / 运动 ---------- */
function sheet(html){const m=$('#sheet');m.innerHTML=`<div class="sheet-bg" data-close></div><div class="sheet-p" role="dialog" aria-modal="true">${html}</div>`;m.hidden=false;requestAnimationFrame(()=>m.classList.add('open'));const f=$('input',m);if(f&&matchMedia('(min-width:900px)').matches)f.focus()}
function closeSheet(){const m=$('#sheet');m.classList.remove('open');setTimeout(()=>{m.hidden=true;m.innerHTML=''},reduce?0:250)}
function recentFoods(){const seen=new Set(),out=[];Object.values(S.db.logs).filter(l=>l.kind==='food').sort((a,b)=>a.updated_at<b.updated_at?1:-1).forEach(l=>{if(!seen.has(l.data.fid)){seen.add(l.data.fid);const f=foodById(l.data.fid);if(f)out.push(f)}});return out.slice(0,12)}
function openFood(meal){
  sheet(`<div class="sh-h"><h2 class="hz">添加到${MEALS.find(m=>m[0]===meal)[1]}</h2><button class="x" data-close aria-label="关闭">×</button></div>
  <input id="fq" class="search" type="search" placeholder="搜索：米饭、鸡胸肉、拿铁、饭团…" autocomplete="off">
  <div class="pills sm">${['常用',...window.FOOD_CATS].map(c=>`<button class="pill-b ${c==='常用'?'on':''}" data-fc="${c}">${c}</button>`).join('')}</div>
  <ul id="flist" class="flist"></ul><p class="muted sm ref">数值为参考值（中国食物成分表 / 日本食品成分表 / USDA），实际随做法和品牌而异。</p>
  <button class="btn ghost sm" data-newfood>＋ 新建自定义食物</button><div id="fpick"></div>`);
  const sh=$('#sheet');sh.dataset.meal=meal;let cat='常用';
  const draw=()=>{const q=$('#fq').value.trim().toLowerCase();let list;
    const all=window.FOODS.concat(Object.values(S.db.foods));
    if(q){const n=f=>f.name.toLowerCase();const ex=all.filter(f=>n(f).includes(q));const fz=all.filter(f=>!n(f).includes(q)&&[...q.replace(/\s/g,'')].every(c=>n(f).includes(c)));list=ex.concat(fz)}
    else if(cat==='常用'){const fav=S.db.fav.map(foodById).filter(Boolean);const rec=recentFoods().filter(f=>!S.db.fav.includes(f.id));list=fav.concat(rec);if(!list.length)list=window.FOODS.slice(0,12)}
    else if(cat==='全部')list=all;else list=all.filter(f=>f.cat===cat);
    $('#flist').innerHTML=list.slice(0,80).map(f=>`<li><button class="fi" data-fid="${esc(f.id)}"><span><b>${esc(f.name)}</b><small>${esc(f.unit)}(${f.unitG}g) ≈ ${r(f.kcal*f.unitG/100)} kcal</small></span><em class="num">${f.kcal}<small>/100g</small></em></button><button class="star ${S.db.fav.includes(f.id)?'on':''}" data-fav="${esc(f.id)}" aria-label="收藏">★</button></li>`).join('')||'<li class="empty">没找到，可以新建自定义食物</li>'};
  draw();$('#fq').addEventListener('input',draw);
  sh.addEventListener('click',e=>{const b=e.target.closest('[data-fc]');if(b){cat=b.dataset.fc;$$('[data-fc]',sh).forEach(x=>x.classList.toggle('on',x===b));draw()}
    const fv=e.target.closest('[data-fav]');if(fv){S.toggleFav(fv.dataset.fav);fv.classList.toggle('on');}
    const fi=e.target.closest('[data-fid]');if(fi)pickFood(foodById(fi.dataset.fid),meal);
    if(e.target.closest('[data-newfood]'))newFood(meal);});
}
function pickFood(f,meal){
  const box=$('#fpick');box.innerHTML=`<div class="pick"><div class="pick-h"><b>${esc(f.name)}</b><span class="muted sm">${f.kcal} kcal / 100g</span></div>
  <div class="pick-r"><div class="step"><button type="button" data-st="-1" aria-label="减少">−</button><input id="pq" type="number" value="1" min="0.1" step="0.5" inputmode="decimal" aria-label="数量"><button type="button" data-st="1" aria-label="增加">＋</button></div>
  <select id="pu" aria-label="单位"><option value="u">${esc(f.unit)}（${f.unitG}g）</option><option value="g">克 g</option></select></div>
  <div id="pn" class="pn"></div><button class="btn big" id="padd">加入</button></div>`;
  box.classList.add('show');
  const q=$('#pq'),u=$('#pu');
  const calc=()=>{const qty=+q.value||0;const grams=u.value==='u'?qty*f.unitG:qty;const n=nutr(f,grams);$('#pn').innerHTML=`<span><b class="num">${n.kcal}</b>kcal</span><span>蛋白 <b class="num">${n.protein}</b>g</span><span>脂肪 <b class="num">${n.fat}</b>g</span><span>碳水 <b class="num">${n.carbs}</b>g</span>`;return {grams:r(grams),n,qty}};
  calc();q.oninput=calc;u.onchange=()=>{q.value=u.value==='u'?1:f.unitG;q.step=u.value==='u'?0.5:10;calc()};
  $$('[data-st]',box).forEach(b=>b.onclick=()=>{const s=u.value==='u'?0.5:10;q.value=Math.max(s,r1((+q.value||0)+s*+b.dataset.st));calc()});
  $('#padd').onclick=()=>{const c=calc();if(c.grams<=0)return;S.addLog(logDay,'food',meal,Object.assign({fid:f.id,name:f.name,grams:c.grams,qty:u.value==='u'?c.qty+' '+f.unit:c.grams+'g',hour:logDay===today()?new Date().getHours():12},c.n));toast('已加入 '+f.name+' · '+c.n.kcal+' kcal');closeSheet();render()};
  box.scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'});
}
function newFood(meal){
  $('#fpick').innerHTML=`<form id="nf" class="pick"><b>新建自定义食物（每100g）</b><div class="fgrid"><label class="full"><span>名称</span><input name="name" required maxlength="30"></label>
  ${[['kcal','热量 kcal'],['protein','蛋白质 g'],['fat','脂肪 g'],['carbs','碳水 g']].map(([k,n])=>`<label><span>${n}</span><input name="${k}" type="number" min="0" max="900" step="0.1" required inputmode="decimal"></label>`).join('')}
  <label><span>常用单位</span><input name="unit" value="一份" maxlength="8" required></label><label><span>单位重量 g</span><input name="unitG" type="number" value="100" min="1" max="2000" required></label></div><button class="btn big">保存并选择</button></form>`;
  $('#nf').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const f=S.addFood({name:d.name.trim(),kcal:+d.kcal,protein:+d.protein,fat:+d.fat,carbs:+d.carbs,unit:d.unit.trim(),unitG:+d.unitG});pickFood(f,meal)};
}
function openEx(){
  const w=latestWeight();
  sheet(`<div class="sh-h"><h2 class="hz">添加运动</h2><button class="x" data-close aria-label="关闭">×</button></div>
  <div class="exs">${window.EXERCISES.map(x=>`<button class="ex" data-ex="${x.id}"><b>${esc(x.name)}</b><small>MET ${x.met}</small></button>`).join('')}</div>
  <div id="expick"></div><p class="muted sm ref">消耗 = MET × 体重(${w}kg) × 小时，MET 参考《Compendium of Physical Activities》。</p>`);
  $('#sheet').addEventListener('click',e=>{const b=e.target.closest('[data-ex]');if(!b)return;$$('.ex').forEach(x=>x.classList.toggle('on',x===b));const x=window.EXERCISES.find(z=>z.id===b.dataset.ex);
    const box=$('#expick');box.innerHTML=`<div class="pick"><div class="pick-h"><b>${esc(x.name)}</b></div><div class="pick-r"><div class="step"><button type="button" data-m="-5">−</button><input id="exm" type="number" value="30" min="1" max="600" inputmode="numeric" aria-label="分钟"><button type="button" data-m="5">＋</button></div><span>分钟</span></div><div class="pn" id="exn"></div><button class="btn big" id="exadd">加入</button></div>`;
    const m=$('#exm');const calc=()=>{const k=r(x.met*w*(+m.value||0)/60);$('#exn').innerHTML=`<span>约 <b class="num">${k}</b> kcal</span>`;return k};calc();m.oninput=calc;
    $$('[data-m]',box).forEach(bb=>bb.onclick=()=>{m.value=Math.max(5,(+m.value||0)+ +bb.dataset.m);calc()});
    $('#exadd').onclick=()=>{const k=calc();S.addLog(logDay,'exercise','',{name:x.name,met:x.met,min:+m.value,kcal:k});toast('已记录 '+x.name+' · −'+k+' kcal');closeSheet();render()};
    box.scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'})});
}

/* ---------- 路由与渲染 ---------- */
const NAV=[['home','今日','M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z'],['log','记录','M7 4h10a2 2 0 0 1 2 2v13l-3-2-2 2-2-2-2 2-2-2-3 2V6a2 2 0 0 1 2-2zM9 9h6M9 13h4'],['analysis','分析','M5 19V11M10 19V6M15 19v-5M20 19V9'],['weight','体重','M5 7h14l-1.5 11a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2zM9 11l3 2 3-3'],['assistant','助手','M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 11.5h.01M12 11.5h.01M15 11.5h.01'],['tips','Tips','M12 3a6 6 0 0 1 3.5 10.9V17h-7v-3.1A6 6 0 0 1 12 3zM9.5 20.5h5'],['me','我的','M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0']];
const ico=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
function shell(){
  $('#app').innerHTML=`<aside class="side"><div class="brand"><span class="brand-m">轻盈日记</span><small class="en">SOFT DAYS · ${S.DEMO?'demo':'diary'}</small></div><nav>${NAV.map(([k,n,d])=>`<a href="#${k}" data-r="${k}">${ico(d)}<span>${n}</span></a>`).join('')}</nav><div class="side-f">${deco.squig}<p>Perfect for<br>a lighter day.</p></div></aside>
  <div class="main"><div class="topbar"><span class="brand-m">轻盈日记</span><div><a href="#tips" class="icon-btn" aria-label="Tips">${ico(NAV[5][2])}</a><a href="#me" class="icon-btn" aria-label="我的">${ico(NAV[6][2])}</a></div></div>${S.DEMO?'<div class="demo-b">演示模式 · 数据只保存在本浏览器</div>':''}<main id="view" tabindex="-1"></main></div>
  <nav class="tabbar">${NAV.slice(0,5).map(([k,n,d])=>`<a href="#${k}" data-r="${k}">${ico(d)}<span>${n}</span></a>`).join('')}</nav>`;
}
function render(){
  if(!S.db.profile){$('#view').innerHTML=profileForm(true);bindView();return}
  const v=views[route]?route:'home';
  $$('[data-r]').forEach(a=>a.classList.toggle('on',a.dataset.r===v));
  const el=$('#view');el.innerHTML=views[v]();el.classList.remove('enter');void el.offsetWidth;el.classList.add('enter');
  bindView();
  if(v==='assistant'||v==='home')loadAdvice(v);
}
async function loadAdvice(v){
  const items=await window.Assistant.getAdvice(context());const el=$(v==='home'?'#home-adv':'#adv');if(!el)return;
  const list=v==='home'?items.slice(0,2):items;
  el.innerHTML=list.map((a,i)=>`<div class="adv-i ${esc(a.tone)}" style="--i:${i}"><b>${esc(a.title)}</b><p>${esc(a.text)}</p></div>`).join('');
}
function bindView(){
  const pf=$('#pform');if(pf)pf.onsubmit=e=>{e.preventDefault();const fd=new FormData(pf);const p=Object.assign({},S.db.profile||{});
    ['name','birthYear','height','startWeight','startDate','targetWeight','deficit','activity','allergy','gender'].forEach(k=>p[k]=String(fd.get(k)||'').trim());
    p.prefs=fd.getAll('prefs');const first=!S.db.profile;S.setProfile(p);
    if(first&&!S.db.weights[p.startDate])S.setWeight(p.startDate,+p.startWeight,null);
    toast(first?'欢迎！目标已计算好':'资料已保存');if(first)location.hash='#home';render()};
  const wf=$('#wform');if(wf)wf.onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(wf));S.setWeight(d.day,+d.weight,d.waist?+d.waist:null);toast('已记录 '+(+d.weight).toFixed(1)+' kg');render()};
}
document.addEventListener('click',e=>{
  const t=e.target;let b;
  if(t.closest('[data-close]'))return closeSheet();
  if((b=t.closest('[data-water]'))){const ml=+b.dataset.water;if(ml<0){const w=S.logsOn(today()).filter(l=>l.kind==='water').sort((a,b)=>a.updated_at<b.updated_at?1:-1)[0];if(w)S.delLog(w.id)}else S.addLog(today(),'water','',{ml});render();return}
  if((b=t.closest('[data-day]'))){logDay=addDays(logDay,+b.dataset.day);if(logDay>today())logDay=today();render();return}
  if((b=t.closest('[data-add]')))return openFood(b.dataset.add);
  if(t.closest('[data-addex]'))return openEx();
  if((b=t.closest('[data-del]'))){S.delLog(b.dataset.del);render();return}
  if((b=t.closest('[data-delw]'))){S.delWeight(b.dataset.delw);render();return}
  if((b=t.closest('[data-delf]'))){S.delFood(b.dataset.delf);render();return}
  if((b=t.closest('[data-copy]'))){const m=b.dataset.copy;const src=S.logsOn(addDays(logDay,-1)).filter(l=>l.kind==='food'&&l.meal===m);if(!src.length)return toast('前一天的这一餐没有记录');src.forEach(l=>S.addLog(logDay,'food',m,Object.assign({},l.data)));toast('已复制 '+src.length+' 项');render();return}
  if((b=t.closest('[data-tc]'))){tipCat=b.dataset.tc;render();return}
  if((b=t.closest('[data-q]'))){const q=b.dataset.q;chat.push({me:1,t:q});window.Assistant.ask(q,context()).then(a=>{chat.push({t:a});chat=chat.slice(-20);const c=$('#chat');if(c){c.innerHTML=chat.map(m=>`<div class="msg ${m.me?'me':''}">${esc(m.t).replace(/\n/g,'<br>')}</div>`).join('');c.lastElementChild.scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'})}});return}
  if(t.closest('[data-export]')){const blob=new Blob([S.exportJSON()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='diet-'+today()+'.json';a.click();return}
  if(t.closest('[data-sync]')){S.sync();return}
  if(t.closest('[data-logout]')){S.signOut().then(()=>location.reload());return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sheet').hidden)closeSheet()});
document.addEventListener('syncstatus',()=>{const s=$('#sync-s');if(s)s.textContent=syncLabel()});
window.addEventListener('hashchange',()=>{route=(location.hash.slice(1)||'home');if(route==='log'&&logDay>today())logDay=today();render();if(!reduce)scrollTo({top:0})});
S.on(()=>{});

/* ---------- 登录 ---------- */
function authView(){
  $('#app').innerHTML=`<div class="auth">${biscuit(`<span class="ticket">Since today · 01</span><h1 class="hz big">轻盈日记</h1><p class="muted">记录三餐、运动与体重 · 云端同步</p>${deco.dots}
  <form id="af" class="fgrid"><label class="full"><span>邮箱</span><input name="email" type="email" required autocomplete="email"></label><label class="full"><span>密码（至少 6 位）</span><input name="password" type="password" minlength="6" required autocomplete="current-password"></label>
  <p id="aerr" class="err full" role="alert"></p><button class="btn big full" name="in">登录</button><button class="btn ghost full" name="up" type="button">注册新账号</button></form>`)}<p class="muted sm center">只想看看？<a href="?demo=1">进入演示模式</a></p></div>`;
  const f=$('#af');const go=async up=>{const d=Object.fromEntries(new FormData(f));if(!f.reportValidity())return;$('#aerr').textContent='';f.classList.add('busy');
    try{await (up?S.signUp(d.email,d.password):S.signIn(d.email,d.password));start()}catch(err){$('#aerr').textContent=/Invalid login/.test(err.message)?'邮箱或密码不正确':/already registered/.test(err.message)?'这个邮箱已注册，请直接登录':'出错了：'+err.message}finally{f.classList.remove('busy')}};
  f.onsubmit=e=>{e.preventDefault();go(false)};f.up.onclick=()=>go(true);
}
function start(){route=location.hash.slice(1)||'home';shell();render();S.on(()=>{if($('#sheet').hidden&&document.activeElement.tagName!=='INPUT')render()})}
(async()=>{const s=await S.init().catch(()=>null);if(s)start();else authView()})();
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__app={targets,dayTotals,trend,context};
})();
