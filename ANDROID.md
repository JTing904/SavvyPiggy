# Android App 指南 (SavvyPiggy)

用 Capacitor 把现有的网页 app 套进原生壳,编译出真的 `.apk`。
**网页代码 100% 复用** —— `components/`、`services/` 那些一个字都没改成原生。

- 包名(applicationId):`com.savvypiggy.app`
- 最低支持:Android 7.0(API 24)
- 目标:API 36

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run android:apk` | 构建网页 → 同步进 android/ → 编译 debug APK |
| `npm run android:open` | 同上,然后打开 Android Studio(想用模拟器/真机调试时用) |
| `npm run android:sync` | 只同步,不编译(改完网页代码后必须跑) |
| `npm run icons` | 重新生成图标和启动图 |
| `npm run android:release` | 编译**已签名的 release APK**,用来发给别人 |

APK 出在:`android/app/build/outputs/apk/debug/app-debug.apk`

**改了网页代码之后 `android:sync` 是必须的** —— APK 里装的是 `dist/` 的快照,
不同步的话手机上还是旧版本。

## 装到手机上

**方法一:USB**
1. 手机进「设置 → 关于手机」,连点 7 次「版本号」打开开发者模式
2. 「开发者选项」里打开 **USB 调试**
3. 插上电脑,`npm run android:open` → Android Studio 里选你的手机 → 点绿色 ▶

**方法二:直接传 APK**
把 `app-debug.apk` 用微信/QQ/U盘传到手机,点开安装(要允许「安装未知来源应用」)。
这个方法可以发给别人装。

---

## Google 登录:需要多做三步

Email/密码登录**开箱即用**,不用配任何东西。

但 Google 登录在 WebView 里弹不出窗口 —— [contexts/AuthContext.tsx](contexts/AuthContext.tsx)
已经改成:在手机上走原生的 Google 登录面板,拿到 ID token 之后再交给 Firebase JS SDK
(`skipNativeAuth: true`),这样 Firestore 那边的登录状态还是同一套。

**没做下面三步的话,手机上点 Google 登录会报错。Email/密码不受影响。**

### 1. 在 Firebase 注册 Android 应用

Console → 项目设置 → 您的应用 → **添加应用 → Android**(就是你之前打开的那页)

- **Android 软件包名称**:`com.savvypiggy.app` ← 必须一字不差
- 应用别名:随便填,例如 `SavvyPiggy Android`
- **调试签名证书 SHA-1**:填下面这个

```
D1:83:4D:29:31:DA:F0:32:01:54:8F:7C:68:6E:4B:D7:00:1C:A6:25
```

> 这是**你这台电脑**的 debug 签名指纹,我用 `node scripts/build-apk.mjs signingReport`
> 读出来的。换电脑就会变,重新跑那条命令拿新的。
> 以后要上架 Play Store,还得把 release 签名的 SHA-1 也加进去。

### 2. 下载 google-services.json

注册完会让你下载 `google-services.json`,把它放到:

```
android/app/google-services.json
```

Capacitor 生成的 gradle 已经写好了条件判断:这个文件在就自动启用,不在就跳过。
所以放进去就行,不用改任何 gradle。

### 3. 重新编译

```bash
npm run android:apk
```

---

## 图标和启动图

图标是代码画的,源文件在 [scripts/make-icons.mjs](scripts/make-icons.mjs)
(薄荷绿到青色渐变 + 深色存钱罐,跟 app 里的配色一致)。

想改的话编辑那个脚本,然后:

```bash
npm run icons
npm run android:apk
```

生成的中间产物在 `assets/`,各密度的成品在 `android/app/src/main/res/`。

## 状态栏

targetSdk 36 强制 edge-to-edge —— 网页内容会画到状态栏底下。
处理方式:

- `index.html` 已经有 `viewport-fit=cover`
- 每个页面都用了 `safe-pt` / `safe-pb`(即 `env(safe-area-inset-*)`)撑开安全区
- `android/app/src/main/res/values/styles.xml` 里强制了 `windowLightStatusBar=false`,
  因为这个 app 永远是深色的,系统图标必须是浅色才看得见

如果实机上发现顶部还是被状态栏压住,先检查那个页面有没有 `safe-pt`。

## 发布给别人:release APK

```bash
npm run android:release
```

产物在 `android/app/build/outputs/apk/release/app-release.apk`,已经用发布密钥签好名,
可以直接发给任何人(微信 / 网盘 / U 盘都行)。对方点开安装时,系统会问要不要允许
「安装未知来源应用」,同意即可。

### 签名密钥

密钥和密码在这两个文件,**都已经被 gitignore,不会进仓库**:

```
android/savvypiggy-release.keystore   密钥本体
android/keystore.properties           密码
```

**务必把这两个文件备份到别的地方**(网盘 / U 盘 / 密码管理器)。Android 不允许用
不同的签名覆盖安装同一个包名的应用 —— 密钥丢了之后,你发的新版本别人装不上去,
只能先卸载旧版(数据在云端,重新登录就回来,但体验很差)。以后要上 Play Store 更是
完全没法更新。

换电脑时把这两个文件复制到新机器的 `android/` 目录下即可,不用重新生成。

如果 `keystore.properties` 不存在(比如新 clone 的仓库),release 构建会自动跳过签名配置,
只能出 debug 包 —— 这是刻意的,免得构建脚本在别人机器上报一堆看不懂的错。

### 每个签名都要单独登记 SHA-1

Google 登录按「包名 + 签名指纹」验证,所以 **debug 和 release 是两套**,两个都要加到
Firebase 的 Android 应用里,否则那一版的 Google 登录会静默失败(报
`activity is cancelled by the user`)。

| 用途 | SHA-1 |
|---|---|
| Debug(你本机开发) | `D1:83:4D:29:31:DA:F0:32:01:54:8F:7C:68:6E:4B:D7:00:1C:A6:25` |
| **Release(发给别人的包)** | `47:25:E6:7B:21:C2:32:AE:00:0F:3F:DF:2A:D2:63:5A:4F:E3:09:50` |

加完记得**重新下载 `google-services.json`** 覆盖 `android/app/`,再重新构建。

想自己确认指纹,跑 `node scripts/build-apk.mjs signingReport`。

### 发新版本

改 `android/app/build.gradle` 里的 `versionCode`(每次 +1)和 `versionName`,
再跑 `npm run android:release`。别人直接覆盖安装即可,数据不受影响。

## 环境说明

构建脚本 [scripts/build-apk.mjs](scripts/build-apk.mjs) 会自动处理:

- 找不到 `JAVA_HOME` 就用 Android Studio 自带的 JDK 21
- 没有 `android/local.properties` 就按 `ANDROID_HOME` 或默认位置自动生成

所以理论上 clone 下来直接 `npm install && npm run android:apk` 就能出包,
前提是装了 Android Studio。

## 常见问题

| 问题 | 原因 |
|---|---|
| 手机上还是旧版本 | 改完网页代码没跑 `android:sync` |
| Google 登录报错,Email 正常 | 上面那三步没做完 |
| `SDK location not found` | 没装 Android SDK,或 `ANDROID_HOME` 没设 |
| `Unsupported class file major version` | JDK 版本太新,让脚本自己找 Android Studio 的 JDK 21 |
| 打开是白屏 | `.env.local` 的 Firebase config 没填 —— 会显示 "Firebase not configured" |
