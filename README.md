# Onyx Calendar

A black, fast calendar for Windows and Android that puts everything in one place:

- **One master calendar.** Google Calendar, Outlook, subscribed calendar links and local time blocks, merged. A sidebar switches each calendar on or off.
- **Time blocks.** Drag across the grid, type what the time is for, press Enter.
- **Tasks.** Google Tasks and Microsoft To Do in a side panel, and on the grid at the time written in their name. Pick a due date as you add one, drag it to another day, and tick it off: done tasks go to the **Archived** tab (pick a day to see what you finished), and **Undo** at the top (or Ctrl+Z) brings the last one back.
- **Notes on everything.** Every task, event, time block and pinned Notion page or Drive file has a notes box. Task and event notes are saved to Google or Outlook (so they show there too). Notes on read-only calendars and pinned documents are kept in Onyx. Entries with notes show a note icon, and hovering one shows its notes.
- **Goals.** Set a long-term goal with a time frame and the steps toward it (**+ New goal** in the sidebar; **Spread dates** spaces the steps out up to the target). Each step becomes a real task, in the Tasks panel, on the calendar and in Google. The time frame shows as one bar across the calendar with its progress, and on the globe the goal is a single node (with a progress ring) rather than one node per step. Ticking off a step, in Onyx or in Google, moves the goal along.
- **Repeating tasks.** Click a task and pick **Repeat**: every day, weekday, week, 2 weeks, month or year. Google Tasks doesn't let other apps set a repeat, so Onyx keeps the rule: when you tick the task off (in Onyx or in Google Tasks), Onyx adds the next one with the next date, and Undo takes it back.
- **News tab.** A collapsible tab on the right edge opens a YouTube panel with the latest stories from news channels (BBC, Reuters, AP, NBC, CBS and Al Jazeera to start), newest first, plus 24/7 live streams. Pick channels, or add any YouTube channel by its link or @handle. It needs no YouTube account or API key, and collapsing the tab stops the video.
- **Tags.** Tag any block, event or task. Tags stay in Onyx (they are never written to Google or Microsoft), and the sidebar filters by them.
- **Globe view.** One button flips to a 3D globe of everything in a day, week, month or range, plus your notes, Notion pages and Google Drive files, clustered by tag, source or day.
- **Android app.** The same calendar on your phone, connected to the PC app.
- **Raspberry Pi phone reminders.** Flip "Phone reminder" on any block or event and a Raspberry Pi running [`task_caller`](#raspberry-pi-phone-reminders) phones you before it starts.
- **MCP server.** Hermes, the Pi, or any other agent can read the calendar and add to it over your network.

![Onyx Calendar](docs/screenshot.png)

![Globe view](docs/graph.png)

## Install

**Windows:** download `Onyx-Calendar-Setup-x.y.z.exe` from the [Releases](../../releases) page and run it. Windows will warn that the publisher is unknown, because the installer is not code-signed: choose **More info → Run anyway**.

**Android:** see [Android app](#android-app).

### Updates

From 1.4.0 on, Onyx keeps itself up to date from this repository's releases:

- **Windows:** the **update button** in the title bar (the circle with the down arrow) checks for a new version. Onyx also checks by itself shortly after it starts and every six hours. When there is one, a popup shows what's new; **Update now** downloads it, closes Onyx, installs it and opens it again. Versions before 1.4.0 have no updater, so install 1.4.0 by hand once.
- **Android:** the app checks too and shows the same popup. **Update now** downloads the new version inside the app and opens Android's installer: tap **Install** and it updates in place. The first time, Android asks you to allow Onyx to install updates ("Allow from this source"). Android always asks for that one tap for apps from outside the Play Store. **Settings → General → Check now** checks on demand. (From 1.5.1; older Android builds open the download in the browser.)

Or build it yourself:

```
npm install
npm run dist
```

The installer is written to `dist/`.

## Connecting calendars

Open **Settings → Calendars** (the sliders icon, top right).

### Google Calendar and Google Tasks

Google only lets an app read your calendar if the app identifies itself with a credentials file that belongs to you.

**If you already have one** (for example the `client_secret_….json` that Hermes uses for Google Tasks), click **Choose credentials file**, pick it, then **Sign in with Google**. In the same Google Cloud project, make sure the **Google Calendar API** is enabled as well as the Tasks API.

**If you don't:**

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Under **APIs & Services → Library**, enable **Google Calendar API** and **Google Tasks API**.
3. Under **OAuth consent screen**, choose **External**, fill in the app name, and add your own address as a test user.
4. Under **Credentials → Create credentials → OAuth client ID**, choose **Desktop app**, then **Download JSON**.
5. In Onyx Calendar, choose that file and sign in.

While the consent screen is in "Testing", Google signs you out every 7 days. Press **Publish app** on the consent screen to stop that (no review is needed for personal use; you will see an "unverified app" notice when signing in).

### Outlook

1. Go to [App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) and choose **New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Public client/native (mobile & desktop)**, value `http://localhost`.
4. Register, then copy the **Application (client) ID** into Onyx Calendar and click **Sign in with Microsoft**.

Work and school accounts often block third-party apps. For those, use a calendar link instead.

### Calendar link (read-only)

Any calendar that can be published as an `.ics` link works without a sign-in. In Outlook on the web: **Settings → Calendar → Shared calendars → Publish a calendar**, copy the **ICS** link, and paste it under **Calendar link**. These calendars are read-only in Onyx Calendar and refresh every five minutes.

## Using it

| To do this | Do this |
|---|---|
| Block out time | Drag on the grid, type a title, press Enter |
| Move or resize a block | Drag it, or drag its bottom edge |
| Edit or delete | Click the block |
| Show or hide a calendar | Click it in the sidebar |
| Add a task | Type in the Tasks panel and press Enter; pick a date (or Today / Tomorrow) under it first if you like |
| Undo marking a task done | **Undo** in the toast or at the top, or Ctrl+Z |
| Tag something | Type in the tag box of any block, event or task; Enter or comma adds a tag |
| Show one tag | Click it under **Tags** in the sidebar (click more to combine); double-click to rename, click the dot to change its colour |
| Change view | `D` day, `W` week, `M` month, `A` agenda, `G` globe |
| Go to today / move | `T`, `←`, `→` |
| New block / refresh | `N`, `R` |

### Globe view

The **globe button** in the title bar (or `G`) switches between the calendar and the globe. Your entries form a globe: each cluster sits on the surface of a sphere with its entries gathered around it, and the near side is brighter than the far side. Drag (or swipe) to spin it; a flick keeps it turning.

- **Cluster by Tags** groups everything by tag. An item with two tags is pulled between both clusters, through the inside of the globe.
- **Cluster by Sources** groups by calendar, task list, Notes, Notion and Drive.
- **Cluster by Days** strings the days together like a timeline.

Pick **Day**, **Week**, **Month** or **Range** at the top; the ‹ › arrows and Today move it. Scroll (or pinch) to zoom, click a cluster to fly into it, click an item to open it, and double-click to reset. **Show** switches undated tasks, notes, Notion and Drive on and off.

What else can live on the globe (it shows whatever date range is picked):

- **Notes** (diamonds). **+ Note** writes one: a title, any text, and tags that place it in clusters. Notes stay in Onyx.
- **Notion pages** (squares). **+ Notion** searches your Notion and pins a page or database to the globe; click it to open it in Notion or tag it. Setup: **Settings → Notion & Drive** (create an internal integration at notion.so/my-integrations, paste its secret, then share pages with it in Notion via ••• → Connections).
- **Google Drive files** (squares). **+ Drive** searches Drive across your Google accounts and pins a file. Drive uses your Google sign-in; accounts connected before 1.3 need to **sign in with Google again** once, and the Google Drive API must be enabled in your Google Cloud project.

Untagged notes and documents gather in their own Notes, Notion and Drive clusters. Picking tags in the sidebar first gives new notes and pins those tags.

**Tasks group themselves.** A task without tags starts in **Overdue**, **Today**, **Tomorrow**, a cluster for its day, or **No date**. Overdue tasks always show, whatever range is picked. These groups are only a starting point:

- **Drag any item onto a tag cluster** to give it that tag (it leaves the tag it came from).
- **Drag a task onto Today, Tomorrow, another day or No date** to change its due date in Google Tasks.
- **Drag an item back onto its own Notes / Notion / Drive / Untagged cluster** to remove the tag it came from.

Dragging empty space still spins the globe. A task whose date is written in its name (like "Dentist Oct 14 3pm") keeps that date until the name is changed.

Closing the window keeps the app running in the system tray so the MCP server stays available. Quit from the tray icon. This can be changed in **Settings → General**.

## Raspberry Pi phone reminders

This works with a Raspberry Pi running `task_caller.py`: a script that checks Google Tasks every half hour and, for any task with a time in its name (`Dentist Oct 14 3pm`, `1500 Brief the team`), phones you through Twilio and sends an ntfy alert about an hour before.

The Pi only knows about Google Tasks, not calendar events. So when you turn on **Phone reminder** for a block or event, Onyx Calendar keeps a matching Google Task for it, named so the Pi reads exactly the right date and time (for example `Deep work 2026-10-14 15:00`). Move the event and the task moves; delete it or switch the reminder off and the task is removed. The matching task is hidden inside Onyx Calendar so nothing shows twice.

- **Nothing changes on the Pi**, and calls still happen while this PC is off.
- It works for any timed entry, including Outlook events and read-only calendar links.
- The editor shows when the Pi will ring, and warns when that falls inside the Pi's quiet hours.
- **Settings → Pi calls** must match the Pi's `config.json`: lead time (default 60 minutes) and quiet hours (default 10pm to 7am).
- This PC and the Pi must be set to the same time zone.

The rules for reading a time out of a task name live in [`src/main/taskname.js`](src/main/taskname.js), a port of `parse_name()` from `task_caller.py`. If you change one, change the other.

## Android app

The Android app is a companion to the PC app: it shows the same master calendar, tasks, tags and graph, and can add and change entries, all through Onyx on your PC. No accounts are signed in on the phone.

1. Download `Onyx-Calendar-x.y.z.apk` from the [Releases](../../releases) page on the phone and open it. Android asks you to allow installing apps from your browser the first time.
2. On the PC, open **Settings → Phone**. A QR code appears.
3. Open Onyx on the phone, tap **Scan QR code**, and point the phone at the code. It connects by itself.

Scan from inside the Onyx app: the phone's camera app hands `onyx://` links to Google instead of opening Onyx. To connect without scanning, type one of the addresses and the token shown under the QR code. To re-pair later, use **Settings → Connection → Scan a new code**.

- **Same wifi:** works out of the box. The PC app must be running (it can sit in the tray).
- **Away from home:** install [Tailscale](https://tailscale.com/) on the PC and the phone, then scan the code again. Its `100.x.y.z` address is included automatically.
- **PC off or out of reach:** the phone shows the last calendar it loaded, marked "Offline", until it can reach the PC again.
- **Everything is shared, both ways.** The phone has no separate copy: notes, pinned Notion and Drive items, tags, time blocks, tasks, hidden calendars and Pi settings all live in Onyx on the PC, so a change on one shows on the other (the phone checks every minute and whenever you open it; the PC sees phone changes at once).
- **Keys too.** The Notion secret, the Google credentials file, the Outlook app ID and calendar links can be entered on either device (phone: **Settings → Keys & accounts**) and are saved once, on the PC. The Google and Microsoft sign-in itself happens on the PC, in its browser.
- The server's own settings, the pairing code and removing accounts stay on the PC.

The APK is built by GitHub Actions ([`.github/workflows/android.yml`](.github/workflows/android.yml)) whenever a version tag is pushed, and signed with a key kept in the repository's Actions secrets, so each new version installs over the last one.

## MCP server

While the app is running it serves the calendar on port `4747`. Every request needs the token shown in **Settings → MCP server**.

```yaml
# Hermes config.yaml
mcp_servers:
  onyx:
    url: http://<this PC's address>:4747/mcp
    headers:
      Authorization: "Bearer <token>"
```

From Docker on the same PC use `http://host.docker.internal:4747/mcp`. The first time the app runs, Windows asks whether to allow it through the firewall; allow it on private networks so the Pi can connect.

| Tool | What it does |
|---|---|
| `get_agenda` | Events, time blocks and dated tasks in a date range (default: today), optionally only one tag |
| `list_tasks` | Open tasks, with when the Pi will phone about each, optionally only one tag |
| `list_tags` | Your tags and how many entries carry each |
| `set_tags` | Replace the tags on an event, block or task |
| `list_calendars` | Calendars and task lists, with their ids |
| `find_free_time` | Free gaps on a day |
| `create_time_block` | Add a block, optionally with a Pi phone reminder |
| `update_event` | Rename, move, or switch a phone reminder on or off |
| `delete_event` | Delete a block or event |
| `create_task` | Add a task |
| `complete_task` | Mark a task done |
| `list_notes` | Notes, and Notion pages and Drive files pinned to the globe, optionally only one tag |
| `list_goals` | Long-term goals with their time frame, progress and steps |
| `create_note` | Write a note (with tags) |

For plain scripts there is also JSON over HTTP:

```
curl -H "Authorization: Bearer <token>" "http://<this PC's address>:4747/api/agenda?days=1"
```

`/api/tasks`, `/api/tags` and `/api/calendars` work the same way, and `/api/agenda` and `/api/tasks` take `?tag=`. `/health` needs no token. The Android app uses `POST /app/rpc` with the same token.

## Privacy

- Sign-in tokens, the Google client secret and the Notion integration secret are stored encrypted with your Windows account, in `%APPDATA%\onyx-calendar\onyx.json`.
- Passwords are typed into Google's or Microsoft's own page in your browser, never into this app.
- The app talks only to Google, Microsoft and the calendar links you add. There is no telemetry.
- The MCP server refuses requests without the token. Turn off **Reachable from your network** to limit it to this PC.

## Development

```
npm install
npm start          # run the app
npm test           # unit tests
npm run preview    # the interface in a browser with demo data, at http://127.0.0.1:4780
npm run dist       # build the installer
npm run mobile     # copy the window into mobile/www for the Android app
```

Building the APK yourself needs JDK 21 and the Android SDK: `npm run mobile`, then in `mobile/` run `npm install` and `npx cap sync android`, then `./gradlew assembleDebug` in `mobile/android`.

| Path | What it is |
|---|---|
| `src/main/hub.js` | The master calendar, tags, and the Pi bridge |
| `src/main/api.js` | The commands the window (and the phone) can run |
| `src/renderer/graph.js` | The 3D globe view |
| `src/main/library.js` | Notes and pinned Notion / Drive items |
| `src/renderer/remote.js` | The phone's connection to the PC |
| `mobile/` | The Android app (Capacitor) |
| `src/main/providers/` | Google, Microsoft Graph, and `.ics` links |
| `src/main/taskname.js` | Reading dates and times out of task names |
| `src/main/mcp.js` | MCP and JSON server |
| `src/renderer/` | The window |

## License

MIT
