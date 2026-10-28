// 只需修改这里。网址带 ?demo=1 或 key 留空时进入本地演示模式（数据只存在本浏览器）。
// publishable / anon key 本来就是公开的；切勿填入 service_role / secret key。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://wtkvkklhbjoiitfvkkne.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_KCt29Ha_kR56HNlxCDjfpw_TQolXAKU',
  // 以后接入真 AI：部署 Supabase Edge Function（例如 diet-assistant）后把名字填到这里。留空 = 使用内置规则版。
  ASSISTANT_FUNCTION: ''
};
