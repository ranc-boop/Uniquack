# 题库答案结构与导入增强生产报告

生成时间：2026-06-21

## Summary

本分支把题库从“只展示题目内容”推进到“可以保存可判题信息”。管理员现在可以为选择题保存选项和正确答案，为填空题保存最终答案和可接受答案。学生端题目详情页会在题干下方显示选择题选项。

批量 JSON 导入和 AI PDF 导入也同步支持这些字段。导入工具更容易接收 AI 生成的题目 JSON，并且在导入失败时会显示实际失败原因，减少“校验通过但导入 0 条”的误判。

本次没有实现完整自动判题服务。当前工作提供判题服务需要的数据基础，后续练习模块可以基于 `question_type`、`options`、`answer_spec` 做选择题和填空题判别。

## 主要变更

- 数据库新增 `questions.answer_spec`，并扩展 `question_type` 为 `mcq | fill_blank | frq | mixed`。
- 管理后台创建和编辑题目时，可以录入选择题选项、选择题正确答案、填空题最终答案和可接受答案。
- 学生端题目详情页会在题干下显示选择题选项；答案信息仍放在默认折叠区。
- Batch JSON 导入支持简单 JSON。FRQ 和 mixed 题不需要写 `answer_spec`。
- Batch JSON 导入增强识别能力：支持 `options`、`choices`、对象形式选项、`answer`、`final_answer`、`correct_answer` 等常见字段。
- AI PDF 导入 prompt 和 schema 支持 `options` 与 `answer_spec`。
- 导入 prompt 明确要求数学公式使用 `$...$` 包裹，便于前端渲染。
- 批量 publish 增加更新结果校验，避免 RLS 或筛选导致 0 行更新时仍显示成功。

## 数据库与部署

需要应用新迁移：

```sql
supabase/migrations/0013_question_answer_spec.sql
```

迁移内容：

- 扩展 `questions.question_type` check。
- 新增 `questions.answer_spec jsonb not null default '{}'::jsonb`。
- 增加轻量 JSON object check。

应用迁移前，新代码写入 `answer_spec` 会失败。生产部署应先完成数据库迁移，再部署应用代码。

## 验证结果

已完成本地验证：

- `npm run lint` 通过。
- `npm run build` 通过。

建议手动验证：

- 创建选择题，填写选项和正确答案，保存后在学生端看到选项。
- 创建填空题，填写 final answer 和 accepted answers，保存后确认后台可再次编辑。
- 使用 Batch JSON 导入一个简单 FRQ，不写 `answer_spec`，确认可以导入。
- 使用 Batch JSON 导入一个 MCQ，确认选项和正确答案落库。
- 从 review 批量 publish，确认成功后跳转到 published 题目列表。

## 备注

- `numeric_tolerance` 目前只是数据字段，完整自动判题服务尚未实现。
- 自动判题建议后续分阶段实现：先做选择题确定性判题，再做填空题文本/数值规范化，最后做数学等价判定。
- 选择题答案保存在 `answer_spec.correct_option_ids`，选项保存在 `options`。
