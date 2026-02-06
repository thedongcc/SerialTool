# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2026-02-06
### Added
- 集成 `electron-updater` 实现自动更新功能。
- 增加 GitHub Actions 自动化构建与发布流程。
- 完善更新对话框 UI，支持展示版本信息和下载进度。
- 实现版本跳转后的 Changelog 自动提醒逻辑。
- 在设置中添加“检查更新”手动入口。

### Fixed
- 修复了 Git 历史记录中包含大型构建产物导致的推送失败问题。
- 解决了 GitHub Actions 默认权限不足导致的 403 错误。
