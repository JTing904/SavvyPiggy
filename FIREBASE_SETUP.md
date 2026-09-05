# Firebase 设置指南 (SavvyPiggy)

代码已经全部接好了。你只需要在 Firebase Console 建项目、拿 config、填进 `.env.local`。
整个流程大概 10 分钟。

---

## 1. 建 Firebase 项目

1. 去 https://console.firebase.google.com/ ,用 Google 账号登录
2. 点 **Add project / 添加项目**
3. 项目名填 `savvypiggy`(会自动生成一个 ID,例如 `savvypiggy-3f21`,记下来)
4. Google Analytics 可以关掉(不需要)
5. 等它建好,点 **Continue**

## 2. 加一个 Web App,拿到 config

1. 项目首页中间有一排图标,点 **`</>`**(Web)
2. App nickname 填 `SavvyPiggy Web`
3. **不要**勾 "Also set up Firebase Hosting"(等下我们用 CLI 弄)
4. 点 **Register app**
5. 下一页会显示一段 `firebaseConfig`,像这样:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyD...",
     authDomain: "savvypiggy-3f21.firebaseapp.com",
     projectId: "savvypiggy-3f21",
     storageBucket: "savvypiggy-3f21.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456"
   };
   ```

   **先别关这页。**

## 3. 填 .env.local

在项目根目录建一个 `.env.local` 文件(可以直接复制 `.env.local.example`):

```bash
cp .env.local.example .env.local
```

把上面 config 的六个值一一填进去:

```
VITE_FIREBASE_API_KEY=AIzaSyD...
VITE_FIREBASE_AUTH_DOMAIN=savvypiggy-3f21.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=savvypiggy-3f21
VITE_FIREBASE_STORAGE_BUCKET=savvypiggy-3f21.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
VITE_USE_FIREBASE_EMULATOR=false
```

> 这些值是**公开**的,放进前端 bundle 没问题 —— 真正的保护来自 `firestore.rules` 和
> `storage.rules`。`.env.local` 已经被 `.gitignore` 挡住,不会进 git。

## 4. 开启 Authentication

1. 左边菜单 **Build → Authentication → Get started**
2. 在 **Sign-in method** 分页,逐个启用:
   - **Email/Password** → Enable → Save
   - **Google** → Enable → 选一个 support email → Save
3. 在 **Settings → Authorized domains**,确认 `localhost` 在列表里(默认就有)

## 5. 开启 Firestore

1. 左边菜单 **Build → Firestore Database → Create database**
2. 位置选 **asia-southeast1 (Singapore)** —— 马来西亚用这个最快
3. 模式选 **Start in production mode**(等下我们会用 CLI 部署自己的 rules)
4. 点 Create

## 6. 开启 Storage(可选 —— 需要付费方案,默认关闭)

Storage 需要项目升级到 **Blaze**(按量付费)方案,要绑信用卡。免费额度依然很大
(5 GB 存储 / 1 GB/天 下载),但如果不想绑卡就**跳过这一整节**。

默认 `.env.local` 里 `VITE_ENABLE_STORAGE=false`,所以:

- CreateGoal 页面**不会显示**上传封面图的按钮
- 每个目标会按名字自动配一张 picsum 图(同名 = 同图,不同目标图不一样)
- 其它功能 100% 正常

**以后想开的话**:

1. 左边菜单 **Build → Storage → Get started**,升级 Blaze,位置跟 Firestore 一样
2. `npm run deploy:rules:storage` 推 `storage.rules`
3. `.env.local` 里改成 `VITE_ENABLE_STORAGE=true`,重启 dev server

## 7. 装 Firebase CLI 并部署安全规则

```bash
npm install -g firebase-tools
firebase login
```

把 `.firebaserc` 里的 `REPLACE_WITH_YOUR_PROJECT_ID` 改成你的真实 project ID,
或者直接跑:

```bash
firebase use --add
```

然后部署规则:

```bash
npm run deploy:rules
```

这会把 `firestore.rules` 推上去。规则的核心是:
**每个用户只能读写 `users/{自己的uid}/` 底下的数据**,别人一个字都碰不到。

> `storage.rules` 是单独的一条命令 `npm run deploy:rules:storage`,
> 只有在你开了 Storage(第 6 步)之后才需要跑。没开就别跑,会报错。

## 7.5 建邀请码

App 是**邀请制**的:任何人都可以注册账号,但没有兑换过邀请码之前,
安全规则不让他读写**任何**数据 —— 所以不会吃你的额度。

一个码只能用一次,兑换后就锁死。建码的方法:

1. Console → **Firestore Database → 数据**
2. 点 **+ 启动集合**,集合 ID 填 `invites`,点下一步
3. **文档 ID 就是邀请码本身**,例如 `SAVVY-A7K2`
   (只能用大写字母、数字、`-`、`_`,4~64 个字符)
4. 随便加一个字段留个备注,例如 `note` (string) = `给阿明`
5. 点保存

之后要多几个码,在 `invites` 集合里点 **+ 添加文档**,重复第 3~5 步。

**不要**自己填 `claimedBy` 字段 —— 那是兑换的时候由 app 自动写进去的。
想看谁用了哪个码,回来看 `claimedBy`(uid)和 `claimedAt`(时间戳)就行。
要收回一个码,把整个文档删掉即可(已经兑换过的人不受影响)。

## 8. 跑起来

```bash
npm run dev
```

打开 http://localhost:3000 ——

- 如果 `.env.local` 没填好,会看到一个黄色的 "Firebase not configured" 提示页
- 填好了就会看到登录页。注册一个账号 → 会跳到 **Invite only** 页 →
  输入你在第 7.5 步建的码 → 解锁 → 进 **Profile** 分页 →
  点 "Add three sample goals" 建三个测试目标 → 回首页存一笔钱
- 回 Firebase Console 的 Firestore,应该能看到
  `users/{uid}/banks` 和 `users/{uid}/activities` 有数据了

## 9. Android App

网页跑通之后,`npm run android:apk` 就能出 APK。
Google 登录在手机上要额外注册 Android 应用 + 填 SHA-1 ——
完整说明看 [ANDROID.md](ANDROID.md)。

## 10. 网页部署上线(可选)

```bash
npm run deploy:hosting
```

第一次跑会问你要不要初始化 hosting,`firebase.json` 已经写好了所以直接确认即可。
部署完会给你一个 `https://<project-id>.web.app` 的网址。

**上线后记得**:回 Console → Authentication → Settings → Authorized domains,
把 `<project-id>.web.app` 加进去,否则 Google 登录会报
`auth/unauthorized-domain`。

---

## 本地 Emulator(可选)

不想碰真数据库的时候,可以用本地模拟器:

```bash
firebase emulators:start
```

然后把 `.env.local` 里的 `VITE_USE_FIREBASE_EMULATOR` 改成 `true`,重启 `npm run dev`。
Emulator UI 在 http://localhost:4000。

---

## 数据结构

```
invites/{CODE}                       邀请码。文档 ID 就是码本身。
                                     claimedBy: uid|null, claimedAt: number
members/{uid}                        已兑换的凭证。{ code, joinedAt }
                                     规则拿它当"这人有权限"的唯一依据。

users/{uid}                          用户 profile (displayName, email, photoURL…)
  ├── banks/{bankId}                 PiggyBank: name, targetAmount, currentAmount,
  │                                             splitPercentage, icon, imageUrl,
  │                                             isLocked, createdAt
  └── activities/{activityId}        Activity: type, date, amount, distributions[]

Storage: users/{uid}/goals/{uuid}.jpg    目标封面图
```

### 邀请码为什么绕不过去

`members/{uid}` 只能在**同一个 batch write** 里跟「把一个未使用的码标记成自己的」
一起创建 —— 规则用 `getAfter()` 检查那次写入的结果。所以:

- 自己手动建 `members/{uid}` → 拒绝(没有对应的码被消费)
- 抢一个别人用过的码 → 拒绝(`claimedBy` 已经不是 null)
- 直接调 REST API 跳过前端 → 一样拒绝,规则在服务端
- 没兑换就写 `users/{uid}/...` → 拒绝

规则有一套测试守着,改完规则跑 `npm run test:rules`(需要 Java + firebase-tools)。

### 额度说明

规则里的 `isMember()` 用了 `exists()`,这会算一次计费读取。Firestore 免费额度是
**5 万次读 / 天**,自己几个人用远远撑不满。

## 常见错误

| 错误 | 原因 |
|---|---|
| `auth/operation-not-allowed` | 第 4 步那个登录方式没启用 |
| `auth/unauthorized-domain` | 当前域名不在 Authorized domains 里 |
| `Missing or insufficient permissions` | 规则还没部署,跑 `npm run deploy:rules` |
| `storage/unauthorized` | Storage 没开却把 `VITE_ENABLE_STORAGE` 设成了 true |
| 页面显示 "Firebase not configured" | `.env.local` 有值没填,或改完没重启 dev server |
| 登录后卡在 "Invite only" | 正常 —— 去 Console 的 `invites` 集合建一个码 |
| `No such invite code` | 码打错了,或 Firestore 里的文档 ID 不是大写 |
