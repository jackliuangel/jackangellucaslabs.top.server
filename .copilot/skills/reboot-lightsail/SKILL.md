---
name: reboot-lightsail
description: '重启 AWS Lightsail 实例（Ubuntu 服务器）。Use when: 需要重启、reboot Lightsail 虚拟机/服务器实例；重启 Ubuntu-1 服务器；Lightsail 实例异常、无响应、SSH 连不上时需要重启。重启属于带外管理（out-of-band），优先用 AWS CLI / 控制台，不依赖服务器本身的 SSH。'
user-invocable: true
---

# 重启 AWS Lightsail 实例

## When to Use
- 用户要求重启 AWS Lightsail 服务器 / 实例
- Ubuntu-1 实例异常、无响应、**SSH 连不上**（这正是需要带外重启的典型场景）

## 核心思路
重启是**带外管理（out-of-band）**——通过 AWS 控制面 API 操作，不依赖服务器本身。
服务器挂了、SSH 连不上、网络异常时，**AWS CLI / 控制台仍然有效**。

## 实例信息

| 项目 | 值 |
|------|-----|
| 实例名 | `Ubuntu-1` |
| 区域 | **ap-southeast-1（新加坡，Zone A）** |
| 静态 IP | `47.128.3.198` |
| 配置 | 512 MB RAM / 2 vCPUs / 20 GB SSD |
| 系统 | Ubuntu |

## Procedure

### 方案 1：AWS CLI（✅ 首选，可编程、无需浏览器）
需要有效的 IAM Access Key（已配置在 `~/.aws/credentials` 的 `lightsail-tmp` profile，长期有效）：

```bash
# 1. 先验证凭据有效（列出实例状态）
aws lightsail get-instances --profile lightsail-tmp --region ap-southeast-1 \
  --query "instances[].{name:name,state:state.name,ip:publicIpAddress}" --output table

# 2. 重启实例
aws lightsail reboot-instance --instance-name Ubuntu-1 --profile lightsail-tmp --region ap-southeast-1

# 3. 等待重启完成（约 30-60 秒），轮询状态直到 Running
aws lightsail get-instance --instance-name Ubuntu-1 --profile lightsail-tmp --region ap-southeast-1 \
  --query "instance.state.name" --output text
```

> ✅ **Access Key 状态**：2026-08-02 已创建长期 key（AKIA36AZBDWPO5HFA355）并验证可用。
> - 如果报 `UnrecognizedClientException` → key 可能被删除/轮换，需重新创建（见下方"配置说明"）

### 方案 2：浏览器控制台（备选，需要账号密码）
1. 打开 `https://ap-southeast-1.console.aws.amazon.com/lightsail/`
2. 登录：用户名 `jack_iam_user`（Account ID `820391255454`），密码询问用户
3. 如遇 MFA 验证码，询问用户
4. 进入 `Instances` → 点击 `Ubuntu-1`
5. 确认区域为 **Singapore, Zone A (ap-southeast-1a)**
6. 点击 **Reboot** → 确认对话框 → **Reboot**
7. 等待实例状态恢复 `Running`

### 方案 3：SSH 重启（仅当 SSH 还能连上时）
```bash
ssh lightsail "sudo reboot"
```
> ⚠️ 注意：服务器如果已经挂了，SSH 连不上，此方案无效，改用方案 1 或 2。

## 配置说明：创建长期 Access Key（推荐）
临时 key 会过期，频繁重建很麻烦。创建 IAM 长期 access key 一次配置，长期可用：

1. AWS 控制台 → IAM → 用户 `jack_iam_user` → **Security credentials**
2. 点击 **Create access key** → 选择 "Command Line Interface (CLI)"
3. 复制 Access Key ID 和 Secret Access Key
4. 更新 `~/.aws/credentials`：
   ```ini
   [lightsail-tmp]
   aws_access_key_id = AKIA...
   aws_secret_access_key = ...
   region = ap-southeast-1
   ```
5. 验证：`aws lightsail get-instances --profile lightsail-tmp --region ap-southeast-1`

## 常见问题
- **UnrecognizedClientException**：临时 key 过期 → 重新创建/刷新
- **SSH 连不上**：这是重启的触发原因，改用 AWS CLI / 控制台
- **重启后服务未恢复**：SSH 恢复后检查 `systemctl status nginx`、`pm2 list`
