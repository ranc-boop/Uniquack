# 开发报告：题库详情页 UI 重构

## 一、项目背景

原题库详情页采用单栏布局，视频播放器嵌入主内容区，整体视觉效果不符合国际 OJ（Online Judge）平台的通行设计。本次重构参考 Luogu（洛谷）题目详情页风格，引入双栏布局，优化信息架构，并解决视频自动播放的用户体验问题。

## 二、本次修改文件清单

| 序号 | 文件路径 | 修改类型 | 主要变更 |
|------|---------|---------|---------|
| 1 | `src/app/questions/[id]/page.tsx` | 重构 | 双栏布局、题解折叠、全英文化 |
| 2 | `src/components/video-player-frame.tsx` | 优化 | 禁用自动播放、URL 参数规范化 |

## 三、详细技术实现

### 3.1 双栏布局重构

采用 CSS Grid 实现响应式布局：

```
lg:grid-cols-[1fr_360px]
┌──────────────────────┬──────────┐
│                      │  信息卡  │
│    Description       │  Tags    │
│    Images            │  Video   │
│    Solution(折叠)    │  推荐题  │
│                      │          │
└──────────────────────┴──────────┘
       主内容区(1fr)     侧边栏(360px)
```

**组件设计**：
- `QuestionSection`：带标题分隔线的内容分区组件
- `SidebarCard`：右侧信息卡片通用容器
- `DifficultyBadge`：根据难度值自动变色的徽章

**响应式行为**：
- `lg` 断点（≥1024px）：双栏布局
- 小屏幕：自动降级为单栏堆叠

### 3.2 题解内容折叠设计

原方案直接展示题解内容，存在"剧透"风险且页面过长。采用 Radix UI 的 Accordion 组件实现折叠面板：

```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="solution">
    <AccordionTrigger>View solution</AccordionTrigger>
    <AccordionContent>
      <RichHtml html={question.solution_html} />
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**设计理念**：用户自主决定是否查看题解，避免解题思路被提前暴露。

### 3.3 视频播放器安全加固

**问题分析**：
- Bilibili/YouTube 嵌入播放器默认行为不一致
- 自动播放会干扰用户
- 弹幕（Bilibili 特有）可能分散注意力

**解决方案**：新增 `stripAutoplayAndAppendZero` 函数，对 URL 进行参数标准化：

```
Bilibili: ?autoplay=0&high_quality=1&danmaku=0
YouTube:  ?autoplay=0&rel=0
通用:     autoplay=0
```

同时在 iframe `allow` 属性中移除 `autoplay` 权限声明，从浏览器权限层面二次防护。

## 四、信息架构对照表

本次将所有界面文案英文化，统一术语：

| 原中文 | 英文 | 位置 |
|--------|------|------|
| 题目描述 | Description | 主内容区 |
| 题目图片 | Images | 主内容区 |
| 题解 / 查看题解 | Solution / View solution | 主内容区折叠 |
| 暂无题解内容 | No solution content available | 题解占位 |
| 题目编号 | Problem ID | 侧边栏信息卡 |
| 题目类型 | Type | 侧边栏信息卡 |
| 难度 | Difficulty | 侧边栏信息卡 |
| 状态 | Status | 侧边栏信息卡 |
| 来源 | Source | 侧边栏信息卡 |
| 发布时间 | Published | 侧边栏信息卡 |
| 标签 | Tags | 侧边栏 |
| 暂无标签 | No tags | 侧边栏占位 |
| 视频讲解 | Video explanation | 侧边栏 |
| 打开视频详情 | Open video | 侧边栏按钮 |
| 原始视频 | Original video | 侧边栏按钮 |
| 暂未发布视频讲解 | No video explanation available | 侧边栏占位 |
| 推荐题目 | Recommended problems | 侧边栏 |
| 推荐相关题目即将上线 | Recommended problems coming soon | 侧边栏占位 |

## 五、验证结果

### 5.1 编译验证

- ✅ Next.js Dev Server 启动成功（端口 3000），无编译错误
- ✅ 468ms 快速启动，热更新正常

### 5.2 文案完整性验证

- ✅ `src/` 目录全文检索中文字符：**0 处匹配**
- ✅ 题目详情页所有静态文案均为英文
- ✅ 动态内容（题目标题、标签名、来源等）来自数据库，不受影响

## 六、下一步可选改进方向

1. **视频详情页英文化**：`src/app/videos/[id]/page.tsx` 如有中文可同样处理
2. **推荐题目功能**：当前为占位文本，可接入基于标签相似度的推荐算法
3. **难度可视化**：当前难度 badge 仅用颜色区分，可增加星级或图标强化视觉
4. **提交/通过统计**：可在题目信息卡中增加 AC 率、提交次数等数据展示
