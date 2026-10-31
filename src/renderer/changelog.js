// Every version of Onyx and what came with it, newest first (Settings → Changelog).
// Made by scripts/changelog.js from the release notes: rebuild it there rather than editing it here.
window.OnyxChangelog = [
 {
  "version": "1.90.0",
  "date": "2026-10-31",
  "title": "Breakdown with a timeline",
  "items": [
   "Breakdown (the hammer in a block's or task's window) now gives each step a length and lays the steps out in the time it already has: across the block, or in the free time of the task's day.",
   "When that time is clearly too little, a second option, More realistic, uses realistic lengths and carries on in your free time after it (the next days too), in order and around what's already on your calendar.",
   "Pick an option and change anything in it: a step's name, day, time, length or notes. Changing a step's time or length moves the steps right after it along with it.",
   "Put on calendar adds the steps in place of the block or task. Each step from a block becomes a block with the same calendar, colour and tags; each step from a task becomes a task at its time. The first step keeps the original notes. Undo brings the original back.",
   "Breakdown now reads everything in the block or task: its notes, its checklist (leaving out what's ticked), its links, where it is, and on a read-only calendar both the calendar's notes and yours.",
   "Clicking a block or task now shows its notes in the small card next to it, up to about 8 lines. Open shows the rest."
  ]
 },
 {
  "version": "1.89.1",
  "date": "2026-10-30",
  "title": "Paste screenshots into Magic add",
  "items": [
   "Magic add and Magic goal: press Ctrl+V to add a screenshot from your clipboard (for example one taken with Win+Shift+S). It's read wherever the cursor is in the window, not only in the typing box.",
   "While a Magic window is open, Ctrl+V no longer pastes a copied calendar entry behind it.",
   "The typing boxes and the \"Read from\" row now mention that you can paste a screenshot."
  ]
 },
 {
  "version": "1.89.0",
  "date": "2026-10-30",
  "title": "Plan from a picture, a webpage or a Notion page",
  "items": [
   "Magic add and Magic goal can now read things for you. Under the typing box, \"Read from\" has Picture and Link: add a screenshot or photo of instructions, a webpage, or a Notion page. You can also paste a picture or a link straight into the box, or drop a picture on the window.",
   "Each one is read as soon as it's added and shows how much was found, or why it couldn't be read (a page behind a sign-in, say) and what to do instead.",
   "Magic add turns what was read into tasks and fits them into your day. Steps from instructions stay in order, and each block keeps that step's instructions and a link back in its notes. Steps that don't fit today can go to the next day, still in order.",
   "Magic goal uses what was read like your outline, following its modules or chapters in order, and keeps the links in the goal's notes.",
   "Webpages are read on your PC. Notion pages come through your Notion connection: share the page with your integration in Notion first. Pictures are read by Claude with your key."
  ]
 },
 {
  "version": "1.88.0",
  "date": "2026-10-30",
  "title": "Magic add on one screen",
  "items": [
   "Magic add is redesigned to fit on one screen. You type tasks at the top and tick tasks from your lists below. The day and the Plan button stay in a footer that doesn't scroll away.",
   "The hours to plan in and the calendar are one short line above the Plan button. Change opens a small panel to edit them.",
   "Magic add no longer adds travel time to blocks or keeps lunchtime free. The Getting around, Starting from and Keep lunch free settings are gone: put travel and lunch in your calendar yourself, and Magic add plans around them.",
   "The planned day replaces the task list, scrolled to your first new block, with Add to my calendar in the footer. Edit goes back to your tasks with everything kept."
  ]
 },
 {
  "version": "1.87.0",
  "date": "2026-10-30",
  "title": "Magic add starts with nothing ticked",
  "items": [
   "Magic add's \"From your lists\" no longer ticks tasks for you. Tick the ones you want planned into the day.",
   "Plan on a \"new task from another app\" pop-up still ticks just those new tasks, and a task another app hands over is still planned straight away.",
   "Your keys and sign-ins are safer: if Onyx ever can't unlock them on start (for example after a Windows account change), it keeps a copy instead of writing over them."
  ]
 },
 {
  "version": "1.86.2",
  "date": "2026-10-30",
  "title": "The phone says why it couldn't connect",
  "items": [
   "When pairing the phone fails, the Connect screen now says why, for example which PC addresses it couldn't reach. Before, the message was hidden behind the screen, so scanning the QR code seemed to do nothing.",
   "Scanning the same QR code again after a failed try now really tries again. Before, the phone ignored a code it had already used.",
   "A failed try no longer leaves the phone thinking the PC is out of reach, so the next try reaches it at once."
  ]
 },
 {
  "version": "1.86.1",
  "date": "2026-10-29",
  "title": "Backspace only deletes from the calendar",
  "items": [
   "Backspace and Delete now delete the highlighted block only while you're on the calendar. With a button, chip or field in focus somewhere else (a window, the Tasks panel, News), the key belongs to that, and the block stays.",
   "The same goes for Enter, which opens the highlighted block. Neither key does anything while a window, the right-click menu, the globe or Hyperfocus is open."
  ]
 },
 {
  "version": "1.86.0",
  "date": "2026-10-29",
  "title": "Backspace deletes the highlighted block",
  "items": [
   "Click a block or a task on the calendar to highlight it, then press Backspace or Delete to delete it. Undo (Ctrl+Z) brings it back.",
   "A repeating block isn't deleted by one key press: Onyx asks, with a \"Skip this day\" button right there.",
   "Right-click a block for Delete at the foot of the menu. On a repeating block the menu has \"Skip this day\" and \"Delete every repeat\".",
   "Blocks on a read-only calendar say so instead, and have no Delete in the menu."
  ]
 },
 {
  "version": "1.85.0",
  "date": "2026-10-29",
  "title": "Magic add from the Tasks panel",
  "items": [
   "New Magic add tasks button in the Tasks panel, just under where you add a task, in the same style as Magic add goal. It opens Magic add: tick tasks from your lists (No date, Backburner, From apps) or type new ones, and have them fitted into the day.",
   "Like the Magic add button in the left sidebar, it shows how many tasks from your other apps are waiting to be planned.",
   "It shows on the Open tab and steps aside on Archived.",
   "This version also brings 1.84.1's fixes for an internet connection that drops for a moment."
  ]
 },
 {
  "version": "1.84.1",
  "date": "2026-10-28",
  "title": "Sturdier when the internet drops for a moment",
  "items": [
   "When your PC's connection drops for a moment (the wifi reconnecting, a VPN switching over), Onyx now tries again once by itself instead of failing straight away. Reads always get a second try; a change gets one only if it never left the PC, so nothing is made twice.",
   "What still fails says so in plain words, like \"Couldn't reach Google from this PC (its internet connection dropped)\", in place of \"fetch failed\".",
   "A change from your phone that reaches the PC while the PC can't reach Google now waits on the phone and goes later. Before, it was set aside as if the PC had turned it down. The phone says once that it's waiting, not on every try.",
   "The same goes for tasks typed on the lock screen or Onyx Home."
  ]
 },
 {
  "version": "1.84.0",
  "date": "2026-10-27",
  "title": "Magic add goal fills in your blocks",
  "items": [
   "Magic add goal can now add details to a step's block where they help: a short checklist to tick off during the session, a link or two (pages from your outline, or a tool's official site), and a tip on how to start. Simple steps stay plain.",
   "In the plan, a step with details shows \"On its block: …\". Unfold it to see them, and take off anything you don't want before saving.",
   "A timed task now has a checklist and links like any other block: edit them in the task's window, and tick them off there. The calendar block shows how many are ticked (like 1/3).",
   "A repeating step brings its checklist and links to each next day, unticked."
  ]
 },
 {
  "version": "1.83.0",
  "date": "2026-10-27",
  "title": "Sync your PCs through Google Drive",
  "items": [
   "New in Settings → Desktops: \"Sync through Google Drive\". Your PCs stay the same from any network, with no Tailscale, and they don't need to be on at the same time. Tags, notes, goals, repeats, memos, pins, settings and sign-ins all sync.",
   "Onyx keeps one locked file in a hidden folder of your Google Drive that only Onyx can open. It's locked with a sync code made on your first PC; type that code once on each other PC to join.",
   "Turning it on asks Google once for permission to keep that file (your browser opens). Use the same Google account and the same Google credentials file on every PC.",
   "The list of your desktops shows PCs syncing through Drive too, and which are online. Linking over your own network (same wifi or Tailscale) still works, under \"Or link over your network\"."
  ]
 },
 {
  "version": "1.82.0",
  "date": "2026-10-26",
  "title": "A time line while you move a block",
  "items": [
   "While you drag a block to move it, a grey line runs from where it would land across to the times on the left, with the start time it would get in the middle of the line.",
   "It follows the block as it snaps to its neighbours, and goes away when you let go."
  ]
 },
 {
  "version": "1.81.0",
  "date": "2026-10-26",
  "title": "Links on blocks, short names",
  "items": [
   "Link a website, a Google Drive file or a Notion page to a block: in the block's window, Links, then + Website, + Drive or + Notion (search your Drive or Notion and tap one).",
   "Tap a block with links and a second bubble opens on the opposite side of the block from its name bubble, with an Open button for each link. It finds room on another side when the opposite one is off the screen.",
   "Task and block names are 30 characters at most where you type them, with a count as you near the end. Names you already have stay as they are.",
   "The bubble by a block now always shows its whole name, however long.",
   "Names that Claude writes for goal steps and breakdowns are kept short too; the full wording goes into the step's Done when line.",
   "The task box on the lock screen takes 30 characters too."
  ]
 },
 {
  "version": "1.80.0",
  "date": "2026-10-25",
  "title": "Magic add goal",
  "items": [
   "New Magic add goal button under Goals in the sidebar. Name the goal, set its dates and paste everything about it: an outline of what it involves, notes, and the steps you already have (mark finished ones with [x] or done).",
   "Claude turns it into phases, each with its dates and a measurable milestone, and actionable, measurable tasks: every task says how much or how many, so done is obvious.",
   "A Breakdown meter with 1 to 5 hammers, like in a task, sets how fine the plan is: Milestones, Weekly plan, Clear steps, Detailed, or Every day (120 to 250 small steps).",
   "Anything practised or done regularly becomes a repeating task (daily, weekdays, weekly, every 2 weeks or monthly) that runs for its phase and stops after its last day.",
   "Every session gets a time that is free in your calendar, for a repeating task on most of its days, and the plan never clashes with itself. A one-off task on a full day moves a day or so later.",
   "Steps you already finished are added as done, so the goal's progress starts where you are.",
   "You see the whole plan first: hours a week, tasks per phase, and every task with its time and length. Rename any task or leave it out, then Set goal makes them all as tasks.",
   "A goal's own window has a Breakdown row too: pick the hammers and Break it down to add more steps to it. Steps are listed under their phase.",
   "Big plans no longer time out on the phone."
  ]
 },
 {
  "version": "1.79.0",
  "date": "2026-10-24",
  "title": "Hold to make a block",
  "items": [
   "On the phone, press and hold an empty spot on the calendar to make a new block there. It shows up at once, half an hour long, with a small buzz.",
   "Without lifting your finger, drag down to make it end later or up to make it start earlier, a quarter hour at a time. The block shows its times and length as it grows, and the time of the edge you are moving shows by the hours on the left.",
   "The calendar scrolls when you drag near the top or bottom, and the block stays on its day even if your finger drifts sideways.",
   "Lift your finger to save it: it opens right away so you can name it. If the phone takes the touch away (a call, the notification shade), nothing is made.",
   "A long press on an existing block still picks it up to move it, and a quick swipe still scrolls."
  ]
 },
 {
  "version": "1.78.0",
  "date": "2026-10-23",
  "title": "Tap a block, see a bubble; a softer tick",
  "items": [
   "Tapping a block on the phone highlights it and opens a small bubble beside it with the block's whole name, its time and its calendar. Tap Open in the bubble to open the block. No more double tap on the phone, which could get stuck.",
   "The bubble always stays on screen: beside the block when there is room, otherwise above or below it (clear of the drag bars), so blocks at the far left or far right of the screen work the same.",
   "A tap on the bubble only ever opens that block. Blocks behind it are never tapped by mistake.",
   "The bubble goes away when you tap somewhere else, scroll the calendar, drag a block or change days.",
   "On the PC a click shows the same bubble, and a double click or Enter still opens the block.",
   "A new, much quieter sound when you tick off a task or a block: a short soft pop instead of the bright four-note chime.",
   "Settings, General, Tick-off sound: pick Soft, Click (a tiny tap) or Off. Each plays as you pick it. On the phone the choice is kept for that phone."
  ]
 },
 {
  "version": "1.77.0",
  "date": "2026-10-22",
  "title": "A changelog of every version, in Settings",
  "items": [
   "A changelog of every version so far, in Settings > Changelog: newest first, searchable, with the version you have marked. It grows with each update."
  ]
 },
 {
  "version": "1.76.1",
  "date": "2026-10-22",
  "title": "The phone app builds again (1.76.0 had no APK)",
  "items": [
   "The phone app for 1.76: the doomscroll saver card shows a running timer for this stretch and your total time on that app today."
  ]
 },
 {
  "version": "1.76.0",
  "date": "2026-10-22",
  "title": "The doomscroll card shows a running timer and today's total",
  "items": [
   "The doomscroll saver card now shows a running timer for this stretch and your total time on that app today, in the same small card."
  ]
 },
 {
  "version": "1.75.0",
  "date": "2026-10-22",
  "title": "Magic add, redesigned to read well on a phone",
  "items": [
   "Magic add has a cleaner, easier-to-read layout, especially on the phone."
  ]
 },
 {
  "version": "1.74.0",
  "date": "2026-10-22",
  "title": "Send a block by email, or onto a Notion page",
  "items": [
   "Send a block from its editor: by email from any of your connected accounts (with an invite to add it to their calendar), or onto a Notion page.",
   "To send from an account connected before this version, connect it again once in Settings > Calendars."
  ]
 },
 {
  "version": "1.73.0",
  "date": "2026-10-22",
  "title": "Blocks snap to their neighbours when moved or stretched",
  "items": [
   "Blocks snap to the block above or below when you move them close to it, and the stretch bars snap to their neighbours too. Farther away, moves stay free."
  ]
 },
 {
  "version": "1.72.0",
  "date": "2026-10-22",
  "title": "Time dragged out on the calendar is kept at once, as a blank block",
  "items": [
   "Dragging out time on the calendar now saves the block right away, blank, with its editor open to name it. Leave it and it stays, to fill in later."
  ]
 },
 {
  "version": "1.71.0",
  "date": "2026-10-22",
  "title": "Drag tasks between the list, the calendar and the backburner",
  "items": [
   "Drag tasks from the task list onto the calendar to schedule them, and in and out of the Backburner.",
   "Drag a task or block from the calendar onto the task list to do it another time: it waits with no date."
  ]
 },
 {
  "version": "1.70.0",
  "date": "2026-10-22",
  "title": "A quick add box on the lock screen",
  "items": [
   "A quick add box on the lock screen: type a task, press Add, and it lands in your tasks with no date. Offline, it waits on the phone and is added once your PC is in reach."
  ]
 },
 {
  "version": "1.69.0",
  "date": "2026-10-22",
  "title": "Magic add shows the plan as a day, its new blocks draggable",
  "items": [
   "Magic add now shows your plan on a preview of the day, with what is already in it. Drag a new block to move it, or its bottom edge to change its length, before adding it to your calendar."
  ]
 },
 {
  "version": "1.68.0",
  "date": "2026-10-22",
  "title": "Magic add picks from the backburner, other apps and tasks with no date",
  "items": [
   "Magic add: pick tasks to plan in from three tabs (Backburner, From apps, No date). Ticks stay ticked when you switch tabs."
  ]
 },
 {
  "version": "1.67.2",
  "date": "2026-10-22",
  "title": "The phone app heals a start that never came up",
  "items": [
   "If the phone app ever opens to a black screen (seen once, right after an update), it now reloads itself instead of waiting for a force stop."
  ]
 },
 {
  "version": "1.67.1",
  "date": "2026-10-22",
  "title": "No transition bands on the calendar",
  "items": [
   "The striped \"Transition\" bands between meetings are gone from the calendar."
  ]
 },
 {
  "version": "1.67.0",
  "date": "2026-10-21",
  "title": "The study cat builds through a Hyperfocus session",
  "items": [
   "A new study cat in Hyperfocus that builds as the session goes: calm for the first third, caffeine kicks in for the second, a total physics breakdown for the last. It sits right on the screen's own background, on the PC, in the phone app, and on the phone's Home and lock screen."
  ]
 },
 {
  "version": "1.66.1",
  "date": "2026-10-21",
  "title": "No warning boxes offline; outside bars always; a bug log",
  "items": [
   "No more \"Can't reach Onyx on your PC\" boxes while the phone is offline. The title bar already says Offline; something that really needs the PC gets one short line.",
   "Settings changed offline are kept and sync later.",
   "The stretch bars always sit outside a picked-up block, and the tick circle works on a highlighted block.",
   "If something breaks inside Onyx, it says so in plain words and keeps the details so it can be fixed."
  ]
 },
 {
  "version": "1.66.0",
  "date": "2026-10-21",
  "title": "Tap to highlight, double tap to open; stretch bars clear of the block",
  "items": [
   "Tap a block to highlight it; double tap it to open it. On the PC, Enter also opens the highlighted block.",
   "A highlighted block's stretch bars now sit just outside it, above and below, so dragging the block moves it instead of changing its time by accident."
  ]
 },
 {
  "version": "1.65.1",
  "date": "2026-10-21",
  "title": "The phone answers at once when the PC is out of reach",
  "items": [
   "The phone responds instantly when your PC is out of reach: moving, adding and deleting blocks show right away, and sync when the PC is back."
  ]
 },
 {
  "version": "1.65.0",
  "date": "2026-10-21",
  "title": "The phone works offline; its changes sync when a PC is back",
  "items": [
   "The phone works when your PC is out of reach: add, change, delete and tick off as usual. Your changes show at once and sync to your PC (or any linked PC) as soon as it is back, in order, each made once."
  ]
 },
 {
  "version": "1.64.0",
  "date": "2026-10-20",
  "title": "Escalation, one or more at once; critical calls three times until answered",
  "items": [
   "Escalation: pick one or more (push, call, critical, alarm) for an entry.",
   "Critical calls every 10 minutes, up to 3 times, and stops once you answer (with Twilio; or tap Leaving now).",
   "The phone icon now sits on the Escalation heading."
  ]
 },
 {
  "version": "1.63.0",
  "date": "2026-10-20",
  "title": "A colour of its own for any block",
  "items": [
   "Give any block its own colour: pick one in its window, or right-click it."
  ]
 },
 {
  "version": "1.62.0",
  "date": "2026-10-20",
  "title": "Pasting is instant, a carried block shrinks, no time bubble on the PC",
  "items": [
   "Copying and pasting blocks is instant: the pasted block shows right away while it is saved.",
   "A block you pick up shrinks a little, so you can see where it will land.",
   "No extra time bubble while dragging on the PC: the time is on the block."
  ]
 },
 {
  "version": "1.61.0",
  "date": "2026-10-20",
  "title": "A task list in a block, today's column a touch brighter, no delete prompts",
  "items": [
   "A task list in a block: tick Tasks in a block window to list what to get done in it. Add, drag to reorder, remove, tick off. The block shows its progress, and Hyperfocus uses the list as its steps.",
   "Today's column is a little brighter.",
   "Deleting a task or a repeating block no longer asks first: Undo brings it back."
  ]
 },
 {
  "version": "1.60.0",
  "date": "2026-10-20",
  "title": "The doomscroll saver (the Android app)",
  "items": [
   "Doomscroll saver (Android): after a while on social media (5 minutes, or your choice), a card in the corner shows how long it has been and your next task, with a bar. Tap it to get back to Onyx. Turn it on in Settings, Doomscroll saver. Nothing is saved or sent."
  ]
 },
 {
  "version": "1.59.0",
  "date": "2026-10-20",
  "title": "Hyperfocus presence, a flame streak with epic and jackpot drops",
  "items": [
   "Hyperfocus Presence: stay with each working period for a flame streak. Your camera (PC) or your phone staying in place checks you are there; fidgeting never counts, only leaving, and breaks are free.",
   "Drops: common flames, epics and jackpots, each with its own sound and celebration.",
   "Private by design: the camera is checked on your PC only, in a sealed part of Onyx that cannot reach the internet. Nothing is recorded or sent."
  ]
 },
 {
  "version": "1.58.1",
  "date": "2026-10-20",
  "title": "A long name in the phone's Next card stops at the separator",
  "items": [
   "Phone: a long name in the Next card ends with an ellipsis before the countdown instead of running under it."
  ]
 },
 {
  "version": "1.58.0",
  "date": "2026-10-20",
  "title": "Hyperfocus pomodoro with a warm-up, silent switches and a goal for each round",
  "items": [
   "Hyperfocus pomodoro: an optional shorter warm-up round to start, silent switches between work and break, and a goal for each round, shown while that round runs."
  ]
 },
 {
  "version": "1.57.0",
  "date": "2026-10-19",
  "title": "Real recordings for the Hyperfocus sounds, and Light rain",
  "items": [
   "Hyperfocus sounds are now real recordings (CC0, from Freesound), looped without a seam: brown, pink and white noise, Rainforest rain and Beach waves.",
   "New sound: Light rain."
  ]
 },
 {
  "version": "1.56.0",
  "date": "2026-10-19",
  "title": "Tamkeen's player inside the News panel",
  "items": [
   "With the Tamkeen switch on, news videos play right in the News panel as Tamkeen's player: the video with its clickable Arabic captions and word popups, without opening Tamkeen. Onyx starts Tamkeen in the background when needed. Needs the next Tamkeen release; with an older Tamkeen, videos open in Tamkeen as before."
  ]
 },
 {
  "version": "1.55.1",
  "date": "2026-10-19",
  "title": "The globe zooms in no further than the screen",
  "items": [
   "The globe zooms in only until it fills the space between the toolbar and the bottom of the screen, never past it."
  ]
 },
 {
  "version": "1.55.0",
  "date": "2026-10-19",
  "title": "Live time while carrying, snap to the entry above, pomodoro in Hyperfocus",
  "items": [
   "While you drag an entry, it shows the time it would land on, live, with a label above it.",
   "Dropped just under another entry, it starts exactly where that one ends instead of at the next 15 minutes, so entries fit together.",
   "Hyperfocus: pick a pomodoro in the setup (25 / 5, 50 / 10, or the block's own). Work and break rounds run until the hard stop, with a soft chime at each switch."
  ]
 },
 {
  "version": "1.54.1",
  "date": "2026-10-19",
  "title": "A click off an entry only deselects it",
  "items": [
   "Clicking off a block onto the calendar's background now just closes its window and deselects it, instead of opening a new block's window where you clicked. Click empty time again to make a new block."
  ]
 },
 {
  "version": "1.54.0",
  "date": "2026-10-19",
  "title": "Backburner in a window, the month in the corner, a fixed drag on the phone",
  "items": [
   "Moving entries on the phone is fixed: a drag that got stuck no longer leaves a frozen copy of the block on screen that follows your finger while the calendar scrolls. While you carry or stretch an entry, the calendar holds still under your finger.",
   "Backburner in every task's and block's window. A task loses its date and waits in the Backburner at the foot of your tasks; a block comes off the calendar and becomes a backburner task with its name, notes, tags and length. Undo puts it back.",
   "The month shows in the empty corner above the times (two when the days run into the next month); tap it for the Month view.",
   "A highlighted entry always shows its drag bars, top and bottom, for a quick change of time, and on the phone they work straight away.",
   "The globe on the phone is tidied: Clusters and Inbox side by side along the bottom with the + button, one panel at a time, nothing overlapping.",
   "On the phone, the buttons at the foot of a window fill the width, and nothing shows through beside them."
  ]
 },
 {
  "version": "1.53.0",
  "date": "2026-10-19",
  "title": "A Hyperfocus layout for Onyx Home and the lock screen",
  "items": [
   "A Hyperfocus layout for Onyx Home and the lock screen. While a session runs, both change to one calm scene in place of the big clock, on a deep background that quiets the wallpaper: the time left on a draining ring, the study companion (the same looping cat as in the app) working under it, your goal in large type, the pomodoro when the block has one, and the hard stop. Below it, quieter under \"Rest of today\": what comes next, your goals and the day, and on the lock screen your notifications. A call from the Pi stays on top of it all. It goes back to the usual screen when the session ends."
  ]
 },
 {
  "version": "1.52.0",
  "date": "2026-10-19",
  "title": "Pinch between views, the phone's header redone, Hyperfocus fixes",
  "items": [
   "Pinch to change the view. Spread two fingers to zoom in (Month, then the week, then the Day; zooming in goes to the day under your fingers), pinch them together to zoom out. On the phone the middle step is the 3-day view; on the PC a trackpad pinch does the same.",
   "The phone's header is redone: the top bar sits right under the status bar with no empty band, then what is on now, then one line under it for what comes next (with the chimes bell at its end). One divider, even margins, and a steady height.",
   "Hyperfocus on the phone: the keyboard no longer pops up when a session starts, and the time always fits inside the ring on one line."
  ]
 },
 {
  "version": "1.51.1",
  "date": "2026-10-19",
  "title": "The Hyperfocus ring stays one solid colour",
  "items": [
   "Hyperfocus: the timer ring is one solid colour again. The pomodoro's rounds and breaks show in the bar under your goal only."
  ]
 },
 {
  "version": "1.51.0",
  "date": "2026-10-19",
  "title": "A sound menu in Hyperfocus, and fixes from a review of 1.47-1.50",
  "items": [
   "Hyperfocus: a small grey sound menu in the bottom left corner, shown as the mouse comes near. Switch between the noises, rain, waves, Silence and your Spotify playlist, and set the volume; your pick is kept for the next session. On the phone the bell opens it.",
   "On the PC, Stop now and the X were hidden under Windows' own minimise / maximise / close buttons. They now sit clear of them.",
   "Leaving with the X now keeps the session in your focus log, and tells you what was held back while you focused. With the \"Stopping here\" card up, the X closes it too (its bell no longer keeps ringing).",
   "A Hyperfocus session started on the phone now shows on Onyx Home and the lock screen straight away.",
   "A notification opened from the lock panel is cleared, as from Android's own list.",
   "Phone: the Notion / Drive picker keeps its Done button.",
   "The screen is kept on during Hyperfocus on the phone only, not on the PC."
  ]
 },
 {
  "version": "1.50.0",
  "date": "2026-10-19",
  "title": "Hyperfocus on Onyx Home and the lock screen",
  "items": [
   "Hyperfocus on your home and lock screen. While a session runs, on the phone or on the PC, Onyx Home and the Onyx panel on the lock screen show it on top: the goal, the time left to the hard stop in large type and a bar draining to it. Tap it to open Onyx."
  ]
 },
 {
  "version": "1.49.0",
  "date": "2026-10-19",
  "title": "An X to leave Hyperfocus, the phone's top bar at the top",
  "items": [
   "Hyperfocus: a small grey X in the top right corner leaves the session at once. On the PC it shows as the mouse comes near the corner; on the phone it is always there. Stop now still takes you through the wrap-up card.",
   "Phone: the top bar sits at the top again. The app now measures how much of the page the status and navigation bars really cover, so there is no empty band under the top bar."
  ]
 },
 {
  "version": "1.48.0",
  "date": "2026-10-19",
  "title": "The pomodoro on the Hyperfocus screen",
  "items": [
   "The pomodoro on the Hyperfocus screen. A pomodoro block now shows its rounds during a session: a bar under the step with Work or Break, the round, the time to the next switch and every round as a segment (on a break, one of your break ideas), and the breaks still ahead marked on the timer ring in a deeper shade of the block's colour."
  ]
 },
 {
  "version": "1.47.2",
  "date": "2026-10-19",
  "title": "Hyperfocus in a new block's window",
  "items": [
   "Hyperfocus in a new block's window: it adds the block, then sets up the session on it (the stop at the end of the block)."
  ]
 },
 {
  "version": "1.47.1",
  "date": "2026-10-19",
  "title": "The name box in a long window is no longer squeezed away",
  "items": [
   "Fixed: in a long window (a block with Escalation, a pomodoro or a repeat), the name box was squeezed to a sliver, so the name could not be edited. The window now scrolls and every row keeps its size."
  ]
 },
 {
  "version": "1.47.0",
  "date": "2026-10-18",
  "title": "Hyperfocus on the phone, your notifications under the lock panel",
  "items": [
   "Hyperfocus on the phone. Hyperfocus is now at the top of an entry's window on Android. The setup and the session screen fit the phone, the screen stays on while it runs, and the hard stop rings the full-screen alarm even with the screen off. Stop now takes the alarm back.",
   "Your notifications on the lock screen. The Onyx panel over the lock screen now lists your other apps' notifications under it: tap one to unlock and open it, hold one to clear it. Private ones show \"Contents hidden\", and your lock screen notification settings are kept. Turn it on in Settings → Home & lock screen → My notifications under the panel (it needs Notification access).",
   "Phone polish: no grey highlight stuck on top-bar buttons after a tap, and the Tasks button no longer looks switched on."
  ]
 },
 {
  "version": "1.46.0",
  "date": "2026-10-18",
  "title": "Break ideas for pomodoros and Hyperfocus, Silence option",
  "items": [
   "Break ideas for pomodoros: under Work and Rest in a block's, task's or goal step's pomodoro, write what you want to do on a break (stretch, drink water, walk to the window). Each break shows the next one: on the Now pill, in the break notice, and on the phone's due screen. A new pomodoro starts from the last list you wrote.",
   "Break ideas in Hyperfocus: a \"Break ideas\" line in the setup. The quiet body check shows your ideas in turn instead of the usual nudges (water, shoulders, eyes).",
   "Silence is a clear choice for a Hyperfocus session: the sound row ends with \"Silence\" (no sound, just the timer)."
  ]
 },
 {
  "version": "1.45.2",
  "date": "2026-10-18",
  "title": "Pomodoro breaks as a lighter shade of the block, test fix",
  "items": [
   "Pomodoro blocks are simpler: the block keeps its own colour and each break is just a lighter shade of it, where it falls (the break you are in is a touch lighter still). No extra colours or rail.",
   "Still one timer: the big Now pill at the top shows the pomodoro, with a small cross to stop it, next to the pill for what comes next.",
   "Fixed a test that still expected a ticked-off task could not be moved (it can since 1.45.1); the 1.45.1 release was published with that one test failing, which this release corrects."
  ]
 },
 {
  "version": "1.45.1",
  "date": "2026-10-18",
  "title": "Calmer pomodoro blocks, one timer, ticked tasks can move",
  "items": [
   "Pomodoro blocks look calmer. The block keeps its own colour; each break is a soft mint hatch inside it (like the Transition hatching), and a slim rail down its right edge shows the rounds: coral for work, mint for breaks, the one you are in brightest.",
   "One timer, not two: the Now pill at the top shows the pomodoro (work or break, the round and the countdown), with a small cross in it to stop the timer. The duplicate chip in the top bar is gone.",
   "A ticked-off task can be moved on the calendar (it kept its tick but would not budge). A block that cannot be moved says why when you try to drag it: the Pi's copy of an entry, or an event in a read-only calendar."
  ]
 },
 {
  "version": "1.45.0",
  "date": "2026-10-18",
  "title": "Hyperfocus mode, with a body-doubling study companion",
  "items": [
   "Hyperfocus: a calm, set-up-first session on one thing. From any task, event or block's window (or its right-click menu) set the goal, a tiny first step, an if-then plan, a hard stop (before the next entry, at the end of the block, or after a set length), a sound (brown, pink or white noise, rain, waves, or a Spotify playlist), a hook (race the clock, or a next-event countdown), a soft check-in, a body check and a pre-flight. The session fills the window with a Time Timer disc draining to the hard stop. Onyx's own popups and chimes are held until it is over. At the stop it asks where you are and the next step (saved in the entry's notes) and how deep you got, then a short wind-down with suggestions for what to do next.",
   "Body doubling: under the timer a study companion, a cat in headphones at a laptop, works quietly on a loop for the whole session, with its background removed so it blends into the screen. It pauses when the window is hidden and stays still if Windows is set to reduce animations.",
   "Reach my phone at the stop: the hard stop goes out the way your reminders go (a full-screen alarm on the phone, a push, a call or the Pi).",
   "Your best focus hours: after five rated sessions Onyx shows the three hours where your sessions go deepest, and Magic add plans focus work into them.",
   "For assistants using the MCP server: focus_status, focus_history and start_focus.",
   "\"Not now\" in a session parks a stray thought in the Magic add inbox."
  ]
 },
 {
  "version": "1.44.3",
  "date": "2026-10-18",
  "title": "Phone layout tidy-up",
  "items": [
   "The date in the top bar is never cut off now (it was shortened to \"Oct 1…\" when the pomodoro timer showed, and disappeared on small phones). The timer there is just its icon and stop button; the Now pill shows the time.",
   "The month view is readable: each entry is a small coloured bar, and a tap on a day opens that day.",
   "The round + and Magic buttons no longer show through an open drawer, the due screen or an undo bar, and messages sit above both of them instead of on top.",
   "Small things you tap (the circle that ticks a task, the calendar checkboxes, colour dots, date chips, the timer's stop) have a larger touch area, with the same look.",
   "The News handle is slimmer so it covers less of the day.",
   "Magic add keeps its title in view instead of scrolling it away on a small screen.",
   "The due screen says the trip properly (\"15 min trip, there by 6:29 PM\"; it said \"leave by\" the start time) and its buttons share a row. The Next pill and its tooltip say it the same way.",
   "The Settings tabs fade at the right edge to show they scroll."
  ]
 },
 {
  "version": "1.44.2",
  "date": "2026-10-18",
  "title": "A hidden Tasks panel leaves a tab beside News",
  "items": [
   "Fixed: with the Tasks panel switched off (the tasks button in the top bar), only the News tab was left on the right edge, with nothing to bring Tasks back. A hidden Tasks panel now leaves a slim \"Tasks\" tab beside \"News\", the same as one that was snapped shut. A click on the tab opens it again at its width, and the top-bar button opens it too."
  ]
 },
 {
  "version": "1.44.1",
  "date": "2026-10-18",
  "title": "Pomodoro blocks show their work and break bands again",
  "items": [
   "Fixed: pomodoro blocks on the calendar showed one solid colour instead of their work and break bands. A style rule was hiding them. They are back, and a bit stronger: red for the work parts, green for the breaks, each at its real place and length (a long block shows every round), with the one you are in brighter."
  ]
 },
 {
  "version": "1.44.0",
  "date": "2026-10-18",
  "title": "Panels always fit the window, buttons pinned",
  "items": [
   "Fixed: the block window could run off the bottom of the screen, hiding Save. Every window like it (a block, a task, a goal, a new block) now stays inside the app window: when it is taller than the window it scrolls, and its buttons (Save, Cancel, Complete, Delete) stay pinned along its bottom. If it grows while you use it (turning on a repeat or a pomodoro, picking an escalation) it moves up to fit again."
  ]
 },
 {
  "version": "1.43.0",
  "date": "2026-10-18",
  "title": "Onyx://task hand-off from other apps",
  "items": [
   "Other apps can hand Onyx a task with a link: onyx://task?title=...&minutes=...&due=YYYY-MM-DD&notes=...&id=...&from=... Opening it makes the task and brings Onyx forward with Magic add open, the task planned for that day around what is already there, at the length the app gave. The same id sent again updates the task instead of adding another. Built for Tamkeen's review sessions (\"Send to Onyx\").",
   "On Windows an installed Onyx registers onyx:// links itself (a second launch passes the link to the running Onyx). On Android the app now takes onyx://task links too.",
   "Links are checked and clamped (title, minutes 1-600, a real date, safe id), and a flood of them is held back.",
   "Tasks that arrive this way show where they came from (\"Tamkeen\") in Magic add."
  ]
 },
 {
  "version": "1.42.0",
  "date": "2026-10-18",
  "title": "Tasks from other apps come to Magic add, stretch entries by their edges",
  "items": [
   "Stretch any entry by its top or bottom edge. Drag either edge of a block (or a timed task) to change its time: a copy follows the pointer smoothly while a dashed outline shows where it will snap, in 15-minute steps, with the new times on a label. Let go and it settles there. Timed tasks can now be resized too (their length is kept in Onyx), and one undo takes a resize back.",
   "Tasks that arrive from other apps now come to Magic add. When a task shows up from outside (added in Google Tasks or Outlook, or by another app through the MCP server), the Magic add button shows a count and a toast says so. Open Magic add and they are listed above the text box, ticked, to be planned into the day with whatever else you type, around what is already there.",
   "A planned task is the task itself: it gets its time, its length and its travel band, with no duplicate block. \"Not now\" leaves one out of the inbox; undo of the plan puts the task back as it was and back in the inbox.",
   "Onyx only treats tasks as arrivals from the moment each list is first read, so an old backlog never floods the inbox."
  ]
 },
 {
  "version": "1.41.0",
  "date": "2026-10-18",
  "title": "Magic add, fit a described to-do list into the day",
  "items": [
   "Magic add: a sparkles button (sidebar on the PC, above the + on the phone, or press P). Describe what you need to get done, one task per line, and it fits them into the day's free time. Each task gets a length, a place and a best time of day, and the travel between places is counted inside the blocks (shown as the travel band from 1.40). Errands in the same place are grouped, focus work lands in the morning, calls in office hours, a limit like \"by 4pm\" is kept, a long job is split into sittings if it fits nowhere whole, and lunch is kept free. What cannot fit is listed, with \"plan these for the next day\" or \"add as tasks\".",
   "Review before adding: shorten, lengthen or drop a task and it is laid out again at once. Adding is one undo (the bar from 1.40).",
   "Claude (your own API key, Settings > Notion, Drive & AI) estimates the lengths, places and travel times, given your home area, how you get around and the titles and places already in that day. Without a key it guesses from the words (\"an hour and a half\", \"30 min\", \"by 5pm\", groceries, pharmacy and so on). If Claude cannot be reached it falls back to that and says so.",
   "The travel picker now shows a travel length set some other way instead of \"No travel time\"."
  ]
 },
 {
  "version": "1.40.0",
  "date": "2026-10-18",
  "title": "Undo/redo bar, travel time inside the block, stuck drag fix",
  "items": [
   "Undo and redo: after each change a bar pops up along the bottom saying what happened, with ↶ undo and ↷ redo arrows (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z on the PC). Covers ticking things off, dragging entries and tasks, new blocks, edits, deleting a one-off entry or a task, pasting and adding tasks.",
   "Travel time is now inside the block: its first minutes are the trip. The block shows it as its own striped band labelled \"Travel time\" with its times, the picker says \"in the block\" and shows when to leave and when you are there. Calls and alarms to set off come as the block starts.",
   "Fixed: a dragged entry's outline could stay stuck on the grid after lifting the finger. Reloads wait until a drag is over, and a drag still hanging once the finger is off the screen is finished where the finger was."
  ]
 },
 {
  "version": "1.39.1",
  "date": "2026-10-18",
  "title": "The phone popover never overflows sideways",
  "items": [
   "On the phone, an entry's window no longer needs scrolling left or right: every row wraps, every field shrinks to fit the screen, and the extra AM/PM picker is left out (Android's own time picker has AM/PM)."
  ]
 },
 {
  "version": "1.39.0",
  "date": "2026-10-18",
  "title": "Two-row Now/Next bar on the phone; no sideways panning",
  "items": [
   "On the phone, the Now / Next bar is two rows, so nothing is cut off:",
   "On top, small: what is on now (or \"Free time\") and, beside it, what comes next with its countdown.",
   "Below, full width: the main pill. A small line (\"Next · 7:00 AM · leave by 6:40\", \"Now · until 9:30\", or \"Break · round 2/5\") sits over the whole name, with a countdown on the right (\"5h 09m\", or \"4:32\" in the last hour).",
   "The phone's view no longer slides sideways, which carried the + button and the News tab with it. The screen is fixed like an app's, and sideways swipes go to changing the days."
  ]
 },
 {
  "version": "1.38.2",
  "date": "2026-10-18",
  "title": "The right-click menu stays off touch screens and drags",
  "items": [
   "On the phone, a long press (which picks an entry up to drag it) also opened the Open / Copy / Duplicate / Paste menu over the drag. That menu is for a mouse: it now opens only on a right-click on the PC, and never during a drag."
  ]
 },
 {
  "version": "1.38.1",
  "date": "2026-10-18",
  "title": "Short time-grid blocks keep the name; the time gives way",
  "items": [
   "On a short block (half an hour or less) in the phone's narrow columns, the time squeezed the name out and the circle and icons sat on top of the time. The name now keeps room, and the time shortens (with …) first."
  ]
 },
 {
  "version": "1.38.0",
  "date": "2026-10-18",
  "title": "Starred Gmail and flagged Outlook emails on the globe",
  "items": [
   "The globe's Show bar has Emails: your starred Gmail messages and flagged Outlook messages from the days on the globe.",
   "Each is a node in its own Emails cluster, or under its tags once you tag it. A click opens it in Gmail or Outlook.",
   "Onyx reads only the subject, sender, date and preview line, read-only.",
   "Accounts connected before this version: connect them again once (Settings → Calendars) to allow reading emails. Onyx says which ones need it.",
   "With your own Google Cloud project, also enable the Gmail API there (APIs & Services → Library → Gmail API)."
  ]
 },
 {
  "version": "1.37.0",
  "date": "2026-10-18",
  "title": "Scrub picks the part under the pointer; time row wraps",
  "items": [
   "Drag on the minutes and the minutes move (it picked the hours before): the part under the pointer is found from the text itself, so hours, minutes, AM/PM and a date's month, day and year each move on their own.",
   "The AM/PM picker no longer runs off the edge of the window: the date and time row wraps when there is no room."
  ]
 },
 {
  "version": "1.36.0",
  "date": "2026-10-18",
  "title": "Escalation fixes (Pi kept for earlier users), clearer ladder",
  "items": [
   "Fixed: since 1.34, Voice call and Critical didn't reach a Raspberry Pi whose reminder list was left on the default. Onyx took the setup for \"Alarm on my phone\" and kept the reminders off Google Tasks, so only the phone's alarm rang. Anyone who had Pi reminders keeps the Pi, and reminders saved in the meantime get their Pi task back by themselves.",
   "\"Alarm for everything as it starts\" (Android) is now off unless you turn it on. It rang the phone alarm at every start, whatever the escalation said. Now:",
   "Push only: a notification.",
   "Voice call: one call.",
   "Critical: a call, and another 10 minutes later unless you tap Leaving now.",
   "Alarm: your phone rings full screen until you press a button.",
   "The escalation choices are a clear list, one row each, with an icon, a colour and what each one really does (naming the way it goes out: the Pi, Twilio, ntfy or your phone)."
  ]
 },
 {
  "version": "1.35.0",
  "date": "2026-10-17",
  "title": "Times on every item and in the task window; clicks don't make blocks",
  "items": [
   "Every item on the calendar shows its time: short blocks beside their name (they hid it before), all-day items \"All day\".",
   "A task's window shows its time next to its date, and you can set or change it there (it is written into the name, which is how Google Tasks keeps a time). Empty means all day.",
   "A click that wobbles a little no longer turns into a new block: blocking out time needs a real drag, and a plain click on an empty slot still opens a new block."
  ]
 },
 {
  "version": "1.34.0",
  "date": "2026-10-17",
  "title": "Calls & alerts for anyone, the phone due screen, Pomodoro everywhere",
  "items": [
   "Alarm on my phone: the Onyx Android app rings a full-screen alarm. Nothing to set up.",
   "Push notification (free): install the ntfy app, subscribe to a topic of your own, and type it here. This PC sends a loud push at the time.",
   "Phone call (Twilio): fill in your Twilio account SID, auth token, your Twilio number and your own number. This PC phones you and reads out the reminder. Test buttons try it right away.",
   "Raspberry Pi (advanced): the existing Pi setup, unchanged. Anyone who already had the Pi set up stays on it.",
   "Reminders from this PC land on the exact minute. Quiet hours are kept.",
   "As something comes up (within 10 minutes) or has just started, the Onyx app on the phone shows it full screen. It has a countdown ring and the leave-by time, and goes green → amber → red and pulsing as it nears.",
   "Buttons: Done (a task) or Leaving now, Snooze 5 min, Dismiss, Open.",
   "A Pomodoro block shows Work or Break there too, with the chunk's time left.",
   "On the calendar, a Pomodoro block is colour-coded: work in red, breaks in green, the chunk you're in brighter.",
   "While one is on, the big Now pill is the timer: WORK (red) or BREAK (green), the chunk's countdown, its round, and a draining gauge. On the phone too.",
   "The Android launcher, lock-screen panel and live notification show the phase (WORK / BREAK), its countdown and round, with the bar in the phase's colour."
  ]
 },
 {
  "version": "1.33.0",
  "date": "2026-10-17",
  "title": "Next bar fixes, copy/paste, draggable dates and times, edge arrows, and more",
  "items": [
   "The Now / Next bar finds what is coming:",
   "A task you just made reaches it right away. Before, a change made while it was reading could be dropped.",
   "It looks a week ahead, so late in the evening it still finds tomorrow's first thing.",
   "Tasks due today with no time show as \"To do today\" (+N more) when nothing timed is left today, instead of \"Nothing else timed\".",
   "Copy and paste on the calendar:",
   "A click highlights an entry. Ctrl+C copies it, and Ctrl+V pastes a copy wherever the pointer is: that day and, on the time grid, that time.",
   "Right-click an entry for Open, Copy, Duplicate and Paste here, or an empty spot to paste there.",
   "Dates and times can be dragged: press on the hour, minute, day, month or year in a window and drag right to move it up, left to move it down.",
   "A 12-hour time has an AM/PM picker beside it, and the boxes are wide enough that nothing is cut off.",
   "Arrows at the calendar's sides: as the pointer nears the left or right edge, an arrow appears; click it for the previous or next days.",
   "The globe zooms in only until it touches the top and bottom of the screen.",
   "A goal's steps on the calendar show the goal's progress bar, which moves along as steps are ticked off.",
   "Android: when \"Display over other apps\" can't be switched on, the Home & lock screen tab explains how to allow restricted settings, with a button to App info."
  ]
 },
 {
  "version": "1.32.0",
  "date": "2026-10-17",
  "title": "The alarm is named after what is due as it rings",
  "items": [
   "The phone's alarm is named after the task or event that is due as it rings. Its name, start time and type are looked up at that moment, so a task renamed or moved since the alarm was set shows as it is now, on the full-screen alarm and on its notification."
  ]
 },
 {
  "version": "1.31.0",
  "date": "2026-10-17",
  "title": "Snap-shut panels, smooth phone dragging, no goal bars",
  "items": [
   "Drag the sidebar or the Tasks panel 30% narrower than it can go, and it fades to show it will snap shut. Let go, and it becomes a slim tab at its edge with its name; a click on the tab opens it again at its width. News snaps to its own tab the same way.",
   "Dragging a block on the phone is smooth. The carried copy moves once per screen frame instead of several times, the page is measured once per drag, and the copy is flat and light, so it no longer stutters or leaves artifacts.",
   "Goals no longer sit across the top of the calendar. Their steps still show as normal items, with the goal's flag, and in the Now / Next bar when one is current or next. The goals stay in the sidebar and on the globe."
  ]
 },
 {
  "version": "1.30.0",
  "date": "2026-10-17",
  "title": "The phone alarm rings and shakes until a button is pressed",
  "items": [
   "Android's alarm clock goes off at the exact minute, with the phone asleep, and wakes it.",
   "It rings your alarm sound at alarm volume (raised to at least two thirds if it was lower), on a loop, and vibrates hard without stopping.",
   "It never stops by itself. Only Stop, Snooze 5 min or Leaving now (Done, for a task) end it, on the full-screen alarm or on its notification.",
   "It works whatever your home screen and lock screen settings are. The Onyx app hands the coming times to Android whenever it loads the calendar, and Android keeps them after the app is closed and after a restart.",
   "It rings as each timed event or task starts (\"Alarm as things start\", on by default), and at the call time of anything whose escalation is Alarm. Turn the first off in Settings → Home & lock screen.",
   "To wake the phone into the full-screen alarm, allow \"Full-screen alarms\" in that tab. Without it, it still rings and shakes, as a notification with the buttons."
  ]
 },
 {
  "version": "1.29.0",
  "date": "2026-10-17",
  "title": "Alarm on the escalation ladder",
  "items": [
   "The escalation ladder has a fifth choice, Alarm: Off / Push only / Voice call / Critical / Alarm.",
   "With Alarm, your phone rings a full-screen alarm at the call time (the event's start, unless you pick another time). It wakes the phone, rings and vibrates until you press Stop, Snooze 5 min or Leaving now. The Pi doesn't call or push.",
   "On the PC, the usual popup comes at that time.",
   "An Alarm escalation rings whether Onyx is on your home screen or your lock screen. \"Alarm as things start\", in Settings → Home & lock screen, still rings for everything else.",
   "The Pi's script is updated on the Pi: it leaves Alarm entries to the phone. A call time at or after the start now rings too."
  ]
 },
 {
  "version": "1.28.0",
  "date": "2026-10-17",
  "title": "Any call time (default the start), alarms as things start",
  "items": [
   "The Pi's call time is a time picker now: set any time you like. It starts at the event's own start time, rather than an hour before. A call set for the start (or after it) rings, and the Pi says \"is starting now\" or \"started 10 minutes ago\". This needs the updated Pi script.",
   "Android: with Onyx on the lock screen, an alarm rings as each timed event or task starts. It uses Android's alarm clock, so it comes on time even when the phone is asleep. It wakes the phone and fills the screen, over the lock screen, ringing your alarm sound and vibrating until you press Stop, Snooze 5 min, or Leaving now (Done, for a task). Leaving now also tells the Pi not to call about it. Turn it off in Settings → Home & lock screen → Alarm as things start.",
   "A window's buttons wrap on a narrow phone screen, instead of Save running off the edge."
  ]
 },
 {
  "version": "1.27.0",
  "date": "2026-10-17",
  "title": "Now pill first, one window for every entry, Stop all",
  "items": [
   "While something is on, it is the big pill at the top. It counts down what is left of it, and its gauge drains as it runs; it turns amber in the last 5 minutes.",
   "What comes next sits to its right as a clearly smaller pill, with its own countdown, leave-by time and colour: green, amber, or red when it's close.",
   "With nothing on, the next thing is the big pill, as before.",
   "On the phone, the bar shows the big pill only, for room.",
   "Clicking any of them opens the same window. The sections come in the same order: when, where, repeat, notes, tags, Breakdown, Pomodoro and the Pi.",
   "The hammer (Breakdown) works on calendar entries and blocks too. Its steps go into the notes (your own notes, on a read-only calendar), or become tasks on that day.",
   "Calendar entries and blocks have the done circle and a Complete button too, with the same sweep, chime and Undo. A ticked-off one drops out of Now and Next.",
   "Tasks can be deleted from their window.",
   "Every window keeps its permanent tag saying where it came from: Google Calendar, Google Tasks, Outlook, an Onyx block, and so on. It now also says when the entry repeats.",
   "A repeating task's window, and its \"Edit all\" window, have Stop all.",
   "Google Tasks doesn't let other apps end its repeats, and it goes on adding a copy for each day. So Stop all deletes every open copy, and for the next two months deletes the copies Google still adds.",
   "A task of the same name that you add through Onyx is left alone."
  ]
 },
 {
  "version": "1.26.0",
  "date": "2026-10-17",
  "title": "Repeating blocks and the Backburner",
  "items": [
   "A block's window has a Repeat checkbox under the calendar picker. Tick it and pick how often:",
   "Daily.",
   "Weekly, on the days you pick.",
   "Monthly, on the dates you pick.",
   "Yearly, on the months and dates you pick. It describes the rule in words as you choose, for example \"Every Monday and Wednesday\" or \"Monthly on the 1st and 15th\".",
   "Each repeat wears a ↻ tag on the calendar. Hovering shows its rule.",
   "A change to one repeat goes to all of them: the name, notes, tags, time and length.",
   "Drag one to another day, and every one moves by as much. Monday and Wednesday dragged a day later become Tuesday and Thursday.",
   "Turn the repeat off on one, and that day becomes its last. Earlier ones stay.",
   "\"Delete all\" removes every repeat, after asking. \"Skip this day\" takes just that one off.",
   "Google Calendar and Onyx's own calendars repeat on any days and dates. Outlook repeats on only one date a month or a year, and says so if you pick more.",
   "Repeats made in Google Calendar or Outlook show and move the same way. A rule Onyx can't show exactly, like every 2 weeks, is left as it was.",
   "The add-task bar has a Backburner switch: a stove icon with a little purple slider. With it on, the new task gets no date, even with a time in its name. It goes to the Backburner bar at the foot of the task list.",
   "The Backburner bar folds up, and opens to show those tasks. Pick a day on one to schedule it, and it leaves the Backburner.",
   "Backburner tasks are kept in Onyx and shared with your linked desktops."
  ]
 },
 {
  "version": "1.25.0",
  "date": "2026-10-17",
  "title": "Onyx Home (a launcher) and Onyx on the lock screen",
  "items": [
   "What is on now, with a progress bar of how far through it you are and the time left.",
   "What is next, with a live countdown, and \"Leave by\" when one is set.",
   "The Pi's calls: a coming call is mentioned an hour ahead. While it rings, a call card has \"Leaving now\" (or \"Done\" for a task), and tapping it stops further calls.",
   "Your goals' progress bars.",
   "The rest of today, and the start of tomorrow. Tap any of it to open Onyx on that day.",
   "Swipe up, or tap the handle above the dock, for every app, with search. Enter opens the first match.",
   "Swipe down for notifications.",
   "Hold an app for its shortcuts, to add it to the home screen or the dock, to move it, for App info, or to uninstall it.",
   "Hold an empty spot to add or remove widgets, change the wallpaper, choose where Onyx shows, or switch home apps.",
   "Work-profile apps are included. Tap the clock for your alarms, or the date to open Onyx.",
   "To use it, choose \"Make it my home app\" in Settings → Home & lock screen, or Android's Settings → Apps → Default apps → Home app.",
   "A live notification shows what is on now with its progress bar, or what is next with a countdown, and the Pi's next call. On Android 16 it is a Live Update, at the top of the lock screen and as a chip in the status bar.",
   "When the Pi calls, an alert comes with \"Leaving now\" and \"Open Onyx\". It fills the locked screen if you allow full-screen alerts.",
   "With \"Display over other apps\" allowed, the full Onyx panel comes up over the lock screen each time the screen turns on. Swipe up, or tap Unlock, to unlock as usual."
  ]
 },
 {
  "version": "1.24.2",
  "date": "2026-10-17",
  "title": "Phone update check without the API limit; settings fit the phone",
  "items": [
   "The phone's \"Check now\" for updates no longer says it \"could not reach GitHub\" when it can. GitHub allows only 60 update checks an hour from one home connection, and they had run out. The phone now reads the same release file the PC's updater uses, which has no such limit. It only offers a new version once its APK is up.",
   "Settings on the phone: the calendar picker under \"New blocks go to\" sits under its label, instead of squeezing the words into a narrow column. The tabs stop before the close button instead of sliding under it.",
   "Tapping a button twice no longer stacks the same message several times."
  ]
 },
 {
  "version": "1.24.1",
  "date": "2026-10-16",
  "title": "Call times follow the Pi's check interval everywhere",
  "items": [
   "When you set how often the Pi checks (Settings → Pi calls → \"The Pi looks every\"), Onyx now uses that interval everywhere it works out when a call will come. That includes the time shown for tasks the Pi phones about, and the call-time choices in the event window. Before, some places still assumed 30 minutes. Spotted by the personal edition's session."
  ]
 },
 {
  "version": "1.24.0",
  "date": "2026-10-16",
  "title": "Leave-by and the escalation ladder, action cards, rollover tray, Breakdown",
  "items": [
   "The status pill has a state dot: green when you have more than 30 minutes, amber from 30 to 10, red under 10. It reads like \"NEXT: Dentist · Leave by 2:15 PM · 00h 47m\".",
   "What's on now has a Time Timer disc in the corner of its block, draining smoothly as the time runs out.",
   "Transition buffers: after a meeting that another one follows, a striped 15-minute \"Transition\" band shows the time to get from one to the next. It turns amber when the gap is tighter than that. These are the only stripes on the calendar now. Turn them off in Settings → General.",
   "Each event has a Leave time: how long before it starts you need to set off.",
   "Escalation: choose Off, Push only (an ntfy alert, no call), Voice call (at the leave-by time), or Critical (a call, then another 10 minutes later unless you tap Leaving now).",
   "At that moment a full-screen action card comes up on the PC (and in the phone app while it's open):",
   "🚀 Leaving now stops any further calls about it.",
   "⏱️ Snooze 5m brings the card back in five minutes.",
   "🔀 Need a 2-min breakdown lists tiny steps out of the door, taken from the event's notes or a short routine, with a two-minute timer.",
   "A leave-by time with no Pi reminder still brings up the card.",
   "The Pi side: the call times, push-only and \"Leaving now\" need the updated task_caller.py on the Pi. Settings → Pi calls → \"The Pi looks every\" should match how often it checks; every 5 minutes lands calls right at the leave-by time.",
   "Unfinished tasks from earlier days are now Carried over: slate grey, never red, and no longer on the calendar's timeline.",
   "They wait, folded up, in the Rollover tray at the top of the Tasks panel. Each one has Schedule today, Move to later, and Let it go (the date comes off and it rests in Someday). Undo works on all three.",
   "Anything left in the tray for two weeks moves to Someday, on the outer orbit of the globe.",
   "In a task's window, pick 1 to 5 hammers and tap Break it down. One hammer gives a few broad steps; five give tiny micro-steps.",
   "Keep the steps as a checklist in the notes (the 2-minute breakdown uses them too), or turn them into tasks.",
   "It uses Claude with your own API key, entered in Settings → Notion, Drive & AI, and sends only the task's name and notes."
  ]
 },
 {
  "version": "1.23.0",
  "date": "2026-10-16",
  "title": "The News panel reads Videos pages; news in Tamkeen's language",
  "items": [
   "YouTube stopped answering the per-channel news feeds that the News panel read, so the panel had no stories and the channel buttons had nothing to filter. Onyx now reads each channel's Videos page instead. Stories load again, and tapping a channel shows only that channel's stories.",
   "Also in this release: hover cards stay hidden while you drag an entry.",
   "With Tamkeen on your PC, the Tamkeen switch in the News panel now brings news in the language Tamkeen is set to teach (its \"I am learning\"), and the videos open in Tamkeen's player.",
   "Arabic: Al Jazeera Arabic, BBC News Arabic, Sky News Arabia, Al Arabiya, Asharq News, DW Arabic.",
   "Also Spanish, French, Japanese, Chinese, Russian, Italian and Tagalog, each with its main news channels.",
   "Titles are in the original language, and Arabic titles read right to left.",
   "Change the language in Tamkeen and the News panel follows within a minute. Turn the switch off for your usual channels."
  ]
 },
 {
  "version": "1.22.0",
  "date": "2026-10-16",
  "title": "",
  "items": [
   "Now / Next: the countdown to your next task is now the focal point of the bar. It's a centred pill with the task's name and a live h/m/s countdown in steady digits, a pulsing dot, a soft glow, and a thin bar that runs down.",
   "Two-row header: the top row is for getting around; the row under it holds what's happening now and actions for it (Now / Next, the pomodoro timer, undo, refresh).",
   "Calmer task blocks: no more stripes. A task whose time has passed gets a calm solid fill, with its colour kept in the left edge. Done tasks stay dim with a white check, and anything still ahead is full colour.",
   "Easier to read: secondary grey text has more contrast.",
   "Tasks panel: each group (From earlier, Today, Upcoming, No date) folds open and shut, and tasks show as cards.",
   "Hover previews: pointing at a calendar block shows a card with everything a short block cuts off. Short blocks now have a minimum height.",
   "Globe: an Inbox drawer for anything not yet sorted into a cluster (drag items from it onto a cluster), a toolbar in zones with one New menu, clusters sized by how much they hold, clearer depth, and names placed so they don't overlap.",
   "New icon: the PC app now uses the Orbit mark, the same as the Android app."
  ]
 },
 {
  "version": "1.21.0",
  "date": "2026-10-16",
  "title": "Carry entries freely, drag to the edge to turn the week",
  "items": [
   "When you pick up an entry, it now follows the mouse (or your finger) freely, lifted with a shadow. A dashed outline shows where it will land, and it snaps to the grid when you drop it.",
   "Drag to the edge to change weeks: hold an entry at the calendar's right edge and it turns to the next week. Keep holding to go further, then drop it on the day you want. The left edge, over the times, goes back a week. The edges light up while you drag, and fill up just before the page turns."
  ]
 },
 {
  "version": "1.20.1",
  "date": "2026-10-16",
  "title": "The globe pauses while the window is hidden",
  "items": [
   "The globe now stops drawing while Onyx is hidden in the tray or minimised, and carries on when you open it again. Since 1.17.0 it had kept spinning in the background, using power for nothing. That change made the chimes keep time while hidden, which they still do."
  ]
 },
 {
  "version": "1.20.0",
  "date": "2026-10-16",
  "title": "Popups that ring, full-colour bars, a sweep when done",
  "items": [
   "When the Pi phones you about an event, block or timed task, a popup appears in the corner of the screen at the same moment. It shows what's coming and how long until it starts, and it rings like a phone.",
   "When something starts, another popup comes up with a chime.",
   "Each popup has three buttons: Open shows the entry in Onyx, Snooze 5 min brings the popup back later, and Got it closes it. Esc and Enter work too.",
   "The popups appear over every window, even while Onyx is hidden in the tray, without taking the keyboard from what you're typing in.",
   "On the phone they show inside the app while it's open.",
   "The bell on the Now / Next bar mutes the ringing. Settings → General turns the popups off.",
   "Tapping a task's circle on the calendar sends a bright sweep across the whole bar, fills the circle white with a check, and plays a rising chime.",
   "Entries still to do are now full-colour bars. Done tasks and past entries go dim, keeping their colour only in the edge."
  ]
 },
 {
  "version": "1.19.0",
  "date": "2026-10-16",
  "title": "A satisfying tick, done tasks stay on the calendar",
  "items": [
   "Tap the circle at the left of a task on the calendar to mark it done. It works the same whether the task is past due or current.",
   "The circle pops and fills white, a check mark draws itself in, a small burst of sparks goes off, and the name is struck through. You hear a soft click, and the phone gives a short buzz.",
   "Done tasks now stay on the calendar with a white circle, so you can see what you finished. Tap the white circle to bring a task back.",
   "Ticking a task off in the Tasks panel gives the same click and burst.",
   "If you've asked your computer or phone to reduce motion, the circle just fills, without the animation."
  ]
 },
 {
  "version": "1.18.0",
  "date": "2026-10-16",
  "title": "Shame-free handling of tasks from earlier days",
  "items": [
   "Unfinished tasks from earlier days are no longer called \"Overdue\" or shown in red. They sit under From earlier, in a calm amber.",
   "Each one has one-tap Today and Tomorrow buttons, and its date chip opens a picker for any other day. Its time of day stays the same.",
   "→ Today and → Tomorrow at the top of the section move all of them at once. Copies of a task that repeats in Google Tasks are left alone, since the next copy comes by itself. \"Clear missed\" in that task's window lets the old copies go.",
   "On the calendar, stripes now follow the now line. Only an open task whose time has passed is striped. Everything ahead of the now line is fully coloured, including a task you just moved there."
  ]
 },
 {
  "version": "1.17.0",
  "date": "2026-10-16",
  "title": "The Now / Next bar",
  "items": [
   "A bar under the top bar shows Now (what you're in, with the time it has left, or \"Free time\") and Next (your next timed event or task, and when it starts).",
   "In large type it shows how much time is left before the next thing: minutes, then minutes and seconds in the last ten.",
   "The bar empties over the last hour. It turns amber at 15 minutes, orange at 5 minutes, and pulses red in the last minute.",
   "You can hear it too: a soft tone and an alert come 5 minutes before, and a chime and \"Starting now\" when it starts. The bell on the bar mutes the sounds.",
   "Click Now or Next to open that entry.",
   "It's on the PC and the phone. Turn it off in Settings → General (each device remembers its own choice).",
   "On the PC, the chimes come on time even while Onyx is hidden in the tray."
  ]
 },
 {
  "version": "1.16.0",
  "date": "2026-10-16",
  "title": "Open news videos in Tamkeen",
  "items": [
   "When Tamkeen, the Arabic study app, is installed on the PC or the phone, the News panel shows a Tamkeen switch next to the channel button.",
   "While the switch is on (green), tapping a news video opens it in Tamkeen's player, with its clickable captions and word lookups, instead of playing it in Onyx. If Tamkeen is already open, the video goes to that window.",
   "The bar under the player also has a Tamkeen button, to send just the video you're watching.",
   "Live streams still play in Onyx, because Tamkeen needs a video's captions.",
   "This needs a Tamkeen version that takes links from other apps. On the phone, an older Tamkeen gets an \"update Tamkeen\" message. On the PC, an older Tamkeen opens but doesn't load the video."
  ]
 },
 {
  "version": "1.15.0",
  "date": "2026-10-16",
  "title": "Pick the Pi call time, timed goal steps, tick tasks on the calendar",
  "items": [
   "Turn on \"Phone reminder\" for a block or event, and a time picker appears under the switch. Choose any half-hour from the day before up to the start, or leave it at the usual time.",
   "The call moves with the event if you move it.",
   "The Pi reads the chosen time from the reminder task's notes (\"Call at: …\"). It also says how long is left, for example \"due in 3 hours\". This needs the updated task_caller.py on the Pi. An older script keeps calling at the usual time.",
   "Each step in the goal builder has a time of day. A step with a time goes on your calendar at that time, including repeating daily, weekday and weekly steps.",
   "The step keeps its plain name in the goal. Its task is named with the date and time, the way Onyx and the Pi read times.",
   "Each step now takes two lines: its name on the first, and how often, its date and its time on the second.",
   "Click a task's circle on the calendar to mark it done. The circle fills in and the task moves to Archived, with Undo.",
   "Click the rest of the task to open it. Its window now has a \"Complete\" button (it used to say \"Archive\")."
  ]
 },
 {
  "version": "1.14.2",
  "date": "2026-10-16",
  "title": "Resizable sidebar, Tasks and News panels",
  "items": [
   "Drag the inner edge of the left sidebar, the Tasks panel or the open News panel to make it wider or narrower. The edge lights up when you point at it.",
   "Double-click an edge to put that panel back to its usual width.",
   "Each PC remembers its own widths.",
   "The calendar always keeps at least 380 pixels. When room runs short, for example when you open News, the Tasks panel gives way first, then the sidebar."
  ]
 },
 {
  "version": "1.14.1",
  "date": "2026-10-16",
  "title": "A date bubble on each task",
  "items": [
   "Each task in the Tasks panel has a small date chip at the end of its line, after its tags: \"Today\", \"Tomorrow\", \"Oct 22\", or \"Date\" when it has none. Overdue dates show in red.",
   "Tap it to open a date picker. The day you pick moves the task, in Google Tasks too, the same way dragging it in the calendar does. A time the task has stays the same, and a date written in its name is updated so the Pi calls on the right day.",
   "\"Clear\" in the picker removes the date."
  ]
 },
 {
  "version": "1.14.0",
  "date": "2026-10-16",
  "title": "Linked desktops",
  "items": [
   "Settings → Desktops. On the PC that is set up, choose \"Show a link code\". On the other PC, enter that PC's address and the code under \"Join a linked desktop\". The code works once, for 10 minutes.",
   "Linked desktops share the Google credentials file and the Google and Outlook sign-ins, so a new PC needs no setting up. Load a credentials file on one PC and every linked PC has it within seconds.",
   "They also share Notion, calendar links, tags, notes, goals, repeats, pomodoro splits, memos, the globe's Notion, Drive and web pins, the local time-block calendars, hidden calendars, the Pi settings and the News channels.",
   "Each PC keeps its own files and folders pinned from its disk, its window layout and its server settings.",
   "Changes reach the other desktops within seconds while they are on, and as soon as they come back otherwise. When the same thing is changed on two PCs, the later change wins.",
   "The phone uses whichever desktop is on. It learns the other desktops' addresses by itself. A phone paired only with the PC that joins needs pairing again, from any of the PCs.",
   "Everything sent between desktops is encrypted with a key only linked desktops hold. The link code lets two PCs agree on that key without the key ever crossing the network.",
   "Jobs that must happen only once, such as adding the next copy of a repeating task ticked off in Google Tasks, are done by one desktop at a time.",
   "Desktops reach each other the same way the phone does (same wifi, or anywhere with Tailscale), so \"Reachable from your network\" must be on."
  ]
 },
 {
  "version": "1.13.2",
  "date": "2026-10-15",
  "title": "Quieter globe, clusters open on tap",
  "items": [
   "Only cluster (tag) names show on the globe. Tap a cluster to open it: its items spread out and their names appear. Tap it again, or tap empty space, to close it.",
   "Items can no longer be dragged between clusters by touch, so a finger drag always spins the globe. To move an item to another cluster, tap it and change its tag. On the PC, dragging with the mouse still works.",
   "On the PC, hovering an item shows its name and notes as a tooltip."
  ]
 },
 {
  "version": "1.13.1",
  "date": "2026-10-15",
  "title": "Widget loads, globe centred, tag suggestions",
  "items": [
   "Widget: the 4x4 month layout used a plain View as a divider, which widgets may not contain, so it showed 'An error occurred when loading widget'. Now a FrameLayout; test/widgets.test.js checks every widget layout uses only views widgets allow. Month and weekday names use the plain (not stand-alone) forms.",
   "Globe: centred between the toolbar and the footer, easing along when the toolbar folds or opens (it sat at 54% of the height).",
   "Tags: the browser's own suggestion list (a datalist) drew over the form in the Android app; existing tags are now chips to tap under the field, filtered by what is typed."
  ]
 },
 {
  "version": "1.13.0",
  "date": "2026-10-15",
  "title": "Orbit icon, 4×4 month widget, swipe between dates",
  "items": [
   "Android: new 'Orbit' app icon (adaptive, themed on Android 13+) and splash; the widget is added at 4×4 and shows the month with the picked day's agenda; the globe widget is gone.",
   "Phone: swipe the calendar left or right to change dates; a roomier goal editor; a short date range in the top bar that fits, with Undo only when there is something to undo."
  ]
 },
 {
  "version": "1.12.0",
  "date": "2026-10-15",
  "title": "Release workflow can tag and release from the Actions tab",
  "items": [
   "The phone works from any network through Tailscale: it learns the PC's current addresses from the PC itself, so no new scan is needed once Tailscale is on both. Settings on both sides show whether \"Away from home\" is on, with setup steps when it isn't.",
   "The globe's toolbar folds down to Day / Week / Month / Range behind an arrow; the phone starts folded.",
   "A phone talking to an older Onyx on the PC says once that the PC needs updating, instead of \"Unknown command\" errors.",
   "Releases: GitHub Actions now builds the Windows installer next to the APK, and the release notes are the tag's message."
  ]
 },
 {
  "version": "1.11.0",
  "date": "2026-10-14",
  "title": "Android home-screen widgets",
  "items": [
   "Two widgets in the picker, Onyx Calendar and Onyx Globe, each switching between the two. Both resize freely (110x40dp to full screen), and the layout follows the size: a one-row strip (what is next, or a small globe), a day's agenda or the globe, and the whole week when tall.",
   "Interactive: step through days, tap the date for today, turn the globe, switch views, refresh, open the app; tap a row to open that day, tap the check mark to tick a task off (through a small invisible activity, since Android blocks opening the app from a broadcast).",
   "The globe is drawn natively: a sphere with a cluster per tag, entries around it, back to front, sized to the widget.",
   "The widgets read from the PC themselves (GET /api/agenda, /api/tasks, /api/tags, POST /app/rpc), with the address and token the app hands over, every 30 minutes, after changes in the app, and on refresh; offline they keep the last copy and say so.",
   "onyx://open?view=calendar|globe&date=... opens the app there.",
   "/api/agenda now includes each entry's colour."
  ]
 },
 {
  "version": "1.10.0",
  "date": "2026-10-14",
  "title": "Pomodoro timer, files and folders on the globe",
  "items": [
   "Any event, time block or task can be split into work and rest chunks. A task also gets a start time (written into its name, which the Pi reads) and a length, so its block on the calendar is as long as the session. Goal steps open their task's settings from a clock button.",
   "The day and week views draw the rest chunks inside the block where they fall.",
   "A timer in the top bar starts by itself when a pomodoro block's time comes: \"Task name - working\" / \"Task name - rest\", a countdown, the round, a progress line, and a chime plus a notification at each switch. Stop hides it for that block. While it runs, the date range gives way so the label stays readable.",
   "A repeating task's split carries on to its next copy; a block moved to another calendar keeps its split.",
   "The window may chime without a click first.",
   "\"+ File\" pins files or folders from this PC (the PC's own picker), or drag them from File Explorer or the desktop onto the globe; onto a tag's cluster to tag them.",
   "Open and Show in folder work only on pinned items, from the PC; the phone lists them. Moved or deleted files are marked. IPC names: files:pick, files:add, files:open (PC only)."
  ]
 },
 {
  "version": "1.9.0",
  "date": "2026-10-14",
  "title": "Daily goal steps, Google repeats as one node, links",
  "items": [
   "A step can be Once or a habit (Daily, Weekdays, Weekly): its task repeats, every time it is done is logged, and it counts toward the goal in part (12 of 90 days). Ticking a step in the goal window is saved at once (goal:step) and moves the progress bar; progress shows as a percentage.",
   "Google's API has no repeat field: each copy is its own task. Copies with the same name in the same list are one series; how often they repeat is worked out from their dates. The globe shows one node, \"Name (repeated)\", in a Repeating cluster. \"Edit all\" changes the name, time and notes of every open copy; \"Clear overdue\" ticks off missed days. How often can only be changed in Google Tasks (repeats Onyx keeps stay fully editable).",
   "Every window shows its source (Google Calendar, Google Tasks, Outlook, To Do, calendar link, Onyx), the calendar or list and account, and how it got there (added from Onyx, a goal's step, a Pi reminder, a repeat). Entries added from Onyx are remembered.",
   "Links in any notes get an \"Open link\" button (http or https only).",
   "\"+ Link\" pins any web address to the globe (library: source 'web').",
   "Clusters tab: tick boxes per tag (and \"Without a tag\"); unticking hides a cluster at once, without a reload or Save. Remembered on this screen.",
   "Tasks can be dragged from the Tasks panel onto a cluster (tag or day).",
   "Notion and Drive items ask which tags to add before they are pinned.",
   "Undoing a repeating task moves its goal step back before deleting the next copy, so the step keeps its task."
  ]
 },
 {
  "version": "1.8.0",
  "date": "2026-10-14",
  "title": "Goals and repeating tasks",
  "items": [
   "A long-term goal has a name, a time frame, notes, tags, a colour and steps. It is set from \"+ New goal\" in the sidebar; \"Spread dates\" spaces the steps out up to the target date.",
   "Each step is a real task in Google Tasks / To Do, so it shows in the Tasks panel (with a goal badge), on the calendar and in Google; the Pi phones about it as usual. Steps follow their tasks: done or moved in Onyx or Google.",
   "The time frame is one bar across the calendar, filled with the progress, and it can be hidden from the sidebar like a calendar.",
   "On the globe a goal is one node with a progress ring. Its step tasks and its bar are not drawn on their own, so a goal never shows up many times.",
   "MCP: list_goals.",
   "A task can repeat every day, weekday, week, 2 weeks, month or year (Repeat in the task popover). Google Tasks has no API for repeats, so Onyx keeps the rule: when the task is done, in Onyx or in Google, the next one is added with the next date (never in the past) and the rule moves to it. Undo takes it back.",
   "Providers gain getTask, so a task gone from the open list can be told apart: done (next one added) or deleted (the repeat ends)."
  ]
 },
 {
  "version": "1.7.0",
  "date": "2026-10-14",
  "title": "A News tab with YouTube news",
  "items": [
   "A collapsible tab on the right edge (a pull tab on the phone) opens a News panel: the latest videos from YouTube news channels, newest first, with a player.",
   "Stories come from each channel's public feed, read by the PC (no API key); Shorts are left out, and the list refreshes every 10 minutes while open.",
   "Channels: BBC, Reuters, AP, NBC, CBS and Al Jazeera to start, more to switch on, and any channel can be added by link or @handle. Shared with the phone.",
   "24/7 live streams (NBC News NOW, CBS News, Al Jazeera, DW, France 24, Bloomberg).",
   "Next plays the following story, and so does the end of a video.",
   "The window is a file:// page, so YouTube's player got no Referer and refused to play (Error 153); main.js adds one to YouTube requests."
  ]
 },
 {
  "version": "1.6.2",
  "date": "2026-10-14",
  "title": "Notes on every task and item",
  "items": [
   "Tasks get an editable notes box, saved to Google Tasks / To Do, with a preview line in the Tasks panel and the Archived tab.",
   "Event and block notes grow as you type; on read-only calendars your notes are kept in Onyx (memos), next to the calendar's own.",
   "Pinned Notion pages and Drive files take notes too (kept in Onyx).",
   "Entries with notes show a note icon; hovering one in the calendar or on the globe shows them. MCP returns pin notes and my_notes on events."
  ]
 },
 {
  "version": "1.6.1",
  "date": "2026-10-14",
  "title": "Due dates when adding, Undo, Archived tasks",
  "items": [
   "The add bar in the Tasks panel takes a due date (or Today / Tomorrow); a picked date wins over one typed in the name, so Google Tasks and the Pi agree.",
   "The task popover has a date field, for tasks without a date to drag.",
   "Marking a task done archives it: an Undo toast, an Undo button at the top and Ctrl+Z mark it not done again.",
   "An Archived tab lists tasks completed on a picked day (read back from Google Tasks / To Do), with Restore and Delete forever. Delete is gone from the popover."
  ]
 },
 {
  "version": "1.6.0",
  "date": "2026-10-14",
  "title": "Enter keys on either device",
  "items": [
   "Enter keys on either device"
  ]
 },
 {
  "version": "1.5.1",
  "date": "2026-10-14",
  "title": "Android updates inside the app",
  "items": [
   "Android updates inside the app"
  ]
 },
 {
  "version": "1.5.0",
  "date": "2026-10-14",
  "title": "Tasks group by due date on the globe; drag items between clusters",
  "items": [
   "Tasks group by due date on the globe; drag items between clusters"
  ]
 },
 {
  "version": "1.4.1",
  "date": "2026-10-13",
  "title": "",
  "items": [
   "Small fixes"
  ]
 },
 {
  "version": "1.4.0",
  "date": "2026-10-13",
  "title": "Update button and new-version popups",
  "items": [
   "Windows: an update button in the title bar checks GitHub releases; the app also checks shortly after starting and every six hours. A popup shows the new version and its notes; \"Update now\" downloads it with a progress bar, installs it silently and restarts (electron-updater).",
   "Android: the app checks the latest release for a newer APK, shows the same popup, and hands the download to the browser to install.",
   "Settings > General: \"Check now\".",
   "Releases now carry latest.yml and the installer blockmap for the updater."
  ]
 },
 {
  "version": "1.3.0",
  "date": "2026-10-13",
  "title": "Globe button, notes, Notion and Drive on the globe",
  "items": [
   "A globe button in the title bar flips between the calendar and the globe (G on the keyboard); it replaces the Graph view button",
   "Notes: written in Onyx, tagged into clusters, shown as diamonds",
   "Notion pages and Google Drive files can be searched and pinned to the globe (squares), tagged, and opened from it. Notion uses an internal integration secret (Settings > Notion & Drive); Drive uses the Google sign-in with the new drive.metadata.readonly scope",
   "Untagged notes and documents gather in Notes / Notion / Drive clusters; \"Cluster by Sources\" groups everything by where it comes from",
   "MCP: list_notes and create_note",
   "The phone app gets all of it through the PC"
  ]
 },
 {
  "version": "1.2.0",
  "date": "2026-10-13",
  "title": "README: scanning in the app, the globe graph; new graph screenshot",
  "items": [
   "Graph view is now a globe: cluster hubs sit on the surface of a sphere, entries gather around them in 3D, and entries with several tags pass through the inside. A wireframe and atmosphere show the curvature, the far side fades, and a flick keeps it spinning.",
   "Android: \"Scan QR code\" in the app uses the phone's own scanner, so pairing no longer depends on the camera app opening onyx:// links (which it hands to Google instead). Also in Settings > Connection.",
   "Android minimum raised to 8.0 (needed by the scanner)."
  ]
 },
 {
  "version": "1.1.0",
  "date": "2026-10-13",
  "title": "Tags, graph view, Android app",
  "items": [
   "Tags on any block, event or task, kept only in Onyx. Sidebar list to filter, recolour, rename and delete; MCP tools list_tags and set_tags, and a tag filter on get_agenda, list_tasks and the JSON API",
   "Graph view: a 3D orbit of a day, week, month or custom range, clustered by tag, calendar or day; click a cluster to fly in, click an entry to edit it",
   "Android companion app (Capacitor): same window code, talking to the PC app over /app/rpc; paired by scanning a QR code in Settings > Phone; keeps the last sync for offline viewing",
   "GitHub Actions workflow that builds and signs the APK and attaches it to the release",
   "Phone layout: three-day view, drawers, bottom-sheet editor"
  ]
 },
 {
  "version": "1.0.0",
  "date": "2026-10-13",
  "title": "The first release",
  "items": [
   "Google, Outlook, .ics links and local time blocks merged into one master calendar, with a sidebar to switch each calendar on and off",
   "Drag on the grid to block out time",
   "Google Tasks and Microsoft To Do in a side panel",
   "Phone reminders through the Raspberry Pi task_caller, by keeping a matching Google Task in step with each event",
   "MCP server and JSON API for Hermes and other agents",
   "NSIS installer"
  ]
 }
];
