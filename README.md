# My List

Dailies and todos kept in a file you own. The list stays in this browser, and Source can save it as one JSON file or in one Google Drive file.

The screen uses the same colors as My Git. The mark is the same shield, with a list inside it.

## Run

```bash
npm install
npm run dev
```

## Google Drive

Drive is optional. Local file stays the source until you sign in. The app uses the `drive.file` scope, so it only sees the one `my-list.json` it creates.

To turn on sign-in:

1. In Google Cloud Console, enable the Google Drive API.
2. Set up the OAuth consent screen. While it is in testing, add your Google account as a test user.
3. Create an OAuth client ID of type Web application.
4. Add `http://127.0.0.1:5173` and `http://localhost:5173` as authorized JavaScript origins.
5. Copy `.env.example` to `.env.local` and set the client id:

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Restart `npm run dev`. Then choose Source → Google Drive.
