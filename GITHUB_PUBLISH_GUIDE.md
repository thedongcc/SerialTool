# 使用 GitHub Releases 托管更新指南

将更新托管在 GitHub 上是最简单且免费的方案，适用于大多数开源或私人项目。

## 1. 修改配置文件
我已经为你修改了 `electron-builder.json5`。请确保将其中的占位符替换为你真实的 GitHub 信息：
```json5
"publish": [
  {
    "provider": "github",
    "owner": "你的用户名", // 例如: thedong
    "repo": "仓库名"      // 例如: SerialTool_V1
  }
]
```

## 2. 获取 GitHub Token (重要)
为了让构建工具能够自动把文件上传到 GitHub Releases，你需要一个个人访问令牌 (PAT)：
1. 访问 [GitHub Settings -> Tokens](https://github.com/settings/tokens)。
2. 生成一个新令牌 (Classic)，勾选 `repo` 权限。
3. **关键步骤**：在你的电脑上设置环境变量 `GH_TOKEN`，值为你申请的令牌。
   - Windows 命令提示符：`set GH_TOKEN=你的令牌`
   - PowerShell：`$env:GH_TOKEN="你的令牌"`
   - 永久设置：在“系统环境变量”中添加。

## 3. 发布新版本流程
当你准备好发布 v0.0.2 时：
1. 修改 `package.json` 中的 `version` 为 `0.0.2`。
2. 运行构建并发布命令：
   ```bash
   # electron-builder 会根据 GH_TOKEN 自动创建 Draft Release 并上传文件
   npm run build
   ```
3. 访问你的 GitHub 仓库的 **Releases** 页面。
4. 你会看到一个刚生成的 **Draft**。点击编辑，填写更新日志（Changelog），然后点击 **Publish release**。

## 4. 软件如何检测？
GitHub Provider 会自动访问 `https://github.com/owner/repo/releases/latest` 来检查最新的版本。
- 它会自动下载 `.exe` 文件。
- 它会自动校验安全性，无需你手动配置 `latest.yml` 的 URL。

## 5. 注意事项
- **必须是公开仓库**：如果是私有仓库，自动更新检测会因为权限问题失败（除非你在客户端配置额外的 Token，但不建议这么做，会有安全风险）。
- **Tag 格式**：`electron-builder` 创建的 Tag 默认是 `v0.0.2`，这与配置中的版本号对应。
- **差异更新**：GitHub 同样支持 `.blockmap` 差异更新，极大减少用户下载量。

## 6. [进阶] 使用 GitHub Actions 实现全自动发布 (推荐)
我已经为你配置了 `.github/workflows/build.yml`。现在你只需要：
1. **GitHub 仓库配置**：无需在本地设置 `GH_TOKEN`，GitHub Actions 会自动使用内置的权限。
2. **触发发布**：
   - 确定代码已全部 Git Commit。
   - 在本地给代码打上版本标签（Tag）：
     ```bash
     git tag v0.0.2
     git push origin v0.0.2
     ```
3. **观察流程**：
   - 进入 GitHub 仓库的 **Actions** 标签页，你会看到一个正在运行的任务。
   - 任务完成后，它会自动在 **Releases** 页面创建一个 Draft。
4. **最后发布**：去 Releases 页面点击 **Publish** 即可。

**这样做的好处**：你不需要在自己电脑上耗费大量时间构建，所有的编译、打包、上传都在 GitHub 的服务器上完成。
