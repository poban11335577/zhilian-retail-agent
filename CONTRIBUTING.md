# 一起改进智链销

## 开发环境

使用 Node.js 24，运行 `npm ci`、`node scripts/setup.mjs`、`npm run dev`。
本地默认地址 http://127.0.0.1:5180；新环境默认使用账套规则模式，不含线上模型密钥。
本地管理员密码按 setup 提示设置，仅保存到自己的私有配置。

## 提交流程

1. 从 main 建立功能分支；外部协作者可 Fork 后提交 Pull Request。
2. 修改后运行 `npx tsc --noEmit`、`npm test`、`npm run build`。
3. 界面修改附上电脑和手机截图，至少检查 390×844、375×667、1440×900。
4. 在 Pull Request 写清改变了什么、验证结果，以及尚未解决的问题。

采购、销量、库存、成本和报表由 `lib/case-book.ts` 同源计算。不要在页面里另造一套数字。
不要把拟定的采购或库存用来宣称历史预测准确；预测检验应使用保留的原始销售日历和留出样本。
数据变更要同步更新两份国内账套 JSON、概览和 Excel，并验证整数数量、金额及逐笔对账。
模型回答中的业务数字必须来自账套工具；只调整提示词不能替代金额与引用检查。

## 主要文件

| 工作 | 入口 |
| --- | --- |
| 手机 / 电脑对话布局 | src/agent-home.tsx、src/agent-home.css |
| 会话、进度、结果卡片 | src/case-assistant.tsx |
| 查询与智能体流程 | server/case-workflow.ts |
| 中文经营条件解析 | server/case-language.ts |
| 数值、证据、排名 | server/case-evidence.ts |
| 预测、原日历与预算 | server/case-forecast.ts |
| 逐笔库存和财务 | lib/case-book.ts |
| 两份国内账套与 Excel | public/data |

## 发布

源码协作与线上部署分开。当前站点通过 Netlify 部署；Pull Request 不自动使用生产密钥或发布。
测试与构建成功后，由项目维护者部署。生产密钥在后端加密保存；45万 token 累计额度由服务端控制。
禁止提交 `.env`、管理员密码、会话访问凭证、Netlify 令牌、模型密钥或 `.local-data`。

## 下一步重点

完整问题清单见 docs/当前版本全面审查与改进方案.md。
优先完成采购审批到真实业务账本的执行闭环、更多经营问题评测及异常恢复；保持拟定边界清晰。
公开代码不代表第三方数据可以自由商用，来源与边界见 DATA_SOURCES.md。
