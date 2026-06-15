# 改造计划：真实 AR 导航 + 模拟预览双模式

创建时间: 2026-06-15 14:20

## 目标

项目要有两个明确模式：
1. **真实导航模式** — GPS 定位自动推进导航步骤，HUD 显示真实距离/ETA/速度
2. **模拟预览模式** — 点击"下一站"手动预览路线（给用户演示用）

两个模式共用同一套真实路线数据。

## 数据流

```
高德路线规划 (MapNavigation)
  ↓ onRouteUpdate: RouteInfo { distanceMeters, timeSeconds, steps[] }
  ↓ steps[] 是真实的高德路段 step
  ↓
App.tsx
  ↓
  ├─ 真实模式: GPS定位触发自动跳 step
  │   currentLocation → getDistance() < 45m → 自动推进
  │   SPD = 真实GPS速度
  │   距离/ETA = 路段真实数据
  │
  └─ 模拟模式: 点击"下一站"手动跳 step
      isAutoPlaying = true
      自动每15秒跳一步
      不影响数据源统一
```

## 改造步骤

### Step 1: 确认 generateNavSteps 逻辑
当前已完工：有 routeInfo 时直接返回真实 steps，没有时 fallback 模拟。
✅ 已经对。

### Step 2: GPS 自动推进逻辑
当前 App.tsx 已经有这段代码（~line 725），但在生成步骤里有 fallback。
需要确认：
- 真实导航时，currentLocation 变化自动检测是否靠近下一步
- 没有 GPS 时 fallback 到手动点击

### Step 3: 模拟预览模式
- isAutoPlaying = true 时自动每步15秒推进
- 但预览模式应该不依赖 isAutoPlaying（那是自动巡航）
- 分开控制

## 当前状态评估

当前的改动已经走得差不多了，关键差异在于：
- 原项目有 `generateNavSteps()` 生成约 5 个模拟步骤
- 改了之后如果 routeInfo 有数据就返回几十个真实步骤
- 操作上需要"下一步"点几十次

**方案**：保留两个入口
1. 点击"开始导航" → 真实 GPS 模式，自动跳步骤
2. 点击"模拟行驶" → isAutoPlaying = true，自动推进（演示）
3. 还能手动点"下一站"

这其实已经实现了。主要改进点就是确认真实 GPS 跳转逻辑和 HUD 显示。 

## 实际需要改的

1. 确认 `generateNavSteps` 中真实数据返回已经正常工作 ✅
2. 确认 GPS 自动跳步骤逻辑（`currentLocation` useEffect）使用真实 steps ✅
3. 确认 HUD 中距离/ETA 从 `currentStep` 读取 ✅
4. 确认总览卡片距离/ETA 从 `routeInfo` 读取 ✅
5. 清除逻辑 ✅

**核心结论：当前改动已经支持"真实导航"。模拟预览本就是通过「模拟行驶」按钮切换的，两者是共存关系。不需要大改，只需要确认和微调。**
