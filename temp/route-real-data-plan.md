# 改造计划：导航数据全部基于高德实时数据

创建时间: 2026-06-15 14:11

## 目标

当前问题：导航模拟步骤（`generateNavSteps`）里的距离、ETA、速度全是写死/计算器模拟的。
HUD 显示的 SPD、GRAD、CAD、HR 也是纯假数据。

改造目标：所有导航显示数据都来自高德路线规划 API 返回的真实路线数据。

## 现状

```
高德路线规划 (MapNavigation)
  ↓ onRouteUpdate: {distanceMeters, timeSeconds}  ✓ 已实现
  ↓ 但只传了总量信息
  ↓
generateNavSteps() 生成模拟步骤
  ↓ 距离、ETA、转向文本全是写死的
  ↓
HUD / 导航卡片
  ↓ SPD/Grad/CAD/HR 全是假数据
```

## 改造步骤

### Phase 1: MapNavigation 传递完整路线数据

- [x] onRouteUpdate 改为传递完整路线对象（包含所有路段 steps）
- [x] 每个 step 包含：指令文本、距离、时间、坐标、动作类型
- [x] parseAMapSteps 辅助函数：将高德 route steps 转为 RouteStep[]

### Phase 2: App.tsx 改用真实路线步骤

- [ ] routeInfo 改为 RouteInfo 类型，含 steps
- [ ] generateNavSteps -> useRouteSteps 基于真实 steps
- [ ] 导航模拟只走真实步骤
- [ ] HUD 显示真实距离/ETA

### Phase 3: HUD 显示真实运动数据

- [ ] 真实距离/ETA 已就绪
- [ ] SPD（速度）：使用真实路段间距离计算平均速度
- [ ] 移除假数据（GRAD/CAD/HR 高德没有，保留但标记为模拟）

## 当前进度

- [ ] Phase 1: 未开始
- [ ] Phase 2: 未开始
- [ ] Phase 3: 未开始

正在执行: Phase 1
