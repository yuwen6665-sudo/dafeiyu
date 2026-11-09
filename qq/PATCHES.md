# 对 qq-bridge 的两处改动

> qq-bridge 是第三方项目（本仓库不包含它的源码），下面是我们为了"于笙"改的两个地方。
> 升级 qq-bridge 时需要重新打一次。

## 补丁 1：夜间静音（减少半夜打扰）

文件：`qq-bridge/src/bridge.js`，函数 `scheduleProactiveCheckV2`

```js
// 夜里 23:00–08:00 把主动搭话概率压到 20%
const hour = new Date().getHours();
const quietStart = cfg.socialV2?.proactive?.quietStartHour ?? 23;
const quietEnd   = cfg.socialV2?.proactive?.quietEndHour   ?? 8;
const isQuiet = quietStart > quietEnd
  ? (hour >= quietStart || hour < quietEnd)
  : (hour >= quietStart && hour < quietEnd);
if (isQuiet) prob *= 0.2;
```

## 补丁 2：私聊不主动

文件：`qq-bridge/src/bridge.js`，`scheduleProactiveCheckV2` 开头

```js
// 私聊里她不主动（群里可以主动），由配置控制
if (cfg.socialV2?.proactive?.privateEnabled === false && key.startsWith('private:')) return;
```

改完记得备份原文件（我们本地留了 `bridge.js.bak`）。

## 改完要做什么

1. 在 `config.json` 的 `socialV2.proactive` 里加上 `quietStartHour` / `quietEndHour` / `privateEnabled`
2. 重启 qq-bridge
3. 确认控制台 3100 能打开、主动搭话日志正常

## 不建议改的地方

- 不要改限流参数（`send.maxPerMinute` 等）——那是防封号的
- 不要绕过 `role.maxInjectChars`（人格卡注入上限），超了会被截断
