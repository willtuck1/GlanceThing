# GlanceThing Tabs setup

This build turns a Car Thing into a small dashboard with four tabs: **Calendar**, **To-do**, **Sports** and the original **Spotify** home. A desktop app on your computer fetches everything and sends it to the Car Thing over USB.

You don't need any developer tools. Expect about 15 minutes the first time, most of it in steps 1 and 3.

## What you need

- A Spotify Car Thing and a USB cable that carries data
- A Windows, macOS or Linux computer that stays on while you use the Car Thing
- A Google account (only for the Calendar and To-do tabs; Sports and Spotify work without one)

## 1. Flash the Car Thing (once)

1. Download [ThingFlash](https://github.com/BluDood/ThingFlash/releases/latest) and follow its guide.
2. Pick the **Thing Labs 8.9.2** image.

You only do this once per device. The desktop app installs and updates everything after that.

## 2. Install the desktop app

1. Open this repo's **Releases** page (the "Releases" link on the right of the repo's GitHub page) and pick the newest `v0.0.16-tabs.N` release.
2. Download the file for your computer:
   - Windows: `glancething-<version>-setup.exe`
   - macOS: `glancething-<version>.dmg`
   - Linux: `glancething-<version>.AppImage`
3. Run it. The first launch opens the **Setup** wizard. Plug in the Car Thing and follow the steps. The wizard finds the device and installs the Car Thing app over USB.

### "Unknown publisher" warnings

These builds are not code-signed, so your computer warns you the first time:

- **Windows SmartScreen** ("Windows protected your PC"): click **More info**, then **Run anyway**.
- **macOS Gatekeeper** ("cannot be opened because the developer cannot be verified" or "is damaged"): open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to GlanceThing. If macOS says the app is damaged, run `xattr -cr /Applications/GlanceThing.app` in Terminal once.
- **Linux**: mark the AppImage as executable (`chmod +x glancething-*.AppImage`) before running it.

Only download the installer from this repo's Releases page.

## 3. Google Cloud

Skip this step if the desktop app's **Settings → Google** page says "This app has a built-in Google client". Whoever built your copy already did it.

Otherwise, create your own free Google OAuth client. It takes about 5 minutes:

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (any name, e.g. "GlanceThing").
2. Open **APIs & Services → Library** and enable both the **Google Calendar API** and the **Google Tasks API**.
3. Open **APIs & Services → OAuth consent screen** (called "Google Auth Platform" in newer consoles):
   - User type: **External**.
   - Fill in the app name and your email. Everything else can stay empty.
   - Under **Audience** / **Test users**, add your own Google address.
   - Click **Publish app** so the status reads **In production**. If you leave it in "Testing", Google signs you out every 7 days. You do not need to submit it for verification; for personal use, the "Google hasn't verified this app" warning is fine.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Copy the **Client ID** and **Client secret**.
5. In the desktop app, open **Settings → Google**, paste both values and click **Save**.

## 4. Connect Google

1. In **Settings → Google**, click **Connect**. Your browser opens Google's sign-in page.
2. Pick your account. If you see "Google hasn't verified this app", click **Advanced → Go to GlanceThing (unsafe)**. It is your own client from step 3.
3. Allow access to your calendars and tasks. The browser then says you can close the tab.
4. Back in Settings, tick the calendars you want and pick a task list.

Events show on the Car Thing within a few seconds. Tasks you change on your phone or computer show within about 30 seconds.

## 5. Device checklist

Run through this once after installing, and again after each update. Tick each box as you go.

**Navigation**
- [ ] Swipe left and right through all four tabs: Calendar, To-do, Sports, Spotify. The dots at the bottom follow.
- [ ] Buttons 1, 2 and 3 jump to Calendar, To-do and Sports.
- [ ] On a list tab, turning the dial moves the highlight and scrolls the list. Pressing the dial activates the highlighted row.
- [ ] The Back button (below the dial) opens the full-screen player. Pressing it again closes it.
- [ ] The M button opens the system menu.

**Calendar**
- [ ] Today's and tomorrow's events show under "Today" and "Tomorrow", with all-day events at the top of each day.
- [ ] Add an event in Google Calendar. It appears within 5 minutes, or straight away when you switch to the Calendar tab.

**To-do**
- [ ] Tick a task on the Car Thing. It shows as completed in Google Tasks on your phone or the web.
- [ ] Tick a task on your phone. It flips on the Car Thing within about 30 seconds.
- [ ] Tap "Completed" to show and hide finished tasks.

**Sports**
- [ ] Tonight's NBA and NFL games show, with live scores during games. Compare one with espn.com.
- [ ] Tap a team (or long-press a game, or press the dial on it) to star it. Starred games move to the top and stay starred after a restart.

**When things go wrong**
- [ ] Turn off your computer's Wi-Fi or unplug its network cable. Within 5 minutes each tab shows an amber "Updated <time>" badge in the top right and keeps the last data. Reconnect and the badge disappears.
- [ ] Quit the desktop app. The Car Thing shows "Reconnecting...". Start the app again and the tabs come back by themselves.
- [ ] Unplug the Car Thing's USB cable and plug it back in. It reconnects without a restart.
- [ ] Optional: remove GlanceThing's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Within 5 minutes the Calendar and To-do tabs say "Google access was revoked. Reconnect Google in the desktop app", and the desktop app's home page asks you to reconnect. Connecting again in Settings brings everything back.

If something on this list fails, note which step and what the screen showed, and open an issue on this repo.

## 6. Troubleshooting

| What you see | What to do |
|---|---|
| Calendar or To-do says "Set up Google in the desktop app's Settings" | Do steps 3 and 4. |
| "Connect Google in the desktop app" | Do step 4. |
| "Google access was revoked. Reconnect Google in the desktop app" | Google ended the session (password change, access removed, or the consent screen is still in "Testing"). Click **Connect** in Settings again. If it happens weekly, finish step 3.3 (publish the app). |
| "Google refused access. Check the Calendar and Tasks APIs are enabled" | Enable both APIs (step 3.2) in the same project as your client ID. |
| "Can't reach Google" or "Can't reach ESPN" | Your computer is offline. The tabs keep the last data and catch up once it's back online. |
| The desktop app says "CarThing not found" | Try another USB cable or port, then run **Setup** again from the home page. |

## 7. Publishing your own copy

You can host your own copy of this build under another GitHub account:

1. Fork this repo.
2. If your fork has a different name, set a repository variable `GT_REPO` to `your-name/your-repo` (**Settings → Secrets and variables → Actions → Variables**). The build workflow defaults to the fork's own name, so most people can skip this.
3. Optional: add repository secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to build a shared Google client into the app, so people can skip step 3. While that client is unverified, Google caps it at 100 users and you must add each person as a test user, or publish it.
4. Push a tag such as `v0.0.16-tabs.1` (or create a release with that tag on GitHub). Actions builds the Windows, macOS and Linux apps and the Car Thing client zip and attaches them to the release. The installed app downloads its Car Thing client from the same release.

## 8. Developer loop (contributors only)

1. Run `npm ci` in the repo root and in `client/`.
2. Run `npm run dev` with **Developer mode** turned on in the app. In dev mode it installs your local `client/dist` instead of downloading the release zip.
3. Rebuild and push the client to a connected device with `client/scripts/build_push.ps1`.
4. Before opening a PR, run `npm run lint`, `npx tsc -p tsconfig.node.json --noEmit`, `npx tsc -p tsconfig.app.json --noEmit`, `npx vitest run` and `npm run build`, then `npm run lint && npm run build` in `client/`.
