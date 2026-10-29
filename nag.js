// 定点催促提醒（Web Push）。服务器只保存：推送地址、提醒时间、开关、最后一次记录的时间（用于“已经记过就换成夸夸”）。不上传任何记录内容。
(function(){
const SB='https://wtkvkklhbjoiitfvkkne.supabase.co',KEY='sb_publishable_KCt29Ha_kR56HNlxCDjfpw_TQolXAKU',VAPID='BD0CbHgeOFCe4WhnMYL0zu2KJSji_wuASwKtIhjfJzT0yPk6IjLYi8_oFqMJBF8vkd9zIvCTiOITGN9pNCYzJO4';
const SL=[['m','早上','08:30'],['n','中午','12:30'],['e','晚上','19:30']];
function mk(app){
 const TK='nag-token-'+app,CK='nag-cfg-'+app;
 const tok=()=>{let t=localStorage.getItem(TK);if(!t){const a=crypto.getRandomValues(new Uint8Array(32));t=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(TK,t)}return t};
 const def=()=>({enabled:false,slots:Object.fromEntries(SL.map(([k,,t])=>[k,{on:true,t}]))});
 let cfg;try{cfg=Object.assign(def(),JSON.parse(localStorage.getItem(CK)||'{}'))}catch(e){cfg=def()}
 const saveCfg=()=>localStorage.setItem(CK,JSON.stringify(cfg));
 const rpc=(fn,args)=>fetch(SB+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify(args)}).then(async r=>{if(!r.ok)throw new Error(fn+' '+r.status+' '+(await r.text()).slice(0,120));return r.status===204?null:r.json()});
 const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 const tz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Asia/Tokyo'}catch(e){return 'Asia/Tokyo'}};
 const u8=b=>{const p='='.repeat((4-b.length%4)%4),s=atob((b+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))};
 async function getSub(create){const reg=await navigator.serviceWorker.ready;let s=await reg.pushManager.getSubscription();if(!s&&create)s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(VAPID)});return s}
 async function upload(s){const j=s.toJSON();await rpc('nag_upsert',{p_token:tok(),p_app:app,p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_tz:tz(),p_enabled:cfg.enabled,p_slots:cfg.slots});cfg.synced=true;saveCfg()}
 const api={cfg,
  status(){return{supported:supported(),perm:'Notification' in window?Notification.permission:'unsupported',ios,standalone}},
  async enable(){if(!supported())throw new Error(ios&&!standalone?'请先把 app 添加到主屏幕，再从主屏幕图标打开':'这个浏览器不支持推送通知');
   const p=await Notification.requestPermission();if(p!=='granted')throw new Error('没有获得通知权限（可以在系统设置里打开）');
   cfg.enabled=true;saveCfg();await upload(await getSub(true))},
  async disable(){cfg.enabled=false;saveCfg();if(cfg.synced)await rpc('nag_set',{p_token:tok(),p_app:app,p_enabled:false,p_slots:cfg.slots})},
  async setSlots(){saveCfg();if(cfg.synced)await rpc('nag_set',{p_token:tok(),p_app:app,p_enabled:cfg.enabled,p_slots:cfg.slots})},
  async test(slot){if(!cfg.synced)throw new Error('请先打开提醒');const r=await fetch(SB+'/functions/v1/nag-push',{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({test:true,token:tok(),app,slot})});const j=await r.json();if(!j.sent)throw new Error('发送失败（'+(j.status||j.error||r.status)+'）');return j},
  touch(){if(!cfg.enabled||!cfg.synced)return;clearTimeout(api._t);api._t=setTimeout(()=>rpc('nag_touch',{p_token:tok(),p_app:app}).catch(()=>{}),1500)},
  async sync(){try{if(cfg.enabled&&supported()&&Notification.permission==='granted')await upload(await getSub(true))}catch(e){}},
  mount(el,opt){opt=opt||{};const st=api.status();const S=k=>cfg.slots[k]||{on:true,t:'08:30'};
   const permTxt={granted:'已允许',denied:'已拒绝',default:'还没询问',unsupported:'不支持'}[st.perm];
   el.innerHTML=`<div class="nag">
    <div class="nag-row nag-main"><div><b>${opt.title||'定点催促提醒'}</b><small>${opt.desc||'每天早中晚各弹一次通知，毒舌但可爱'}</small></div><button type="button" class="nag-sw ${cfg.enabled?'on':''}" role="switch" aria-checked="${cfg.enabled}" data-nag="main" aria-label="定点催促提醒开关"><i></i></button></div>
    <div class="nag-slots ${cfg.enabled?'':'off'}">${SL.map(([k,n])=>`<div class="nag-row"><span class="nag-l">${n}</span><input type="time" class="nag-t" data-nagt="${k}" value="${S(k).t}" step="300"><button type="button" class="nag-sw sm ${S(k).on?'on':''}" role="switch" aria-checked="${S(k).on}" data-nags="${k}" aria-label="${n}提醒"><i></i></button></div>`).join('')}</div>
    <p class="nag-st">通知权限：<b>${permTxt}</b> · 时区：${tz()}${st.ios&&!st.standalone?'<br>⚠ iPhone 需要 iOS 16.4+，先用 Safari「分享 → 添加到主屏幕」，再从主屏幕图标打开才能收到提醒':''}${st.perm==='denied'?'<br>⚠ 通知被拒绝了：请在系统设置 → 通知里允许':''}</p>
    <div class="nag-a"><button type="button" class="${opt.btn||'btn'}" data-nag="test" ${cfg.enabled?'':'disabled'}>发送测试提醒</button></div>
    <p class="nag-st nag-fine">只上传推送地址和提醒时间，不上传任何${opt.what||'记录'}内容。这个时段已经记过的话，会换成一句夸夸。</p></div>`;
   const say=opt.toast||(m=>alert(m));const re=()=>api.mount(el,opt);
   el.querySelector('[data-nag=main]').onclick=async()=>{try{cfg.enabled?await api.disable():await api.enable();say(cfg.enabled?'提醒已打开 ⏰':'提醒已关闭')}catch(e){cfg.enabled=false;saveCfg();say(e.message)}re()};
   el.querySelectorAll('[data-nags]').forEach(b=>b.onclick=async()=>{const s=S(b.dataset.nags);s.on=!s.on;cfg.slots[b.dataset.nags]=s;try{await api.setSlots()}catch(e){say(e.message)}re()});
   el.querySelectorAll('[data-nagt]').forEach(i=>i.onchange=async()=>{if(!/^\d\d:\d\d$/.test(i.value))return;const s=S(i.dataset.nagt);s.t=i.value;cfg.slots[i.dataset.nagt]=s;try{await api.setSlots();say('已改为 '+i.value)}catch(e){say(e.message)}});
   el.querySelector('[data-nag=test]').onclick=async()=>{try{const j=await api.test();say('已发送：'+j.body)}catch(e){say(e.message)}}}};
 return api}
window.Nag=mk;
})();
