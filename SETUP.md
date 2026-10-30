# Local and Vercel environment configuration

The production frontend is `https://ai-interview-version-b.vercel.app`. Keep
local settings in `backend/.env` and `frontend/.env.local`; configure production
values in the Vercel project settings. Do not copy production credentials into
local files or commit secret values.

## Local development

Use the following URL settings in `backend/.env`:

```text
FRONTEND_BASE_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/google-oauth/callback
```

Create `frontend/.env.local` from `frontend/.env.example`:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Start the backend on port `8000` and the Vite frontend on port `5173`.
The backend permits the local Vite origins only outside Vercel.

## Vercel production settings

Configure these backend variables in Vercel. The frontend and backend share a
Vercel domain, so `/api` is routed to FastAPI by `vercel.json`.

```text
FRONTEND_BASE_URL=https://ai-interview-version-b.vercel.app
CORS_ORIGINS=https://ai-interview-version-b.vercel.app
GOOGLE_OAUTH_REDIRECT_URI=https://ai-interview-version-b.vercel.app/api/google-oauth/callback
```

The tracked `frontend/.env.production` sets the same-origin API route for
production builds. Set this frontend build variable in Vercel as well to make
the deployment setting explicit:

```text
VITE_API_BASE_URL=/api
```

Vercel build variables override the tracked production default. If using a
separately hosted backend, set this to that backend's absolute public HTTPS URL
and set the backend `CORS_ORIGINS` accordingly. The local `.env.local` value is
overridden by `.env.production` for production builds.
Production frontend builds reject `localhost` API URLs, and backend-generated
links reject a localhost `FRONTEND_BASE_URL` on Vercel.

Also configure the application's normal backend variables, including
`DATABASE_URL`, `SECRET_KEY`, `OPENAI_API_KEY`, and any enabled mail, Dialogflow,
Google OAuth, and voice integrations. Missing `DATABASE_URL` prevents backend
startup; Gmail OAuth requires its client ID, client secret, redirect URI, and
`FRONTEND_BASE_URL`.

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
4. Create a **Web application** OAuth client. Add the local and production
   frontend origins to **Authorized JavaScript origins**. Add the callbacks
   used by the relevant environment to **Authorized redirect URIs**:

```text
https://ai-interview-version-b.vercel.app/api/google-oauth/callback
http://localhost:8000/google-oauth/callback
```

The `/api` prefix on the Vercel callback is required: Vercel routes `/api/*`
to FastAPI, and the backend removes that prefix before matching its
`/google-oauth/callback` route. The configured
`GOOGLE_OAUTH_REDIRECT_URI` must exactly match the URI used for that
environment. For a separately hosted backend, use that host's
`/google-oauth/callback` URL instead.

Keep the OAuth client secret, `SECRET_KEY`, and `MAIL_SECRET_KEY` only in
backend settings; never put them in Vite/frontend variables or commit them.
Keep `SECRET_KEY` and `MAIL_SECRET_KEY` stable: changing them invalidates
application sessions or makes saved encrypted tokens unreadable.

## Connecting and sending

In **Dashboard → Interview Controls**, each interviewer selects **Connect
Gmail** and authorizes the account they want to send from. That Google account
can differ from the email used to sign in to the interview app. The encrypted
refresh token is stored on that interviewer's `users` record. Candidate mail
uses the connected Gmail identity; a Gmail send failure is reported instead
of silently sending from a different system account.
