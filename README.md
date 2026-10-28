# 轻盈日记 · 减脂卡路里记录 (PWA)
纯静态前端 + Supabase（账号、云端同步）。本地优先：离线可用，联网后自动同步。
- 配置：`config.js`。网址加 `?demo=1` 进入本地演示模式。
- 数据库：在 Supabase SQL Editor 运行 `supabase/schema.sql`（只新增 diet_ 表，仅本人可读写）。
- AI 助手：`assistant.js` 的 `Assistant.getAdvice(context)` / `Assistant.ask(q, context)`；以后部署 Edge Function 并在 config.js 填 `ASSISTANT_FUNCTION` 即可接入真 AI，失败自动回退规则版。
- 食物数据为参考值（中国食物成分表 / 日本食品成分表 / USDA）。运动消耗 = MET × 体重 × 小时。
- 第三方：supabase-js (MIT)，Resource Han Rounded (SIL OFL)，Fredoka (SIL OFL)。
- 测试：`cd test && node e2e.js`（需本地 http 服务在 18431 端口）。
