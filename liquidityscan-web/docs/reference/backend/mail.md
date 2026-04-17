# Mail service

## `MailService`
**File:** [`backend/src/mail/mail.service.ts`](../../../backend/src/mail/mail.service.ts):6-62  
**Kind:** `@Injectable` class  

**Purpose:** Send HTML email via Nodemailer; log every attempt to `EmailLog`.

### Constructor
**Side effects:** Creates `nodemailer.createTransport` with `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_USER`, `SMTP_PASS`. If `createTransport` missing, logs warning and leaves `transporter` null.

### `sendMail`
**Signature:** `async sendMail(args: { to: string; subject: string; html: string }): Promise<void>`  
**Purpose:** Send one message; persist success or failure to `email_logs`.

**Inputs:**
- `from`: `SMTP_FROM` or `SMTP_USER` (required).
- Throws if transporter not initialized.

**Outputs / Side effects:**
- `transporter.sendMail({ from, to, subject, html })`.
- `prisma.emailLog.create` with `status: 'sent'` or `status: 'failed'` + `error` message.

**Called by:** `PaymentsService` (confirm emails), `AdminService` (broadcast, SMTP test), other services as needed.
