# 自动更新服务器配置指南

为了让软件能够自动下载更新，你需要配置一个静态资源服务器。以下是具体操作细节：

## 1. 准备更新服务器
Electron 自动更新通过读取服务器上的 `latest.yml`（Windows）或 `latest-mac.yml`（Mac）文件来判断是否有新版本。

你只需要一个能托管静态文件的服务器（如 Nginx, Apache, 甚至是阿里云 OSS, 腾讯云 COS 或 GitHub Pages）。

## 2. 托管目录结构
你的服务器 URL 应该指向一个目录（例如：`http://your-server.com/updates/`）。在这个目录下，你需要放置以下文件：

```text
updates/
├── latest.yml                # 核心配置文件，包含版本号和文件哈希
├── SerialTool-Setup-x.y.z.exe # 软件安装包
└── SerialTool-Setup-x.y.z.exe.blockmap # 差异更新块（由构建工具生成）
```

## 3. 如何产生这些文件？
当你运行打包命令时：
```bash
npm run build
```
在 `release/${version}` 目录下（根据你的 `electron-builder.json5` 配置），会自动生成：
- `.exe` 安装包
- `latest.yml`
- `.blockmap` 文件

**只需将这三个文件上传到你服务器的 `updates/` 目录即可。**

## 4. Nginx 配置示例（参考）
如果你使用 Nginx，确保配置允许跨域（虽然通常不是必需的，但在某些下载场景下更稳）：

```nginx
server {
    listen 80;
    server_name your-server.com;

    location /updates/ {
        alias /var/www/serial-tool-updates/;
        autoindex on;
        add_header Access-Control-Allow-Origin *;
    }
}
```

## 5. 常见问题
- **版本号规则**：只有当 `latest.yml` 中的版本号高于本地 `package.json` 中的版本号时，软件才会触发“发现新版本”逻辑。
- **Changelog**：`latest.yml` 中会自动包含你在构建时通过环境变量或 Git commit 记录的信息。手动修改 `latest.yml` 中的 `releaseNotes` 字段也可以实时更改弹窗里的说明。
- **安全性**：由于没有配置签名（`sign: null`），Windows 可能会在安装时弹出“未知发布者”警告，这不影响自动更新功能的运行。
