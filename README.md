# 智链销国内商超经营智能体

新版源码：https://github.com/poban11335577/zhilian-retail-agent

本轮仅发布 GitHub，未更新 Netlify。原网站 https://zhilian-business-poban.netlify.app/ 是旧版入口；查看本轮手机和电脑对话界面请按下方步骤本地运行。

中文经营对话工作台，兼顾手机与电脑。可查询同一账套的销售、采购、库存与财务，按预算测算备货，保存可回查的执行轨迹与方案审核记录。
本项目仍在完善业务执行闭环，不承诺获奖或真实门店收益。拟定业务以“（拟）”标记。
协作方式见 CONTRIBUTING.md；国内数据与拟定口径见 DATA_SOURCES.md。

![电脑对话工作台](docs/screenshots/desktop.png)

<details><summary>查看手机布局</summary>

![手机对话工作台](docs/screenshots/mobile.png)

</details>

## 运行与构建

要求 Node.js 24。本地独立生成私有配置，不包含生产网站凭据。

```text
npm ci
node scripts/setup.mjs
npm run dev
npm test
npm run build
```

默认首页经营智能体；/scenario备货，/real-data八类明细和报表，/admin管理。自有企业咨询/enterprise-chat，独立企业账本与历史导入不是公共案例的续写。

Netlify服务器需要ADMIN_PASSWORD_HASH、SESSION_SECRET；本地setup生成私有配置。后台支持Ark Responses，密钥加密保存。不要上传.env、.local-data、.netlify或管理员私有密码文件。

39项测试；主要数据和计算入口为public/data/domestic-*.json、lib/case-book.ts、server/case-workflow.ts、server/case-language.ts、server/case-evidence.ts、server/case-forecast.ts。通用企业ledger是独立系统。当前公共案例按整数克和万分之一元计算，参考成本、采购与损耗明确标（拟）。

官方数据、日期平移、真实/拟定边界及完整剩余问题见docs。Excel16张表与网站数据同源。源码保留旧英国案例供历史测试，不作为默认国内案例。

## 重建公共账套

```text
python scripts/build-domestic-case.py scripts/data-inputs/domestic
```

需Python，输入为从官方Excel读取的选择JSON和原附件哈希清单，含原表行号与原始日期。官方原始附件下载地址及哈希记录在公开source元数据中，可与原文件核验。该脚本写public/data，两份JSON需重新构建部署。只重建演示账套，不代表真实记账或预测验证。Excel需同步按同一数据重导出，不能只换网页数据。

`npm run build` 会从两份完整账套生成轻量首页概览，再构建页面和后端。首页不下载完整销售明细；经营数据页按需加载原账套。

当前默认采购审核只保存意见，不自动记账。角色配置不意味着9个独立推理模型；模型只能依据只读工具证据提出建议。

