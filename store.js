// 数据层：本地优先（localStorage 缓存 + 同步队列），登录后与 Supabase 双向同步（按 updated_at 最后写入优先）。
(function(){
const CFG=window.APP_CONFIG||{};
const DEMO=!CFG.SUPABASE_ANON_KEY||/[?&]demo=1\b/.test(location.search);
const sb=(!DEMO&&window.supabase)?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,storageKey:'diet-auth'}}):null;
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
const now=()=>new Date().toISOString();
let uid=null,db=null,listeners=[],syncing=false,status='idle';
const key=()=>'diet-db:'+(DEMO?'demo':uid);
const blank=()=>({profile:null,profileAt:null,logs:{},weights:{},foods:{},fav:[],queue:[],since:null,water:{}});
function load(){try{db=Object.assign(blank(),JSON.parse(localStorage.getItem(key())||'null')||{})}catch(e){db=blank()}}
function save(){try{localStorage.setItem(key(),JSON.stringify(db))}catch(e){console.warn('save failed',e)}}
function emit(){listeners.forEach(f=>{try{f()}catch(e){console.error(e)}})}
function enqueue(table,row){if(DEMO)return;db.queue=db.queue.filter(q=>!(q.table===table&&q.k===rowKey(table,row)));db.queue.push({table,k:rowKey(table,row),row});save();scheduleSync()}
function rowKey(t,r){return t==='diet_weights'?r.day:t==='diet_profiles'?'p':r.id}
let st=null;function scheduleSync(){clearTimeout(st);st=setTimeout(sync,800)}
async function sync(){
  if(DEMO||!sb||!uid||syncing||!navigator.onLine){setStatus(navigator.onLine||DEMO?status:'offline');return}
  syncing=true;setStatus('syncing');
  try{
    while(db.queue.length){const q=db.queue[0];const row=Object.assign({},q.row,{user_id:uid});
      const {error}=await sb.from(q.table).upsert(row,{onConflict:q.table==='diet_weights'?'user_id,day':q.table==='diet_profiles'?'user_id':'id'});
      if(error)throw error;db.queue.shift();save()}
    const since=db.since||'1970-01-01T00:00:00Z';let maxAt=since;
    for(const t of ['diet_profiles','diet_logs','diet_weights','diet_custom_foods']){
      const {data,error}=await sb.from(t).select('*').gt('updated_at',since).order('updated_at').limit(5000);
      if(error)throw error;
      for(const r of data){if(r.updated_at>maxAt)maxAt=r.updated_at;mergeRemote(t,r)}
    }
    db.since=maxAt;save();setStatus('synced');emit();
  }catch(e){console.warn('sync',e);setStatus('error')}
  finally{syncing=false}
}
function newer(a,b){return !a||!a.updated_at||new Date(b.updated_at)>=new Date(a.updated_at)}
function mergeRemote(t,r){
  if(t==='diet_profiles'){if(!db.profileAt||new Date(r.updated_at)>=new Date(db.profileAt)){db.profile=r.data;db.profileAt=r.updated_at;if(r.data&&r.data._fav)db.fav=r.data._fav}}
  else if(t==='diet_logs'){const l=db.logs[r.id];if(newer(l,r)){if(r.deleted)delete db.logs[r.id];else db.logs[r.id]={id:r.id,day:r.day,kind:r.kind,meal:r.meal,data:r.data,updated_at:r.updated_at}}}
  else if(t==='diet_weights'){const w=db.weights[r.day];if(newer(w,r)){if(r.deleted)delete db.weights[r.day];else db.weights[r.day]={day:r.day,weight:r.weight==null?null:+r.weight,waist:r.waist==null?null:+r.waist,updated_at:r.updated_at}}}
  else if(t==='diet_custom_foods'){const f=db.foods[r.id];if(newer(f,r)){if(r.deleted)delete db.foods[r.id];else db.foods[r.id]=Object.assign({},r.data,{id:r.id,custom:true,updated_at:r.updated_at})}}
}
function setStatus(s){status=s;document.dispatchEvent(new CustomEvent('syncstatus',{detail:s}))}
window.addEventListener('online',()=>scheduleSync());window.addEventListener('offline',()=>setStatus('offline'));

const Store={
  DEMO,sb,uuid,
  get status(){return DEMO?'demo':(navigator.onLine?status:'offline')},
  get pending(){return db?db.queue.length:0},
  on(f){listeners.push(f)},
  async init(){
    if(DEMO){uid='demo';load();return {user:{email:'demo@local'}}}
    if(!sb)return null;
    const {data}=await sb.auth.getSession();
    if(data.session){uid=data.session.user.id;load();scheduleSync();return data.session}
    return null;
  },
  async signUp(email,password){const {data,error}=await sb.auth.signUp({email,password});if(error)throw error;if(!data.session){const r=await sb.auth.signInWithPassword({email,password});if(r.error)throw r.error;data.session=r.data.session}uid=data.session.user.id;load();scheduleSync();return data.session},
  async signIn(email,password){const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;uid=data.session.user.id;load();await sync();return data.session},
  async signOut(){if(sb)await sb.auth.signOut();uid=null;db=null},
  sync,
  get db(){return db},
  setProfile(p){db.profile=Object.assign({},p);db.profileAt=now();save();enqueue('diet_profiles',{data:Object.assign({},db.profile,{_fav:db.fav}),updated_at:db.profileAt})},
  addLog(day,kind,meal,data){const e={id:uuid(),day,kind,meal:meal||'',data,updated_at:now()};db.logs[e.id]=e;save();enqueue('diet_logs',{id:e.id,day,kind,meal:e.meal,data,deleted:false,updated_at:e.updated_at});return e},
  updateLog(id,data){const e=db.logs[id];if(!e)return;e.data=data;e.updated_at=now();save();enqueue('diet_logs',{id,day:e.day,kind:e.kind,meal:e.meal,data,deleted:false,updated_at:e.updated_at})},
  delLog(id){const e=db.logs[id];if(!e)return;delete db.logs[id];save();enqueue('diet_logs',{id,day:e.day,kind:e.kind,meal:e.meal,data:e.data,deleted:true,updated_at:now()})},
  logsOn(day){return Object.values(db.logs).filter(l=>l.day===day)},
  setWeight(day,weight,waist){const w={day,weight,waist,updated_at:now()};db.weights[day]=w;save();enqueue('diet_weights',{day,weight,waist,deleted:false,updated_at:w.updated_at})},
  delWeight(day){delete db.weights[day];save();enqueue('diet_weights',{day,weight:null,waist:null,deleted:true,updated_at:now()})},
  addFood(f){const id=uuid();const at=now();const data={name:f.name,cat:'自定义',kcal:f.kcal,protein:f.protein,fat:f.fat,carbs:f.carbs,unit:f.unit,unitG:f.unitG};db.foods[id]=Object.assign({},data,{id,custom:true,updated_at:at});save();enqueue('diet_custom_foods',{id,data,deleted:false,updated_at:at});return db.foods[id]},
  delFood(id){const f=db.foods[id];if(!f)return;delete db.foods[id];save();enqueue('diet_custom_foods',{id,data:{},deleted:true,updated_at:now()})},
  toggleFav(fid){const i=db.fav.indexOf(fid);if(i>=0)db.fav.splice(i,1);else db.fav.unshift(fid);db.fav=db.fav.slice(0,40);if(db.profile)this.setProfile(db.profile);else save()},
  exportJSON(){return JSON.stringify({profile:db.profile,logs:Object.values(db.logs),weights:Object.values(db.weights),foods:Object.values(db.foods)},null,1)}
};
window.Store=Store;
})();
