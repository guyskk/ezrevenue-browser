# 艺爪图片下载器 Chrome扩展

![插件图标](icons/logo128.png)

一款智能提取网页图片并支持批量下载的Chrome浏览器扩展，支持VIP会员功能。

[艺爪图片下载器-插件安装包](https://github.com/guyskk/ezrevenue-browser/releases/download/1.1.0/ezimage-downloader.zip)

## 功能特性

- 自动提取当前网页所有图片
- 支持单张/批量下载
- 图片预览网格展示
- VIP会员专属批量下载
- 会员状态实时显示

## 安装方法

1. 下载插件代码包
2. 打开Chrome浏览器，进入 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择插件目录 `ezimage-downloader`

## 使用说明

1. 点击浏览器工具栏中的插件图标打开弹出面板
2. 插件会自动扫描当前页面的所有图片
3. 操作方式：
   - 点击单张图片可下载该图片
   - 点击"全部下载"按钮批量下载(VIP功能)
   - 点击会员按钮查看/购买VIP

## 注意事项

- 仅支持http/https/ftp网页
- VIP功能需要联网验证
- 不支持base64编码的图片
- 下载路径为浏览器默认下载目录

## 开发说明

- 技术栈: VSCode + [Cline](https://github.com/cline/cline) + Deepseek V3
- 主要文件:
  - `background.js` - 后台服务
  - `content.js` - 内容脚本
  - `popup.js` - 弹出页面逻辑
  - `popup.html` - 弹出页面UI

## 许可证

MIT License
