# `codex/practice-flow-rework` 相对 `main` 的生产报告

- 分支：`codex/practice-flow-rework`
- 基线：`main`
- 头部提交：`2e4650e` `Refresh student practice UI`
- 报告日期：`2026-06-23`

## 一、报告结论

这个分支不是一次局部修补，而是对“练习链路”做了完整重构。核心目标从“内容平台式浏览”转向“学生练习工作台”，把题库、做题、错题复练、会话记忆和结果回放串成一条连续路径。

从生产角度看，这次变更带来的最大收益有三点：

1. 学生可以从首页直接进入练习、题库、错题复练三个主路径。
2. 练习过程从单次题目提交，升级为“可恢复、可回放、可复练”的会话体验。
3. 错题不再只是静态列表，而是可以直接转化为当前会话里的自定义练习轮次。

## 二、这次分支解决了什么问题

在 `main` 的旧结构里，页面更偏向内容管理和浏览，练习体验比较分散：

- 首页更像平台入口，不像学习工作台。
- 题库页主要是浏览列表，缺少“选题 -> 组卷 -> 开练”的闭环。
- 错题记录存在，但没有形成高频复练入口。
- 练习页的状态恢复、历史回放和题目快照能力有限。

本分支把这些点统一到了一个学生导向的工作流中：

- 先找题。
- 再组题。
- 再练习。
- 再看错题。
- 最后把错题重新送回练习。

## 三、主要改动概览

### 1. 首页和全局视觉改成学生工作台

涉及文件：

- [`src/app/page.tsx`](../../src/app/page.tsx)
- [`src/app/layout.tsx`](../../src/app/layout.tsx)
- [`src/app/globals.css`](../../src/app/globals.css)

主要变化：

- 首页从“平台式四宫格入口”改成“学生练习工作台”。
- 增加三个主行动入口：
  - `Practice workspace`
  - `Question Bank`
  - `Mistakes`
- 统一加入更明确的学习路径文案，强调“练习 -> 复盘 -> 错题恢复”。
- 全局布局改成更适合学习场景的导航结构，顶部导航保留 `Practice / Question Bank / Mistakes / Videos / Admin`。
- 全局样式引入更柔和的背景层次、卡片浮层和卡片 hover 动效，整体视觉从“管理后台风格”转向“学生工作台风格”。

生产意义：

- 新用户进入系统后，不会再先看到“内容平台”的抽象描述，而是直接看到可操作的学习路径。
- 顶部导航更贴近真实学习流程，减少路径理解成本。

### 2. 题库页升级为“可组篮子的练习入口”

涉及文件：

- [`src/app/questions/page.tsx`](../../src/app/questions/page.tsx)
- [`src/components/question-bank-client.tsx`](../../src/components/question-bank-client.tsx)

主要变化：

- 题库页从静态表格升级为可交互的题库卡片列表。
- 支持勾选题目组成 basket。
- 支持单题直接进入练习。
- 支持把所选题目一次性发起为自定义练习轮次。
- 增加题目难度标识、题目摘要、审核通过的知识点标签展示。
- 列表顶部提供篮子状态、已选题数和清空操作。

生产意义：

- 题库不再只是“看题”，而是可直接产出练习任务。
- 学生可以用自己挑选的题目构造针对性训练，不依赖 AI 自动推荐。

### 3. 新增自定义练习轮次 API

涉及文件：

- [`src/app/api/practice/rounds/custom/route.ts`](../../src/app/api/practice/rounds/custom/route.ts)

主要变化：

- 新增 `POST /api/practice/rounds/custom`。
- 入参支持：
  - `goal`
  - `questionIds`
  - `sessionId`
- 逻辑优先从公开发布题目中取题。
- 如果题目已不再公开，但用户的错题表里有保存的 snapshot，则可从错题快照恢复。
- 会话和轮次会被写入持久化存储，返回标准的 `PracticeRecommendResponse`。

生产意义：

- 这是题库页、错题页、单题练习页统一接入练习引擎的基础。
- 以后只要有题目 ID，就能把它们转成一轮可执行的练习。

### 4. 单题详情页增加“Practice mode”

涉及文件：

- [`src/app/questions/[id]/page.tsx`](../../src/app/questions/[id]/page.tsx)
- [`src/components/practice/question-practice-panel.tsx`](../../src/components/practice/question-practice-panel.tsx)

主要变化：

- 题目详情页新增 `mode=practice` 模式。
- 在练习模式下：
  - 题目正文上方直接出现“Practice this question”面板。
  - 练习时隐藏完整解析，避免用户先看答案。
  - 提交后再展示结果和解析。
- 在浏览模式下：
  - 保持原本的查看答案、答案信息和题目详情行为。

生产意义：

- 单题浏览和单题练习分开了，减少“边看边做”的干扰。
- 这让详情页既能做资料页，也能做练习页。

### 5. 新增错题页，并支持一键复练

涉及文件：

- [`src/app/mistakes/page.tsx`](../../src/app/mistakes/page.tsx)
- [`src/components/practice/mistakes-page-client.tsx`](../../src/components/practice/mistakes-page-client.tsx)
- [`src/app/api/practice/wrong-questions/route.ts`](../../src/app/api/practice/wrong-questions/route.ts)

主要变化：

- 新增 `/mistakes` 页面。
- 页面展示当前活跃错题，包含：
  - 题号
  - 错误次数
  - 最近一次出错时间
  - 上次作答
  - 上次解释
  - 保存的题目快照正文
- 每道错题都能直接点击 `Practice again`。
- 点击后会自动：
  - 确认当前会话。
  - 创建或复用当前 practice session。
  - 调用 custom round API 生成一轮只含该错题的练习。
  - 通过 `sessionStorage` 把新轮次带回 `/practice` 页面。

生产意义：

- 错题复练从“人工找回去练”变成“一键复测”。
- 对长周期学习特别重要，因为错题经常比新题更需要回看。

### 6. 练习主客户端的状态管理和恢复能力增强

涉及文件：

- [`src/components/practice/practice-agent-client.tsx`](../../src/components/practice/practice-agent-client.tsx)
- [`src/lib/practice/persistence.ts`](../../src/lib/practice/persistence.ts)
- [`src/lib/practice/types.ts`](../../src/lib/practice/types.ts)

主要变化：

- 练习主客户端增加了更完整的会话恢复逻辑。
- 支持从历史轮次还原：
  - 题目
  - 答案
  - 提示
  - 结果
  - 复盘总结
- 支持从 `sessionStorage` 读取刚刚创建的 custom round，并立即恢复到练习界面。
- 错题加载现在可以按 `sessionId` 过滤，只看当前会话相关错题。
- 练习轮次持久化时，题目快照字段被更完整地保存和回填：
  - `contentExcerpt`
  - `contentHtml`
  - `difficulty`
  - `expectedSkill`
  - `options`
  - `questionCode`
  - `questionType`
  - `reason`
  - `source`
  - `tagIds`
  - `title`

生产意义：

- 用户刷新页面后更容易恢复上下文，不会轻易丢掉练习进度。
- 历史轮次能更像“可再次打开的学习记录”，而不是只剩一条分数记录。

### 7. 评分和提示接口更稳健

涉及文件：

- [`src/app/api/practice/hint/route.ts`](../../src/app/api/practice/hint/route.ts)
- [`src/app/api/practice/review/route.ts`](../../src/app/api/practice/review/route.ts)

主要变化：

- `hint` 接口在出错时不再直接返回 500，而是：
  - 记录 trace
  - 退化到通用启发式提示
  - 保证前端还能拿到可用 hint
- `review` 接口的启发式总结更像 coaching review，不再只是“分数 + 错题”。
- LLM/规则提示里增加了更明确的 summary 约束：
  - 要写清楚做得好的地方
  - 要写清楚需要训练的地方
  - 要写清楚下一步练什么

生产意义：

- 用户不会因为提示服务局部失败而中断整轮练习。
- 复盘内容更贴近学习反馈，而不是机械结果输出。

## 四、数据流变化

这次分支最重要的变化不是 UI，而是数据流被打通了。

### 旧流程

```text
首页 -> 题库浏览 / 练习页 -> 单次会话 -> 错题分散保存
```

### 新流程

```text
首页
  -> 题库选题 / 单题练习 / 错题复练
  -> custom round API 生成指定题目轮次
  -> practice session 复用或创建
  -> 练习提交与复盘
  -> 错题落库
  -> 错题页再次进入 custom round
```

这个闭环的关键点是：

- 题目可以从多个入口进入同一个练习系统。
- 练习结果能回流到错题列表。
- 错题列表又能重新发起练习。

## 五、对用户体验的实际影响

### 正向影响

- 路径更短：从题库或错题页直接进入练习，不需要额外手工配置。
- 记忆更强：历史轮次可恢复，减少中断成本。
- 反馈更集中：练习、提示、复盘、错题是一套连贯体验。
- 自主性更高：可以自己选题组篮子，而不是完全依赖自动生成。

### 行为层面的变化

- 学生更容易做“针对性复习”而不是“泛刷题”。
- 错题的回收效率更高。
- 单题详情页的用途更丰富，适合精读和练习切换。

## 六、生产风险与注意点

### 1. 练习轮次创建依赖 sessionStorage 传递

当前从题库页和错题页跳回 `/practice`，主要通过 `sessionStorage` 传递刚创建的轮次。

影响：

- 浏览器禁用 storage 或非常规跳转时，恢复体验可能变差。

### 2. custom round 依赖公开题目或保存的错题快照

如果题目既不是公开题，也没有对应的错题快照，custom round 会返回 404。

影响：

- 前端已经做了错误提示，但后续如果扩展题源类型，需要继续补齐这里的分支。

### 3. 历史轮次恢复依赖保存字段完整

这次补了很多 `question_snapshot` 字段，但如果旧数据中缺失字段，恢复展示会退化。

影响：

- 老会话能回放，但细节展示可能不如新数据完整。

### 4. 自动化验证未在本次会话中执行

本报告是根据代码 diff 和结构检查整理的，没有在这次会话里额外跑完整测试或构建命令。

影响：

- 功能意图清晰，但仍建议在目标环境里补一次 `build` / `lint` / 关键路径回归。

## 七、变更文件清单

### 路由和页面

- [`src/app/page.tsx`](../../src/app/page.tsx)
- [`src/app/layout.tsx`](../../src/app/layout.tsx)
- [`src/app/globals.css`](../../src/app/globals.css)
- [`src/app/mistakes/page.tsx`](../../src/app/mistakes/page.tsx)
- [`src/app/questions/page.tsx`](../../src/app/questions/page.tsx)
- [`src/app/questions/[id]/page.tsx`](../../src/app/questions/[id]/page.tsx)

### API

- [`src/app/api/practice/hint/route.ts`](../../src/app/api/practice/hint/route.ts)
- [`src/app/api/practice/review/route.ts`](../../src/app/api/practice/review/route.ts)
- [`src/app/api/practice/rounds/custom/route.ts`](../../src/app/api/practice/rounds/custom/route.ts)
- [`src/app/api/practice/wrong-questions/route.ts`](../../src/app/api/practice/wrong-questions/route.ts)

### 客户端组件

- [`src/components/practice/mistakes-page-client.tsx`](../../src/components/practice/mistakes-page-client.tsx)
- [`src/components/practice/practice-agent-client.tsx`](../../src/components/practice/practice-agent-client.tsx)
- [`src/components/practice/question-practice-panel.tsx`](../../src/components/practice/question-practice-panel.tsx)
- [`src/components/question-bank-client.tsx`](../../src/components/question-bank-client.tsx)

### 练习数据层

- [`src/lib/practice/persistence.ts`](../../src/lib/practice/persistence.ts)
- [`src/lib/practice/types.ts`](../../src/lib/practice/types.ts)

## 八、建议的后续检查

如果要把这条分支作为生产候选，建议继续确认：

1. `practice` 主流程在首次进入、刷新恢复、从题库跳转、从错题跳转四种路径下都能稳定恢复。
2. `custom round` 在题目公开、题目下架、错题快照恢复三种情况下都能正常返回。
3. `hint` 和 `review` 在后端辅助能力不可用时的降级输出符合预期。
4. 旧会话数据在新 UI 里是否存在字段缺失或排版异常。

## 九、总结

这个分支把 O2I 从“内容浏览型平台”推进到了“可闭环练习型工作台”。

最关键的变化不是某个页面的样式，而是：

- 题库能组题。
- 错题能复练。
- 单题能进入练习模式。
- 练习状态能恢复。
- 练习数据能沉淀为下一轮输入。

如果目标是让学生在一个地方完成“找题、练题、错题回收、再次练题”，这个分支已经把主链路搭起来了。
