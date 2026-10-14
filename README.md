# Onyx Calendar

A black, fast desktop calendar for Windows that puts everything in one place:

- **One master calendar.** Google Calendar, Outlook, subscribed calendar links and local time blocks, merged. A sidebar switches each calendar on or off.
- **Time blocks.** Drag across the grid, type what the time is for, press Enter.
- **Tasks.** Google Tasks and Microsoft To Do in a side panel, and on the grid at the time written in their name.
- **Raspberry Pi phone reminders.** Flip "Phone reminder" on any block or event and a Raspberry Pi running [`task_caller`](#raspberry-pi-phone-reminders) phones you before it starts.
- **MCP server.** Hermes, the Pi, or any other agent can read the calendar and add to it over your network.

![Onyx Calendar](docs/screenshot.png)

## Install

Download `Onyx-Calendar-Setup-x.y.z.exe` from the [Releases](../../releases) page and run it. Windows will warn that the publisher is unknown, because the installer is not code-signed: choose **More info → Run anyway**.

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
| Add a task | Type in the Tasks panel and press Enter |
| Change view | `D` day, `W` week, `M` month, `A` agenda |
| Go to today / move | `T`, `←`, `→` |
| New block / refresh | `N`, `R` |

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
| `get_agenda` | Events, time blocks and dated tasks in a date range (default: today) |
| `list_tasks` | Open tasks, with when the Pi will phone about each |
| `list_calendars` | Calendars and task lists, with their ids |
| `find_free_time` | Free gaps on a day |
| `create_time_block` | Add a block, optionally with a Pi phone reminder |
| `update_event` | Rename, move, or switch a phone reminder on or off |
| `delete_event` | Delete a block or event |
| `create_task` | Add a task |
| `complete_task` | Mark a task done |

For plain scripts there is also JSON over HTTP:

```
curl -H "Authorization: Bearer <token>" "http://<this PC's address>:4747/api/agenda?days=1"
```

`/api/tasks` and `/api/calendars` work the same way. `/health` needs no token.

## Privacy

- Sign-in tokens and the Google client secret are stored encrypted with your Windows account, in `%APPDATA%\onyx-calendar\onyx.json`.
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
```

| Path | What it is |
|---|---|
| `src/main/hub.js` | The master calendar and the Pi bridge |
| `src/main/providers/` | Google, Microsoft Graph, and `.ics` links |
| `src/main/taskname.js` | Reading dates and times out of task names |
| `src/main/mcp.js` | MCP and JSON server |
| `src/renderer/` | The window |

## License

MIT
