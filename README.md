# 📨 MailWave

A self-contained **email system** — compose and send email over SMTP, manage a
contact list, save reusable templates, run campaigns to many recipients, and
track everything you've sent. Runs with one command; no database server to set
up.

> MailWave is an **original project** inspired by the feature set of
> platforms like Notifuse (contacts, templates, campaigns, transactional
> sending, delivery tracking). It shares **no code** with any third-party
> product and carries no third-party license obligations.

## Features

- **Compose** — send a single transactional email to one recipient.
- **Campaigns** — send to all contacts or a chosen subset, with
  `{{name}}` / `{{email}}` personalization.
- **Contacts** — add, list, and remove recipients.
- **Templates** — save reusable subject + HTML bodies and load them into any send.
- **History** — every send is logged with status and (in preview mode) a link
  to view the rendered message.
- **Flexible delivery** — real SMTP when configured, automatic **preview inbox**
  fallback (Ethereal) so it's testable with zero setup.

## Tech

- **Backend:** Node.js + Express, [Nodemailer](https://nodemailer.com) for SMTP.
- **Storage:** simple JSON files under `data/` (no external database).
- **Frontend:** plain HTML/CSS/JS — no build step.

## Quick start

```bash
npm install
cp .env.example .env      # optional — see below
npm start
```

Then open <http://localhost:3000>.

### Delivery modes

MailWave picks a delivery mode automatically:

| Mode | When | What happens |
| --- | --- | --- |
| **SMTP** | `SMTP_HOST` is set in `.env` | Real email is sent through your provider. |
| **Preview** | No SMTP configured | A throwaway [Ethereal](https://ethereal.email) inbox is used; each send returns a preview URL. Nothing reaches real inboxes. |
| **Log only** | No network for the preview service | Messages are logged to the console; nothing is sent. |

To send **real** email, copy `.env.example` to `.env` and fill in your
provider's SMTP details, then restart:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password        # Gmail requires an App Password
MAIL_FROM_NAME=MailWave
MAIL_FROM_EMAIL=you@gmail.com
```

Common providers: Gmail (`smtp.gmail.com:465`), Outlook
(`smtp.office365.com:587`), SendGrid (`smtp.sendgrid.net:587`, user `apikey`),
Mailgun (`smtp.mailgun.org:587`).

## API

All endpoints return JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service check |
| `GET` | `/api/settings` | Delivery mode + transport status |
| `GET/POST/PUT/DELETE` | `/api/contacts` | Manage contacts |
| `GET/POST/PUT/DELETE` | `/api/templates` | Manage templates |
| `POST` | `/api/send` | Send one transactional email |
| `POST` | `/api/campaigns/send` | Send a campaign to contacts |
| `GET` | `/api/emails` | Sent history |

Example — send one email:

```bash
curl -X POST http://localhost:3000/api/send \
  -H 'Content-Type: application/json' \
  -d '{"to":"person@example.com","subject":"Hi","html":"<p>Hello!</p>"}'
```

## Project layout

```
server/
  index.js     Express app + routes
  mailer.js    Nodemailer transport (SMTP + preview fallback)
  db.js        JSON file storage
public/
  index.html   UI
  styles.css
  app.js
```

## License

MIT — see `package.json`.
