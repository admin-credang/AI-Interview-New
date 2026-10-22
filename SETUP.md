# Gmail OAuth setup

Gmail OAuth lets each interviewer connect their own Google account. The
refresh token is encrypted in that interviewer's user record, and candidate
invitations and hiring-decision emails are sent through that account's Gmail.

## Google Cloud

1. Enable the **Gmail API** for the Google Cloud project.
2. Configure the OAuth consent screen with these scopes:
   - `openid` and `https://www.googleapis.com/auth/userinfo.email` identify the
     Google account the interviewer connected.
   - `https://www.googleapis.com/auth/gmail.send` is the only Gmail permission;
     it allows sending messages, not reading mail.
3. If the consent screen is in Testing mode, add each interviewer as a test
   user. Google may require app verification before public production use of
   the Gmail send scope.
4. Create a **Web application** OAuth client. Add the dev frontend origin to
   **Authorized JavaScript origins**. For this repository's Vercel routing,
   add this exact browser-facing callback to **Authorized redirect URIs**:

   `https://ai-interview-new-8f5k.vercel.app/api/google-oauth/callback`

   The `/api` prefix is required: Vercel routes `/api/*` to FastAPI, and the
   backend removes that prefix before matching its `/google-oauth/callback`
   route. If the backend is deployed on a separate public host instead, use
   `https://<DEV-BACKEND-DOMAIN>/google-oauth/callback` and set the frontend's
   API base URL to that backend host. In either case, the Google Cloud URI and
   `GOOGLE_OAUTH_REDIRECT_URI` must match exactly.

## Dev deployment environment

Set these as backend environment variables in the **dev deployment**
(deployment-platform variables take precedence over `backend/.env`):

```text
GOOGLE_OAUTH_CLIENT_ID=<OAuth client ID>
GOOGLE_OAUTH_CLIENT_SECRET=<OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://ai-interview-new-8f5k.vercel.app/api/google-oauth/callback
SECRET_KEY=<long random application signing secret>
MAIL_SECRET_KEY=<long random stable secret used to encrypt saved refresh tokens>
FRONTEND_URL=https://ai-interview-new-8f5k.vercel.app
CORS_ORIGINS=https://ai-interview-new-8f5k.vercel.app
VITE_API_BASE_URL=/api
```

Use the same deployment domain in the callback URI registered in Google
Cloud. For a separate backend host, set `GOOGLE_OAUTH_REDIRECT_URI` to that
host's `/google-oauth/callback` URL instead. Keep the OAuth client secret,
`SECRET_KEY`, and `MAIL_SECRET_KEY` only in backend deployment settings; never
put them in Vite/frontend variables or commit them. Keep both keys stable:
changing `SECRET_KEY` invalidates existing app sessions, while changing
`MAIL_SECRET_KEY` makes already stored encrypted tokens unreadable.

The backend also requires its normal `DATABASE_URL` setting.
For a same-domain Vercel frontend, set `VITE_API_BASE_URL=/api`; for a
separately hosted backend, set it to the backend base URL. Rebuild/redeploy the
frontend after changing its Vite variable.

`Settings` loads `backend/.env` regardless of the backend process working
directory, but deployed services should use their environment-variable
settings. `FRONTEND_URL` is required for Gmail OAuth redirects; set it to
`http://localhost:5173` locally. For local development, register
`http://localhost:8000/google-oauth/callback` in Google Cloud and set that
exact value as `GOOGLE_OAUTH_REDIRECT_URI` in `backend/.env`.

## Connecting and sending

In **Dashboard → Interview Controls**, each interviewer selects **Connect
Gmail** and authorizes the account they want to send from. That Google account
can differ from the email used to sign in to the interview app. The encrypted
refresh token is stored on that interviewer's `users` record. Candidate mail
uses the connected Gmail identity; a Gmail send failure is reported instead
of silently sending from a different system account.
