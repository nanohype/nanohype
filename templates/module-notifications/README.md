# module-notifications

Composable notification service with pluggable providers for email, SMS, and push.

## What you get

- Channel provider registry with self-registering notification backends
- Email channel with Resend and SendGrid providers
- SMS channel with Twilio provider (optional)
- Push notification channel with web-push provider (optional)
- Template rendering with `{{variable}}` substitution in subject and body
- Notifier facade with `send()` and `sendBatch()` for routing to the correct channel
- Type-safe notification definitions with channel-based routing

## Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `ProjectName` | string | — | Kebab-case project name |
| `Description` | string | `Notification service with pluggable providers` | Project description |
| `EmailProvider` | string | `resend` | Default email provider (resend/sendgrid or custom) |
| `IncludeSms` | bool | `false` | Include SMS channel with Twilio provider |
| `IncludePush` | bool | `false` | Include push channel with web-push provider |

## Project layout

```text
<ProjectName>/
  src/
    notifications/
      index.ts              # Main exports — createNotifier
      types.ts              # Notification, NotificationConfig, NotificationResult, NotificationTemplate
      template.ts           # Template rendering with {{variable}} substitution
      channels/
        types.ts            # ChannelProvider interface
        registry.ts         # Channel registry (register, get, list)
        email/
          resend.ts         # Resend email provider
          sendgrid.ts       # SendGrid email provider
          index.ts          # Barrel import — triggers self-registration
        sms/                # (conditional — IncludeSms)
          twilio.ts         # Twilio SMS provider
          index.ts          # Barrel import
        push/               # (conditional — IncludePush)
          web-push.ts       # Web Push provider
          index.ts          # Barrel import
        index.ts            # Master barrel — imports email + conditionally sms/push
      __tests__/
        template.test.ts
        registry.test.ts
  package.json
  tsconfig.json
```

## Pairs with

- [ts-service](../ts-service/) — add notifications to a service
- [module-queue](../module-queue/) — queue async notification delivery
- [module-auth](../module-auth/) — authenticate notification API endpoints

## Nests inside

- [monorepo](../monorepo/)
