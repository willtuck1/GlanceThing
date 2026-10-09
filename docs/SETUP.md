# GlanceThing (tabs edition): setup guide

This turns a Spotify Car Thing into a small dashboard with five tabs you
swipe between: **Calendar**, **To-do**, **Sports**, **Fantasy** and the
original **Spotify** controls. Calendar and To-do come from your own Google
account. Sports scores come from ESPN and need no account. Fantasy shows
your Sleeper fantasy football matchup and only needs your Sleeper username.

You need:

- A Spotify Car Thing and a USB cable that carries data.
- A Windows or macOS computer that stays on while you use the Car Thing.
  The Car Thing gets all its data from this computer over USB.
- A Google account (for Calendar and To-do).

No developer tools are needed. The whole setup takes about 20 minutes, most
of it in step 1.

## 1. Flash the Car Thing (once)

The Car Thing needs custom firmware before GlanceThing can run on it. You
only do this once per device.

1. Download **ThingFlash** from
   <https://github.com/BluDood/ThingFlash/releases/latest> and follow its
   guided steps.
2. When it asks which image to flash, pick **Thing Labs 8.9.2**.

If your Car Thing already runs GlanceThing (upstream or this edition), skip
this step.

## 2. Install the desktop app

1. Open the **Releases** page of the GitHub repository you got this guide
   from (the "Releases" link on the right of the repository's main page, or
   [this link](../../../releases/latest)).
2. Download the file for your computer:
   - Windows: `glancething-<version>-setup.exe`
   - macOS: `glancething-<version>.dmg`
3. Run it. The first launch opens the **Setup wizard**, which:
   - links to ThingFlash if the device isn't flashed yet,
   - finds the Car Thing over USB (it downloads `adb`, Android's USB tool,
     by itself if your computer doesn't have it),
   - installs the Car Thing app over USB,
   - asks how the Spotify tab should control playback. Pick **None** if
     you only want the Calendar, To-do and Sports tabs.

### "Unknown publisher" warnings

The installers aren't code-signed (signing costs money every year), so
Windows and macOS warn you the first time. This is expected.

- **Windows** shows "Windows protected your PC" (SmartScreen). Click
  **More info**, then **Run anyway**.
- **macOS** says the app "cannot be opened because Apple cannot check it".
  Open **System Settings → Privacy & Security**, scroll down, and click
  **Open Anyway** next to GlanceThing. Then open it again and confirm.
  If macOS instead says the app "is damaged", run this once in Terminal
  and open it again:
  `xattr -dr com.apple.quarantine /Applications/GlanceThing.app`

Only do this for a download from a repository you trust.

## 3. Create a Google OAuth client (about 5 minutes)

> Skip this step if the person who sent you the app built a Google client
> into it. You can tell because **Settings → Google** says "This app has a
> built-in Google client". Go straight to step 4.

GlanceThing talks to Google with your own OAuth client, so your data goes
only between Google and your computer, and nobody else's quota or app
approval is involved.

1. Go to <https://console.cloud.google.com/> and sign in.
2. Create a project: project picker (top left) → **New project** → any
   name, e.g. "GlanceThing" → **Create**. Make sure it's selected.
3. Turn on the two APIs. Go to **APIs & Services → Library**, then search
   for each one and click **Enable**:
   - **Google Calendar API**
   - **Google Tasks API**
4. Set up the consent screen. Go to **APIs & Services → OAuth consent
   screen** (shown as **Google Auth Platform** in newer consoles) and click
   **Get started**:
   - App name: anything, e.g. "GlanceThing". Support email: yours.
   - Audience: **External**.
   - Contact email: yours. Accept the policy and **Create**.
5. Publish the app. Under **Audience**, click **Publish app** and confirm,
   so the status reads **In production**.
   **Don't skip this.** While the app is in "Testing", Google expires your
   sign-in after 7 days and the tabs ask you to reconnect every week. You
   don't need Google's verification for personal use.
6. Create the client. Go to **Clients** (or **APIs & Services →
   Credentials**) → **Create client** / **Create credentials → OAuth
   client ID**:
   - Application type: **Desktop app**
   - Name: anything → **Create**
7. Copy the **Client ID** and **Client secret** from the dialog.
8. In GlanceThing, open **Settings** (gear icon in the title bar) →
   **Google**, paste both values and click **Save**.

The Home screen of the desktop app shows a "Google is not set up" notice
with a link to this guide until this step is done.

## 4. Connect Google

1. In **Settings → Google**, click **Connect**. Your browser opens.
2. Sign in and allow access to your calendars (read-only) and tasks.
   Because the app isn't verified by Google, you'll see "Google hasn't
   verified this app". Click **Advanced → Go to GlanceThing (unsafe)**.
   That warning is about your own OAuth client from step 3.
3. The browser says "Signed in". Close the tab.
4. Back in Settings, tick the **calendars** to show (your main calendar is
   on by default) and pick the **task list** for the To-do tab.

Changes show on the Car Thing within a few seconds.

### Fantasy football (Sleeper, optional)

The **Fantasy** tab (swipe left from Sports) shows this week's Sleeper
matchup: your team against your opponent, with points for every player.
Sleeper's data is public and read-only, so there is no sign-in and no
password.

1. In GlanceThing, open **Settings → Fantasy**.
2. Type your Sleeper **username** (the one under your profile in the
   Sleeper app, not your email) and click **Save**. The app checks it with
   Sleeper.
3. If you're in more than one league this season, pick the league to show
   under **League**. With one league, it's picked for you.

The tab refreshes every 30 seconds while an NFL game is on, otherwise every
10 minutes, and whenever you switch to it. Tap **Show bench** (or turn the
dial to it and press) to see your bench. To stop using the tab, clear the
username and click **Save**.

## 5. Device checklist

Run through this once after setup to confirm everything works. Tick each
box as you go.

- [ ] **Swipe** left and right through all five tabs: Calendar, To-do,
      Sports, Fantasy, Spotify. The dots at the bottom follow.
- [ ] **Buttons 1, 2 and 3** (top row, from the left) jump to Calendar,
      To-do and Sports.
- [ ] **Dial turn** moves the highlight down and up a list. **Dial press**
      ticks the highlighted task (To-do) or stars the highlighted game
      (Sports).
- [ ] **Back** (below the dial) opens the full-screen player. Press it again
      to close.
- [ ] **M** (right-most button) opens the menu.
- [ ] **Calendar**: an event you add in Google Calendar on your computer
      appears within 5 minutes, or right away when you switch to the tab.
- [ ] **To-do**: tick a task on the Car Thing. It's ticked in Google Tasks
      on the web. Tick one on the web, and it flips on the Car Thing within
      about 30 seconds.
- [ ] **Sports**: tap a team to star it. Its games move to the top.
      Long-press a game to star or unstar both teams.
- [ ] **Fantasy**: the totals match the Sleeper app. Turn the dial to
      **Show bench** and press it, and the bench opens.
- [ ] **Offline**: turn off the computer's Wi-Fi or unplug its network
      cable. Within a few minutes the tabs show an orange "Updated <time>"
      badge and keep the last data. Turn the network back on, and the badge
      goes away on the next refresh.

## What the Car Thing is telling you

| On the device | Meaning | What to do |
|---|---|---|
| Orange badge "Updated 3:04 PM" | The last refresh failed. You're seeing data from that time. | Usually nothing. It retries on its own. |
| Orange badge "No data yet" | Nothing has loaded since the app started. | Wait a minute. Check the computer's internet. |
| "The computer is offline. Retrying" | The computer can't reach the internet. | Check the computer's network. |
| "Google is having problems (503). Retrying" | Google's servers returned an error. | Nothing. It retries. |
| "Connect Google in the desktop app" | No Google account is connected. | Steps 3–4. |
| "Google access was revoked. Reconnect Google in the desktop app" | Google stopped accepting the sign-in (you removed access, changed your password, or the app is still in "Testing" after 7 days). | **Settings → Google → Connect**. If it happens weekly, publish the app (step 3, item 5). |
| "Google refused access (403). Check the Calendar and Tasks APIs are enabled" | The Google Cloud project is missing an API. | Step 3, item 3. |
| "ESPN is having problems" / "No games today" | No scores to show right now. | Nothing. |
| "Enter your Sleeper username in the desktop app" | The Fantasy tab has no username. | **Settings → Fantasy**. |
| "Sleeper user ... was not found" | Sleeper doesn't know that username. | Check the spelling in **Settings → Fantasy**. |
| "No matchup this week" / "NFL offseason" | Bye week, out of the playoffs, or no games yet. | Nothing. |
| Full screen "Reconnecting..." | The Car Thing lost the desktop app. | Make sure GlanceThing is running and the USB cable is connected. |
| A ticked task jumps back with "Couldn't update" | Google didn't accept the change. | Check the message. Try again once the problem is fixed. |

## 6. Republishing under another GitHub account

Anyone can build and share their own copy without installing anything:

1. **Fork** the repository on GitHub.
2. Nothing to rename: the release workflow builds the app to download its
   client and updates from the fork itself (`github.repository`). Only if
   releases will live in a different repository, set a repository
   **variable** `GT_REPO=owner/name` there (Settings → Secrets and
   variables → Actions → Variables).
3. Optional: to let recipients skip step 3, add repository **secrets**
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from your own Desktop
   OAuth client. Everyone who installs that build then uses your client.
   While your Google app is unverified it's limited to 100 users.
4. Bump `version` in both `package.json` and `client/package.json` (for
   example to `0.0.16-tabs.4`), commit, then push a matching tag:
   `git tag v0.0.16-tabs.4 && git push origin v0.0.16-tabs.4`. The tag must
   match the version, because the app downloads
   `glancething-client-v<version>.zip` from the release with that tag.
5. GitHub Actions builds the Windows installer, the macOS `.dmg` and the
   client zip and attaches them to that tag's release. Share the Releases
   link and this guide.

## 7. Developer loop (optional, for contributors)

```sh
npm ci
(cd client && npm ci)
npm run dev
```

`npm run dev` turns on Developer mode, so the app installs your local
`client/dist` instead of downloading the release zip. Build it with
`cd client && npm run build`. To push a client change to a connected Car
Thing quickly, run `client/scripts/build_push.ps1` (PowerShell, needs `adb`
on your PATH).

Before opening a pull request, run the same checks as CI:

```sh
npm run lint
npx tsc -p tsconfig.node.json --noEmit
npx tsc -p tsconfig.app.json --noEmit
npx vitest run
npm run build
(cd client && npm run lint && npm run build)
```
