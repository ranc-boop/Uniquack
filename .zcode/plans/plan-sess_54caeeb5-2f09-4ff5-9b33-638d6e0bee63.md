## 同步本地 main 到远程最新

### 操作步骤
1. `git fetch origin` — 拉取远程 `origin/main` 的最新状态（只读于远程，仅更新远程跟踪分支）
2. 显示 fetch 前后的 HEAD 对比，让你看到本地与远程的差异
3. `git reset --hard origin/main` — 强制本地 `main` 对齐远程 `origin/main`
4. `git status` + `git log --oneline -5` — 确认本地现在等于远程最新

### 风险
- 你选择了 hard reset：本地 `main` 上任何**未推送**的提交会被丢弃。根据初始快照工作区是 clean 的，且最近提交都是已合并的 PR（0a3deea 等），所以预计无损失。
- 不创建/不删除分支，不推送，不改任何文件（除 git 工作区自身）。
- 如果 fetch 后发现本地实际领先远程（有未推送提交），我会在 reset 前停下并告知你，让你确认是否要丢弃。