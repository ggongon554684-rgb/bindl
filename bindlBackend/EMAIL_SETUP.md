# Email Configuration Guide

The Bindl backend sends transactional emails for:

- Contract invitations to Party B
- Notifications when Party B locks funds
- Notifications when funds are released
- Dispute notifications

## Configuration Options

### Option 1: Gmail SMTP (Development/Testing)

**Pros:** Free, easy setup  
**Cons:** Less reliable for production, rate limits

**Steps:**

1. Enable 2-Step Verification on your Google Account: https://myaccount.google.com/security

2. Generate an app-specific password:

   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer" (or your device type)
   - Google will generate a 16-character password

3. Update your `.env` file:

   ```env
   MAIL_USERNAME=your-email@gmail.com
   MAIL_PASSWORD=your-16-char-app-password
   MAIL_FROM=your-email@gmail.com
   MAIL_SERVER=smtp.gmail.com
   MAIL_PORT=587
   ```

4. Test the configuration by creating a contract—you should receive an invitation email.

**Troubleshooting:**

- `535 Username and Password not accepted` → Check that you used the **app password**, not your Google password
- `534 Application-specific password required` → 2FA is enabled but you didn't use an app password
- Emails not arriving? → Check your spam folder or Gmail's security log at https://myaccount.google.com/security-checkup

---

### Option 2: SendGrid (Recommended for Production)

**Pros:** Highly reliable, excellent deliverability, detailed analytics  
**Cons:** Requires paid account (free tier available)

**Steps:**

1. Create a SendGrid account: https://sendgrid.com

2. Verify a sender email (SendGrid will send a confirmation email)

3. Create an API key:

   - Go to Settings → API Keys
   - Click "Create API Key"
   - Choose "Restricted Access"
   - Enable "Mail Send" permission
   - Copy the generated API key (looks like `SG.xxxxx...`)

4. Update your `.env` file:

   ```env
   MAIL_USERNAME=apikey
   MAIL_PASSWORD=SG.your-api-key-here
   MAIL_FROM=verified-email@yourdomain.com
   MAIL_SERVER=smtp.sendgrid.net
   MAIL_PORT=587
   ```

5. Restart the backend and test by creating a contract.

**Troubleshooting:**

- Check SendGrid's Activity Feed to see delivery logs
- Verify your sender email domain in SendGrid settings

---

### Option 3: Mailgun

**Pros:** Powerful, good documentation, pay-as-you-go  
**Cons:** Requires setup and verification

**Steps:**

1. Create a Mailgun account: https://mailgun.com

2. Verify a sending domain or use the free sandbox domain

3. Get SMTP credentials:

   - Go to Sending → Domain Settings
   - Scroll to "SMTP Credentials"
   - Copy the username and password

4. Update your `.env` file:
   ```env
   MAIL_USERNAME=postmaster@your-domain.mailgun.org
   MAIL_PASSWORD=your-mailgun-password
   MAIL_FROM=noreply@your-domain.mailgun.org
   MAIL_SERVER=smtp.mailgun.org
   MAIL_PORT=587
   ```

---

### Option 4: Disable Email (Development Only)

If you want to skip email configuration for now, you can leave the email settings empty:

```env
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM=
```

The backend will log warnings instead of sending emails, and the workflow will continue to work—Party B will just need to access the contract directly via the link.

---

## Testing Email Configuration

After updating your `.env` file:

1. Restart the backend: `python start_server.py`

2. Create a new contract with Party B's email

3. Check if the invitation email arrives in 30 seconds

4. If it doesn't arrive, check the backend logs for error messages

---

## Production Recommendations

- **Use SendGrid** for the best combination of reliability and ease of use
- **Enable custom domain** to improve email reputation
- **Monitor bounce rates** and update email addresses if they bounce
- **Use environment-specific sender addresses** (e.g., `noreply-dev@domain.com` for dev, `noreply@domain.com` for prod)
- **Implement retry logic** for failed sends (currently the backend logs errors but doesn't retry)

---

## Additional Resources

- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)
- [SendGrid SMTP Setup](https://docs.sendgrid.com/for-developers/sending-email/smtp-service)
- [Mailgun SMTP Documentation](https://documentation.mailgun.com/en/latest/api-smtp.html)
