# POP 果实 · 接手说明

交接日期 2026-11-21。工作区 /Users/yu1/Desktop/POP。用户偏好简单直接的中文。当前优先级是 BSC 测试网真机联调。

## 产品已定案

用户用 BNB 认购完整果实，分享 X 或币安广场内容并领取首份 POP。朋友通过邀请阅读原帖、答题领取。文章标题、分享者和入口放在果实旁。果肉的减少表示奖励领取进度。持有者首领 20%，后续有效领取累计给持有者解锁 50%，读者合计领取 30%。具体金额和资格以接口结算为准。

| 内部档位 | 用户显示 | 生命周期 |
|---|---|---|
| 0 / MINI | 青苹果 | 完整 → 咬一口 → 果肉逐步减少 → 果核 |
| 1 / PRO | 黄香蕉 | 完整 → 剥皮 → 果肉变短 → 空皮 |
| 2 / WHALE | 橙子 | 完整 → 剥开 → 橙瓣减少 → 空皮 |

领取成功才播放消耗动作。领完退出可领取列表，资产历史保留。内部 BlindBox、buyBox、boxId、startapp=box_ 等仍服务于数据库、合约和旧链接兼容。用户面对的品牌是 POP 果实。

## 美术与实现

- 用户确认亮面漫画贴纸风。沿用原版 POP 果贴、粗黑轮廓、白边、硬边亮面色块、荧光绿、亮黄和爆橙。此前的写实宣传插画已被否决。
- 美术源目录 pop-art-studio/fruit-edition，运行时副本 packages/web-app/public/assets/fruit-edition。改图应同步两处。样品室 pop-art-studio/index.html，批准的造型稿 pop-art-studio/fruit-concepts/pop-fruits-sticker-v4.png。
- 四张宣传图对应赛季横幅、好友分享、Telegram 封面与领取海报。海报模板 poster-base.png 在结算时叠加实际领取阶段的水果和金额。页头默认透明 GIF，减少动态效果时使用 pop-full.svg（内嵌原图的透明 SVG）。
- 前端入口 packages/web-app/src/App.tsx。pages/MintPage、MePage、ExplorePage、MarketPage 分别负责认购、持有与邀请、阅读领取、集市。lib/artPack.tsx 映射档位与图像。components/FruitBite、QuizModal、BoxOpeningStage、CompliantPosterCanvas 处理领取动作与海报。
- packages/backend/src/routes/boxes.routes.ts 和 open.routes.ts 负责激活、邀请查询和双向结算；workers/chainSyncer.worker.ts 同步链上认购与领取事件；bot/telegramBot.ts 处理群邀请。发行参数见 packages/shared/src/constants.ts。旧版展示资产已移出项目。
- 本地演示入口 http://127.0.0.1:5192/mint 。如服务已停止，在 packages/web-app 运行 VITE_USE_MOCK=true bun run dev --host 127.0.0.1 --port 5192 --strictPort 。演示模式的朋友视角使用同一浏览器的本地状态，跨设备验收使用真实后端。

## 已验证的边界

前后端构建、6 项后端测试、11 项 Hardhat 合约测试通过。手机视口已验证认购、首领、邀请、答错、重复领取、最后一份和已领完历史。未登录阅读邀请与加载重试在模拟接口下验证。

独立集成验证使用本地 Hardhat 链、临时 PostgreSQL、Fastify 后端和两个独立签名钱包。测试苹果 6,000 POP / 10 份，支付 0.01 测试 BNB 后，事件同步为完整果实；首领 1,200，朋友答对后读者 +180、持有者 +300，余额分别为 180 与 1,500，剩余 9 份。临时链和数据库已停止。临时测试工具当时位于 /tmp/pop-fruit-validation，交付代码不依赖该目录。

## 接手后的下一项工作

1. 核对 BSC 测试网（chainId 97）上的认购合约、领取金库、POP 代币、赛季配置、测试钱包与测试 BNB 是否可用。入口见 packages/web-app/.env.example、packages/backend/.env.example 和 packages/contracts/scripts。前次验收时没有可用的测试网部署配置。已有部署先核对地址、链和权限；需要新部署、注资或对外开放服务时向用户确认目标与授权。私钥不写入交接文件或聊天。
2. 在测试环境准备 PostgreSQL、Redis、可由两台设备访问的前后端、已初始化的赛季奖池和链同步 worker，关闭 VITE_USE_MOCK。核对前后端 sale/vault 地址一致，后台同步游标覆盖测试交易。
3. 两台手机分别用持有者和读者钱包走完认购 → 首领 → 分享真实链接 → 阅读答题 → 双方余额刷新 → 链上领取。核对交易回执、数据库状态、剩余份数和余额；独立检查集市挂牌/撤单/成交，以及 Telegram Mini App 深链。
4. 记录测试网链 ID、公开合约地址、交易哈希和失败项。当前没有生产上线或主网交易授权。

本地重跑入口：packages/shared 中 bun run build；packages/backend 中 bun run build 与 bun test test/；packages/contracts 中 bun run test；packages/web-app 中 bun run build。
