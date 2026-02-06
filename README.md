# SerialTool 🚀

[![GitHub Release](https://img.shields.io/github/v/release/thedongcc/SerialTool?style=flat-square)](https://github.com/thedongcc/SerialTool/releases)
[![Build and Release](https://github.com/thedongcc/SerialTool/actions/workflows/build.yml/badge.svg)](https://github.com/thedongcc/SerialTool/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**前情提要** 本软件是Vibe Coding产物，仅供学习或参考，不建议在生产环境中使用。

**SerialTool V1** 是一款面向未来的、高性能、极具现代感的全能型串口调试辅助工具。它不仅支持传统的串口通信，还集成了 MQTT、TCP 等协议，并提供强大的图形化编辑器与自动化流水线。

---

## ✨ 核心特性

- **💎 极致视觉体验**: 基于 Vite + React + Tailwind CSS 构建的高级感 UI，支持响应式布局与极致流畅的交互。
- **🔌 多协议融合**: 一站式支持 Serial Port, MQTT, TCP Client/Server，满足各种开发场景。
- **📊 节点式编辑器**: 内置先进的图形化节点编辑器，支持复杂逻辑的拖拽配置与实时绘图展示。
- **🔄 全自动更新**: 集成 `electron-updater`，支持新版本自动检测、静默更新及详细更新日志展示。
- **🤖 自动化流水线**: 基于 GitHub Actions 的 CI/CD，推送 Tag 即可实现自动构建、打包及 Release 发布。
- **📑 规范化管理**: 遵循 Keep a Changelog 与 Semantic Versioning 规范。

---

## 🛠️ 技术栈

| 领域 | 技术方案 |
| :--- | :--- |
| **基础框架** | [Electron](https://www.electronjs.org/), [React 18](https://react.dev/) |
| **构建工具** | [Vite](https://vitejs.dev/), [Electron Builder](https://www.electron.build/) |
| **样式方案** | [Tailwind CSS](https://tailwindcss.com/) |
| **图标系统** | [Lucide React](https://lucide.dev/) |
| **开发语言** | [TypeScript](https://www.typescriptlang.org/) |
| **自动化** | [GitHub Actions](https://github.com/features/actions) |

---

## 🚀 快速开始

### 安装使用
在 [Releases](https://github.com/thedongcc/SerialTool/releases) 页面下载最新版本的 `SerialTool-Setup-x.x.x.exe`，安装后即可使用。

### 本地开发
```bash
# 克隆项目
git clone https://github.com/thedongcc/SerialTool.git

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建打包
```bash
# 自动打出本地安装包
npm run build
```

---

## 📦 自动化发布流程

项目已配置完整的云端 CI/CD 流程：

1. **更新版本**: 修改 `package.json` 中的版本号。
2. **记录变更**: 在 `CHANGELOG.md` 中添加最新的更新内容。
3. **推送标识**:
   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```
4. **云端构建**: GitHub Actions 会自动触发构建，并将生成的安装包以 **Draft Release** 形式保存。

---

## 🤝 贡献与反馈
欢迎通过 Issue 提供建议或通过 Pull Request 贡献代码。

**Author**: [@thedongcc](https://github.com/thedongcc)  
**License**: [MIT](file:///p:/Webstorm/SerialTool_V1/LICENSE)
