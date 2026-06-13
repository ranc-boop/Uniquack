# PR-C2 Safe Dead Code and Naming Cleanup

## 1. 任务目标

- 清理确定未使用的 helper。
- 统一局部命名，提升 `chunking` / `sourceInput` 相关代码可读性。
- 保持现有行为不变，不触碰 import 行为、summary merge 逻辑和 dashboard layout。

## 2. 实施范围

本次仅修改以下文件：

- `src/components/ai-pdf-control-dashboard.tsx`
- `src/lib/ai-pdf-import/display.ts`
- `src/app/admin/imports/pdf/actions.ts`

新增报告文件：

- `PR-C2-safe-dead-code-and-naming-cleanup-report.md`

## 3. 具体改动

### 3.1 删除确定未使用的 helper

在 `src/components/ai-pdf-control-dashboard.tsx` 中删除以下本地未使用 helper：

- `shortId`
- `friendlyPhaseLabel`
- `isFailedStatus`
- `effectivePhase`
- `statusLabel`
- `getWarnings`
- `aggregateWarnings`

这些 helper 已经被共享显示层逻辑替代，当前文件实际渲染流程依赖的是 `deriveAIPdfBatchDisplayState(...)` 返回值，因此删除后不影响页面结构和显示行为。

### 3.2 统一局部命名

为避免 `sourceInput`、`strategy`、`chunking` 在不同层级表达不一致，本次只统一局部变量命名，不改持久化字段名：

- 在 `src/lib/ai-pdf-import/display.ts` 中：
  - 将局部变量 `strategy` 调整为 `inputStrategy`
  - 对外返回结构仍保持 `strategy: inputStrategy`
  - 保持对 `sourceInput` / `inputStrategy` 的兼容读取逻辑不变

- 在 `src/components/ai-pdf-control-dashboard.tsx` 中：
  - 将 `strategy` 局部变量调整为 `inputStrategy`
  - 将 `chunking` 局部变量调整为 `chunkingSummary`
  - 将 `legacyChunks` 调整为 `legacyChunkSummaries`

- 在 `src/app/admin/imports/pdf/actions.ts` 中：
  - 将 `chunking` 局部变量调整为 `chunkingSummary`
  - 将读取 `aiPdfImport.sourceInput` 后的局部变量命名调整为 `inputStrategy`

### 3.3 保持不变的部分

本次明确未改动以下内容：

- 未修改任何 import 行为
- 未重构 `mergeAIPdfImportSummary` / `mergeAIPdfImportChunkingSummary`
- 未修改 dashboard 布局结构
- 未修改 summary 中的持久化字段名，如 `sourceInput`
- 未移除兼容旧数据结构的 chunk fallback 逻辑

## 4. 开发说明

### 4.1 设计原则

- 只删除“确定未使用”的代码
- 只做“局部命名清理”，不做数据结构改名
- 只做“可证明安全”的改动，不引入行为变化

### 4.2 为什么不直接把 `sourceInput` 全量改名

`sourceInput` 当前不仅用于显示，还参与批次 summary 存储和 chunk retry 判定。若直接统一改成其它持久化字段名，会引入数据兼容和行为回归风险。因此本次只统一局部变量语义，不改落库键名。

## 5. 验证结果

已完成以下验证：

- VS Code diagnostics 检查：
  - `src/components/ai-pdf-control-dashboard.tsx`
  - `src/lib/ai-pdf-import/display.ts`
  - `src/app/admin/imports/pdf/actions.ts`
  - 结果：无诊断错误

- ESLint 定向校验：

```bash
node ./node_modules/eslint/bin/eslint.js src/components/ai-pdf-control-dashboard.tsx src/lib/ai-pdf-import/display.ts src/app/admin/imports/pdf/actions.ts
```

结果：通过

## 6. 风险评估

- 风险等级：低
- 主要原因：
  - 删除内容均为当前未使用 helper
  - 命名调整仅限局部变量
  - 未涉及数据结构、导入方式、页面布局和核心合并逻辑

## 7. 结论

本次 PR-C2 已完成一版安全的 dead code 和 naming cleanup：

- 删除了确定未使用的 dashboard 本地 helper
- 统一了与 `inputStrategy` / `chunkingSummary` 相关的局部命名
- 保持了现有导入行为、summary merge 逻辑和 dashboard layout 不变
- 已生成并保存本报告到项目根目录
