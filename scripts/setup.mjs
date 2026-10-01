import {randomBytes} from 'node:crypto';import {writeFileSync,existsSync} from 'node:fs';import {passwordHash} from '../server/api.ts';
if(existsSync('.env'))throw Error('已有配置，保留现有密码；如需轮换请备份后另行操作。');
const password=randomBytes(18).toString('base64url');writeFileSync('.env',`ADMIN_PASSWORD_HASH=${passwordHash(password)}\nSESSION_SECRET=${randomBytes(48).toString('hex')}\n`,{mode:0o600});writeFileSync('管理员登录信息.txt',`管理地址：部署网址后加 /admin\n管理员密码：${password}\n\n此文件不要上传或公开分享。\n`,{mode:0o600});console.log('已生成本地服务器配置和管理员登录信息.txt。密码未写入源代码或前端。');
