// AI助手（当前为内置规则版）。统一接口：
//   Assistant.getAdvice(context) -> Promise<Array<{tone,title,text}>>
//   Assistant.ask(question, context) -> Promise<string>
// 以后接入真 AI：在 config.js 设置 ASSISTANT_FUNCTION（Supabase Edge Function 名），
// 函数接收 {mode:'advice'|'ask', question, context} 返回 {items}/{answer}；失败时自动回退到规则版。
(function(){
const r=Math.round;
const pick=(arr,seed)=>arr[Math.abs(seed)%arr.length];
const DINNERS=[
 {n:'清蒸鲈鱼 + 蒜蓉西兰花 + 半碗糙米饭',k:420,p:38,t:['seafood','lowcarb']},
 {n:'番茄牛肉炖豆腐 + 凉拌黄瓜',k:430,p:36,t:['beef']},
 {n:'鸡胸肉蔬菜沙拉 + 一个溏心蛋 + 无糖酸奶',k:380,p:42,t:['dairy','lowcarb']},
 {n:'香煎三文鱼 + 芦笋 + 烤红薯半个',k:480,p:32,t:['seafood']},
 {n:'麻婆豆腐(少油) + 清炒菠菜 + 半碗米饭',k:450,p:22,t:['veg','spicy']},
 {n:'菌菇豆腐汤 + 毛豆 + 杂粮饭小半碗',k:380,p:24,t:['veg']},
 {n:'虾仁滑蛋 + 清炒时蔬 + 玉米半根',k:400,p:33,t:['seafood']},
 {n:'白切鸡(去皮) + 白灼生菜 + 小米粥',k:410,p:35,t:[]},
 {n:'番茄鸡蛋荞麦面(少面多菜)',k:430,p:22,t:['veg']},
 {n:'便利店：沙拉鸡胸 + 包装沙拉 + 关东煮(萝卜/鸡蛋)',k:330,p:38,t:[]},
 {n:'便利店：荞麦沙拉 + 即食溏心蛋 + 无糖豆浆',k:400,p:24,t:['veg']},
 {n:'酸菜鱼(少吃汤底的油) + 一碗清炒时蔬',k:470,p:40,t:['seafood','spicy']},
 {n:'卤牛肉 + 凉拌木耳 + 蒸南瓜',k:390,p:34,t:['beef']},
 {n:'豆腐干炒芹菜 + 紫菜蛋花汤 + 半碗米饭',k:410,p:24,t:['veg']},
 {n:'羊肉(瘦)炖萝卜 + 清炒西葫芦',k:420,p:32,t:[]},
 {n:'纳豆拌饭(小碗) + 味噌汤 + 冷豆腐',k:430,p:24,t:['veg']}
];
function okDish(d,prefs){
  if(prefs.includes('veg')&&!d.t.includes('veg'))return false;
  if(prefs.includes('vegan')&&(!d.t.includes('veg')||/蛋|酸奶|奶/.test(d.n)))return false;
  if(prefs.includes('nospicy')&&d.t.includes('spicy'))return false;
  if(prefs.includes('lactose')&&d.t.includes('dairy'))return false;
  if(prefs.includes('noseafood')&&d.t.includes('seafood'))return false;
  if(prefs.includes('halal')&&/猪|火腿|培根/.test(d.n))return false;
  return true;
}
function dinnerList(ctx,n){
  const left=ctx.targets.kcal-ctx.today.kcal+ctx.today.ex;
  const prefs=ctx.prefs||[];
  let list=DINNERS.filter(d=>okDish(d,prefs));
  if(!list.length)list=DINNERS.filter(d=>d.t.includes('veg'));
  list=list.map(d=>Object.assign({},d,{score:Math.abs(d.k-Math.min(Math.max(left,300),600))-(prefs.includes('lowcarb')&&d.t.includes('lowcarb')?80:0)-(ctx.today.protein<ctx.targets.protein*0.6?d.p:0)}));
  list.sort((a,b)=>a.score-b.score);
  const off=new Date().getDate()%2;return list.slice(off,off+n);
}
function rules(ctx){
  const out=[];const t=ctx.today,g=ctx.targets,name=ctx.profile.name||'';
  const seed=(new Date().getDate())*7+(ctx.streak||0);
  // 鼓励 / 连续打卡
  if(ctx.streak>=7)out.push({tone:'cheer',title:'连续 '+ctx.streak+' 天记录',text:'坚持记录本身就是最有效的减脂习惯之一。'+pick(['这一周的你，比上一周更了解自己的身体。','保持这个节奏，数据会越来越有参考价值。','就算哪天吃多了，也照样记下来，这才是真正的坚持。'],seed)});
  else if(ctx.streak>=2)out.push({tone:'cheer',title:'已连续记录 '+ctx.streak+' 天',text:pick(['好的开始！先把“每天都记”变成习惯，精确度可以慢慢提高。','习惯在第2–3周最容易松动，提前给自己留点弹性。'],seed)});
  else out.push({tone:'cheer',title:(name?name+'，':'')+'今天也一起加油',text:'从记录下一餐开始就好。不必追求完美，持续比精确更重要。'});
  // 体重趋势
  const tr=ctx.trend;
  if(tr&&tr.n>=4){
    if(tr.weekly<-1.2)out.push({tone:'warn',title:'减得有点快',text:'近一周平均每周约 '+Math.abs(tr.weekly).toFixed(1)+' kg。过快容易掉肌肉、也更易反弹，可以每天多吃 100–200 kcal，优先加蛋白质。'});
    else if(tr.weekly<-0.15)out.push({tone:'good',title:'趋势正在下降 ↓',text:'7日平均体重约每周下降 '+Math.abs(tr.weekly).toFixed(2)+' kg，节奏很健康。单日涨跌是水分，别被它影响心情。'});
    else if(tr.plateauDays>=14)out.push({tone:'info',title:'遇到平台期了吗？',text:'体重约 '+tr.plateauDays+' 天没有明显变化。先检查：周末是否有大餐、油和酱料有没有漏记、睡眠是否不足。也可以量一下腰围，体重不动时腰围常常还在变小。'});
    else if(tr.weekly>0.3)out.push({tone:'info',title:'体重略有上升',text:'近期 7 日均值在上升。若最近盐分高、经期前或刚开始力量训练，多半是水分；连续两周上升再调整热量即可。'});
  }else out.push({tone:'info',title:'多记几天体重',text:'记录 4 天以上体重后，我会用 7 日平均值帮你判断真实趋势，而不是被单日波动牵着走。'});
  // 近7天热量与蛋白质
  const d7=ctx.days.filter(d=>d.logged).slice(-7);
  if(d7.length>=3){
    const avg=d7.reduce((s,d)=>s+d.kcal-d.ex,0)/d7.length;const pavg=d7.reduce((s,d)=>s+d.protein,0)/d7.length;
    if(avg<g.floor-100)out.push({tone:'warn',title:'吃得太少了',text:'近 '+d7.length+' 天平均净摄入约 '+r(avg)+' kcal，低于安全下限 '+g.floor+' kcal。长期过低会掉肌肉、更饿、代谢适应更明显，建议适当加量。'});
    else if(avg>g.kcal+250)out.push({tone:'info',title:'热量略超预算',text:'近 '+d7.length+' 天平均净摄入约 '+r(avg)+' kcal，比目标多约 '+r(avg-g.kcal)+' kcal。先从饮料、油和零食里找最容易减掉的 150 kcal。'});
    if(pavg<g.protein*0.75)out.push({tone:'info',title:'蛋白质常常不够',text:'近几天平均蛋白质约 '+r(pavg)+'g，目标 '+g.protein+'g。可以每餐加一份：鸡蛋、豆腐、鸡胸、希腊酸奶'+((ctx.prefs||[]).includes('veg')?'（素食可选豆腐、毛豆、纳豆、蛋白粉）':'')+'。'});
    const wk=ctx.days.slice(-14).filter(d=>d.logged);const we=wk.filter(d=>[0,6].includes(new Date(d.day+'T00:00').getDay()));const wd=wk.filter(d=>![0,6].includes(new Date(d.day+'T00:00').getDay()));
    if(we.length&&wd.length){const a=we.reduce((s,d)=>s+d.kcal,0)/we.length,b=wd.reduce((s,d)=>s+d.kcal,0)/wd.length;if(a-b>400)out.push({tone:'info',title:'周末效应',text:'周末平均比工作日多吃约 '+r(a-b)+' kcal，这会抵消掉不少工作日的缺口。试试提前规划周末的那一顿大餐。'})}
  }
  // 运动
  const exDays=ctx.days.slice(-7).filter(d=>d.ex>0).length;
  if(exDays===0)out.push({tone:'info',title:'动起来的小目标',text:'这周还没有运动记录。不一定要去健身房：饭后散步 15 分钟，既能控餐后血糖，也是在增加 NEAT 消耗。'});
  else if(exDays>=4)out.push({tone:'good',title:'本周运动 '+exDays+' 天',text:'很棒！记得每周安排 2–3 次力量训练来保住肌肉，运动消耗不建议全部吃回来。'});
  // 偏好
  if((ctx.prefs||[]).includes('lowcarb'))out.push({tone:'info',title:'控碳小提醒',text:'控碳期间体重前期下降多为糖原和水，恢复碳水时回升也正常。纤维要靠蔬菜、菌菇和魔芋补足。'});
  return out;
}
function answer(q,ctx){
  const t=ctx.today,g=ctx.targets;const left=r(g.kcal-t.kcal+t.ex);const pl=Math.max(0,r(g.protein-t.protein));
  if(/还能吃|剩/.test(q)){
    if(left<=0)return '今天的预算已经用完（超出约 '+(-left)+' kcal）。如果饿了，选低能量密度的：黄瓜、番茄、无糖茶、一碗清汤。别为此焦虑，明天正常吃，不用刻意补偿。';
    let s='今天还剩约 '+left+' kcal';s+=pl>0?'，蛋白质还差约 '+pl+'g。':'，蛋白质已经达标👏。';
    const ideas=[];
    if(pl>15)ideas.push((ctx.prefs||[]).includes('veg')?'一盒北豆腐(约147kcal/18g蛋白)':'一份鸡胸肉(约160kcal/34g蛋白)');
    if(left>150&&!(ctx.prefs||[]).includes('lactose'))ideas.push('一杯希腊酸奶(约145kcal/14g蛋白)');
    if(left>80)ideas.push('一个苹果或一份草莓(约50–100kcal)');
    if(left>400&&!(t.meals&&t.meals.dinner))ideas.push('一份正常的晚餐，例如「'+dinnerList(ctx,1)[0].n+'」');
    return s+(ideas.length?'可以考虑：'+ideas.join('、')+'。':'');
  }
  if(/体重.*不动|平台|不掉/.test(q)){
    const tr=ctx.trend;let s='';
    if(tr&&tr.n>=4)s='你最近 7 日平均体重'+(tr.weekly<-0.1?'其实还在下降（约每周 '+Math.abs(tr.weekly).toFixed(2)+'kg），只是单日数据被水分掩盖了。':'基本持平。')+' ';
    s+='常见原因：①水分波动（高盐、经期前、刚加大运动量都会留水，可掩盖 1–2kg 脂肪下降）；②漏记的油、酱料、饮料；③体重下降后消耗也变少了，原目标需下调；④睡眠不足让食欲上升。';
    s+='建议：看 2–3 周的平均趋势；记录腰围；把每天目标再降 100–150 kcal 或每天多走 3000 步，而不是大幅节食。';
    return s;
  }
  if(/晚餐|晚饭|推荐/.test(q)){
    const l=dinnerList(ctx,3);
    return '按你今天剩余约 '+Math.max(left,0)+' kcal'+((ctx.prefs||[]).length?'，并避开你的忌口':'')+'，推荐：\n'+l.map((d,i)=>(i+1)+'. '+d.n+'（约'+d.k+'kcal / 蛋白质'+d.p+'g）').join('\n')+'\n小技巧：先吃菜和蛋白质，最后吃主食。';
  }
  if(/运动|练/.test(q)){
    const w=ctx.weight||60;return '以你现在约 '+w+'kg 的体重：快走 30 分钟约 '+r(4.3*w*0.5)+' kcal，慢跑 30 分钟约 '+r(8.3*w*0.5)+' kcal，力量训练 40 分钟约 '+r(5*w*0.67)+' kcal。减脂期建议：每周 2–3 次力量 + 日常多走路，比每天长时间有氧更容易坚持，也更能保住肌肉。';
  }
  if(/鼓励|累|难|坚持/.test(q))return pick(['减脂不是一条直线，是一条向下的锯齿线。今天的你已经在这条线上了。','你不需要完美的一周，只需要比较好的很多周。','吃多了一顿不会让你变胖，就像吃一顿沙拉不会让你变瘦。回到节奏就好。'],new Date().getHours());
  return '我现在是内置规则版助手，可以回答：今天还能吃什么、为什么体重不动、推荐晚餐、运动消耗和需要鼓励的时候～';
}
async function remote(mode,question,ctx){
  const fn=(window.APP_CONFIG||{}).ASSISTANT_FUNCTION;const sb=window.Store&&window.Store.sb;
  if(!fn||!sb||!navigator.onLine)return null;
  try{const {data,error}=await sb.functions.invoke(fn,{body:{mode,question,context:ctx}});if(error)return null;return data}catch(e){return null}
}
window.Assistant={
  async getAdvice(ctx){const d=await remote('advice',null,ctx);return (d&&Array.isArray(d.items))?d.items:rules(ctx)},
  async ask(q,ctx){const d=await remote('ask',q,ctx);return (d&&d.answer)?String(d.answer):answer(q,ctx)},
  QUICK:['今天还能吃什么？','为什么体重不动了？','推荐晚餐','运动能消耗多少？','给我一点鼓励']
};
})();
