# 改造计划：导航数据全部基于高德实时数据

创建时间: 2026-06-15 14:11
最后更新: 2026-06-15 14:15

## 目标

所有导航显示数据都来自高德路线规划 API 返回的真实路线数据。

## 改造步骤

### Phase 1: MapNavigation 传递完整路线数据 ✅

- [x] onRouteUpdate 改为传递完整路线对象（包含所有路段 steps）
- [x] 每个 step 包含：指令文本、距离、时间、坐标、动作类型
- [x] parseAMapSteps 辅助函数：将高德 route steps 转为 RouteStep[]

### Phase 2: App.tsx 改用真实路线步骤 ✅

- [x] routeInfo 改为 RouteInfo 类型，含 steps
- [x] generateNavSteps 在 routeInfo.steps 存在时返回真实 steps
- [x] HUD 显示真实距离/ETA/速度
- [x] 导航卡片显示真实剩余距离/ETA
- [x] 清除导航时同步清除 routeInfo

### Phase 3: 验证

- [ ] 刷新页面，搜目的地看看 Total Distance / Estimated Time 是否匹配高德数据
- [ ] 点开始导航，HUD 是否显示真实距离
- [ ] 途经点逻辑是否正常

## 当前进度

Phase 1 和 Phase 2 已完成。刷新 http://localhost:3000 检验效果。
