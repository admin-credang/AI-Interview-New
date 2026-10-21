# Gmail OAuth setup (interviewer Gmail -> candidate mail)

## 1. Google Cloud (project-la already irukku)
1. APIs & Services -> Library -> **Gmail API** -> Enable.
2. Google Auth Platform -> Data Access -> Add scope: `.../auth/gmail.send`
   (+ `openid`, `userinfo.email`).
3. Audience: Testing mode-la irundha, interviewers-oda Gmail ids-ah **Test users**-la add pannu
   (illa-na "App not verified / access blocked" varum). Publish pannina gmail.send "sensitive scope"
   -> Google verification venum.
4. Credentials -> **AI Interview Gmail OAuth** ->
   - Authorized JavaScript origins: `http://localhost:5173`, `https://YOUR-APP.vercel.app`
   - Authorized redirect URIs: `http://localhost:8000/google-oauth/callback`
     and `https://YOUR-BACKEND/google-oauth/callback`  (GOOGLE_OAUTH_REDIRECT_URI-oda exact same irukanum)
5. Client ID + Client Secret-ah backend `.env`-la mattum vai (frontend-la vendaam).

## 2. Backend
- `.env`-la `.env.example` values add pannu. `pip install cryptography` (already irundha skip).
- Restart -> `users` table-la `gmail_email`, `gmail_refresh_token_enc` columns auto-create aagum.

## 3. Frontend
- `src/` folder-ah un Vite project-la replace pannu.
- Vercel: `VITE_API_BASE_URL` = backend URL. `vercel.json` (SPA rewrite) project root-la vai.
- Deploy: `npx vercel --prod`  (nee login panna venum).

## 4. Use
Dashboard -> Interview Controls -> **Connect Gmail** -> login pannina same Gmail select pannu -> Allow.
Ippo invite / selected / rejected mails andha Gmail-la irundhu pogum (Gmail API, SMTP port thevai illa).
Different Gmail select pannina reject aagum.
