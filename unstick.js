// Unstick (1.144.0): what to do right now when you know what to do and can't make yourself start.
// Pick what's in the way, do the first card. The cards come from the Unstick Field Kit: each says
// how strong its evidence is and why it works. app.js (openUnstick) draws them and runs the tools
// (a timer, the long-exhale breath, the step shrinker).
(function () {
  'use strict';

  // [label, link]
  const SOURCES = [
    ['Diamond (2013). Executive functions. Annual Review of Psychology.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4084861'],
    ['Gollwitzer & Sheeran (2006). Implementation intentions: a meta-analysis of 94 tests.', 'https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f'],
    ['Sheeran, Listrom & Gollwitzer (2024/25). The when and how of planning: 642 tests.', 'https://kops.uni-konstanz.de/handle/123456789/69905'],
    ['Sirois & Pychyl (2013). Procrastination and short-term mood repair.', 'https://eprints.whiterose.ac.uk/id/eprint/91793/'],
    ['Wohl, Pychyl & Bennett (2010). Self-forgiveness for procrastinating reduces future procrastination.', 'https://bps.org.uk/research-digest/cure-procrastination-forgive-yourself'],
    ['Balban et al. (2023). Brief structured breathing improves mood. Cell Reports Medicine.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947'],
    ['Garrett et al. (2024). A single bout of exercise and cognition: meta-analysis.', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11358546'],
    ['Milkman, Minson & Volpp (2014). Temptation bundling.', 'https://repository.upenn.edu/oid_papers/150'],
    ['Safren et al. (2010, JAMA). CBT for adults with ADHD.', 'https://chadd.org/attention-article/mastering-your-adult-adhd/'],
    ['Ekers et al. (2014). Behavioural activation for depression: 26 RCTs.', 'https://pubmed.ncbi.nlm.nih.gov/24936656/'],
    ['Dai, Milkman & Riis (2014). The fresh start effect.', 'https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf'],
    ['Marx et al. (2021). Altered time perception in ADHD: 55 studies.', 'https://eprints.soton.ac.uk/456003'],
    ['Ara et al. (2025). Body doubling for ADHD: prior findings inconclusive.', 'https://arxiv.org/abs/2509.12153'],
    ['Autistic adults on inertia (2023). Autism.', 'https://journals.sagepub.com/doi/10.1177/13623613231198916'],
    ['Lowe et al. (2017). Sleep restriction and cognition: meta-analysis.', 'https://peeref.com/works/4289402'],
    ['Mahan. The Wall of Awful.', 'https://adhdtimeonair.riverside.com/e/overcoming-the-wall-of-awful-with-brendan-mahan'],
    ['Cross & Sheffield (2019). Mental contrasting: meta-analysis.', 'https://pubmed.ncbi.nlm.nih.gov/30879403/'],
    ['University of Minnesota. ADHD skills: getting started.', 'https://effectiveu.umn.edu/academics/adhd-executive-functioning/adhd-skills-getting-started'],
    ['Diamond (2020). Executive functions. Handbook of Clinical Neurology.', 'https://mail.devcogneuro.com/Publications/Diamond_2020_executive_functions.pdf'],
    ['Kappes & Oettingen (2011). Positive fantasies sap energy.', 'https://researchonline.lse.ac.uk/id/eprint/46284'],
    ['Pham & Taylor (1999). Process vs outcome simulation.', 'https://journals.sagepub.com/doi/10.1177/0146167299025002010'],
    ['Libby et al. (2007). Picture yourself at the polls.', 'https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2007.01872.x/'],
    ['(2016). Third-person visualisation and behaviour difficulty.', 'https://eprints.whiterose.ac.uk/109480/'],
  ];

  // Each technique: name, how long, evidence, sources (1-based), the tool it opens, steps, why.
  // tool: ['timer', minutes] | ['breathe'] | ['shrink']
  const T = {
    micro: { name: 'Shrink the first step', time: '30 sec', ev: 'moderate', src: [9, 18], tool: ['shrink'],
      steps: ['Say the task in three words.', "Ask: what's the first thing my hands do?", 'Shrink it until it feels almost silly: "open the laptop", not "write the report".', 'Do only that. Stopping afterward is allowed.'],
      why: "A big, vague task gives your brain nothing to grab. A concrete first movement takes the planning load off at the moment you're weakest. Breaking tasks into steps is a core skill in the CBT programme for adult ADHD that beat relaxation training in a randomised trial." },
    five: { name: 'Five-minute deal', time: '5 min', ev: 'practice', src: [9, 18], tool: ['timer', 5],
      steps: ['Promise yourself five minutes. Only five.', 'Start the timer.', 'When it rings, choose: stop or keep going. Both count.'],
      why: 'Starting usually costs more than continuing. A short, fixed commitment lowers the price of starting, and the timer takes the decision out of your head.' },
    ifthen: { name: 'If–then trigger', time: '30 sec', ev: 'strong', src: [2, 3],
      steps: ['Pick a cue about to happen: the timer beeps, I set my cup down, the clock hits :15.', 'Say it: "If [cue], then I will [tiny step]."', 'Say it twice. Wait for the cue, then move.'],
      why: 'Tying a specific cue to a specific action hands the start to the situation instead of willpower. Across 94 tests, if–then plans had a medium-to-large effect on reaching goals (d = 0.65), and a 642-test update found it holds.' },
    watch: { name: 'Watch yourself start', time: '1 min', ev: 'moderate', src: [22, 23],
      steps: ['Pick the tiniest first step.', 'Close your eyes and picture yourself from across the room, like a video, doing exactly that step.', 'Open your eyes and do it.'],
      why: "People who pictured themselves acting from an observer's viewpoint were more likely to follow through. The boost held for easier behaviours, so use it on the smallest step." },
    double: { name: 'Get a body double', time: '2 min', ev: 'emerging', src: [13], tool: ['timer', 25],
      steps: ['Text someone: "Doing [task] for 25 min. Want to work at the same time?"', 'Or open a live focus room or a "study with me" video.', "Say out loud what you're starting. Start the timer."],
      why: 'Many ADHD adults find working with someone present helps them start and stay on task. Lab evidence is thin and mixed, so treat it as a personal experiment.' },
    startfun: { name: 'Start with the easy part', time: '10 sec', ev: 'practice', src: [18],
      steps: ['Find the part of the task you mind least.', 'Do that part first, even out of order.', 'Let the momentum carry you to the next piece.'],
      why: 'Starting anywhere breaks the freeze. Campus ADHD programmes recommend opening with the most enjoyable piece.' },
    dump: { name: 'Dump it, pick one', time: '3 min', ev: 'moderate', src: [1, 9], tool: ['shrink'],
      steps: ['Write every task in your head on one list. No sorting.', 'Circle one: the one that matters most, or the easiest.', 'Hide the rest. Shrink the circled one.'],
      why: 'Working memory is small. Holding many tasks at once eats the capacity you need to act. Getting them out of your head frees it.' },
    feel: { name: "Name what you're avoiding", time: '1 min', ev: 'moderate', src: [4, 16],
      steps: ['Finish the sentence: "I\'m avoiding feeling ___" (bored, stupid, judged, swamped).', 'Rate it 0 to 10.', 'Tell yourself: "I can do the first step at a [number]." Then do it.'],
      why: "Procrastination is mostly short-term mood repair: you avoid the bad feeling attached to the task, not the task. Naming it makes it the target, and starting while it's there shows your brain the task is survivable." },
    forgive: { name: 'Forgive the lapse', time: '30 sec', ev: 'moderate', src: [5],
      steps: ['Say: "I delayed. That happened."', 'Say: "I forgive myself for it."', 'Say: "The next step is ___." Do it.'],
      why: 'Self-criticism piles more bad feeling onto the task, which feeds more avoidance. Students who forgave themselves for procrastinating procrastinated less before the next exam.' },
    breathe: { name: 'Long-exhale breathing', time: '1–5 min', ev: 'moderate', src: [6], tool: ['breathe'],
      steps: ['Breathe in through your nose.', 'Top up with a second short sniff.', 'Breathe out slowly through your mouth, longer than the inhale. Repeat for 1 to 5 minutes.'],
      why: 'In a 2023 randomised trial, five minutes a day of this "cyclic sighing" improved mood and lowered breathing rate more than mindfulness meditation. It settles you enough to try a first step.' },
    move: { name: 'Move for 5–10 minutes', time: '5–10 min', ev: 'moderate', src: [7], tool: ['timer', 10],
      steps: ['Walk around the block, take the stairs, or do 30 jumping jacks.', 'Leave the phone alone while you move.', 'Come back and do the first tiny step right away.'],
      why: 'A single bout of exercise gives a small but consistent lift to working memory and inhibition, within minutes.' },
    bundle: { name: 'Bundle a treat', time: '1 min', ev: 'moderate', src: [8],
      steps: ['Pick something you enjoy: a podcast, a playlist, a good coffee.', 'Allow it only while you do this task.', 'Start both at the same moment.'],
      why: 'People who could only hear gripping audiobooks at the gym went 51% more often at first. The boost faded over weeks, so rotate the treat.' },
    actfirst: { name: 'Act before you feel like it', time: '5–15 min', ev: 'strong', src: [10],
      steps: ['Pick one small action with a clear end: wash five dishes, answer one email.', 'Do it now, whatever your mood says.', 'Afterwards rate it 0 to 10: how hard, how did it feel? Compare with what you predicted.'],
      why: 'Behavioural activation flips the order: action first, motivation follows. A meta-analysis of 26 randomised trials found it clearly outperformed controls for depression.' },
    basics: { name: 'Check the fuel', time: '2 min', ev: 'strong', src: [15],
      steps: ['Ask: did I sleep, eat, and drink water?', 'Fix the quickest one now: water or a snack.', 'Bad-sleep day? Cut today\'s target in half, on purpose.'],
      why: 'Sleep restriction measurably impairs executive function. Lowering the bar on those days is planning for reality.' },
    park: { name: 'Distraction parking lot', time: 'ongoing', ev: 'moderate', src: [9],
      steps: ['Keep a note open beside you (a sticky note works).', 'When a distracting thought shows up, write it in three to five words.', 'Go back to the task. Deal with the list at your next break.'],
      why: 'Writing distractions down instead of acting on them is part of the CBT programme for adult ADHD.' },
    friction: { name: 'Move the temptation', time: '1 min', ev: 'practice', src: [19],
      steps: ['Put your phone in another room or a drawer.', "Close every tab this task doesn't need.", "Put the task's first item in front of you: open the file, lay out the tools."],
      why: 'It makes more sense to avoid strong temptation than to keep spending willpower against it. Every cue you remove is one less fight.' },
    timevis: { name: 'Make time visible', time: '30 sec', ev: 'practice', src: [12], tool: ['timer', 25],
      steps: ['Put a countdown where you can see it.', 'Before starting, guess how long this takes. Write the guess down.', 'When done, compare. Use the gap when you plan next time.'],
      why: "Differences in time perception show up consistently in ADHD across 55 studies. If you can't feel time reliably, show it instead." },
    alarm: { name: 'Two-alarm warning', time: '1 min', ev: 'practice', src: [2, 12],
      steps: ['Set one alarm 10 minutes before you must switch, one at switch time.', 'Label each with the next action: "Shoes on", "Save and close".', 'When it rings, follow the label, not your mood.'],
      why: 'An alarm with a written action is an if–then plan your phone holds for you.' },
    transition: { name: 'Landing step for switching', time: '2 min', ev: 'practice', src: [14],
      steps: ['Before stopping, write the very next action for when you come back (a Hemingway bridge).', 'Make a physical marker: stand up, drink water, leave the room for a minute.', 'Begin the new task with its smallest first step.'],
      why: 'Starting, stopping and switching are hard with ADHD and autistic inertia. A clear restart point lowers the cost of the switch.' },
    fresh: { name: 'Draw a fresh-start line', time: '30 sec', ev: 'moderate', src: [11],
      steps: ['Pick the next clean marker: top of the hour, after lunch, tomorrow 8:00.', 'Tell yourself the earlier block is closed.', 'Make that marker the cue for one small step.'],
      why: 'People take up goals more often just after time markers, which separate them from past slip-ups. Use it as a reset, not a guarantee.' },
  };

  // What's in the way: [id, label, sub, techniques in order (do the first)]
  const STATES = [
    ['frozen', "Can't start", 'I know what to do. Nothing happens.', ['micro', 'five', 'ifthen', 'watch', 'double', 'startfun']],
    ['overwhelmed', 'Too much', "Don't know where to begin.", ['dump', 'micro', 'ifthen']],
    ['dread', 'Dreading it', 'The task feels awful.', ['feel', 'breathe', 'bundle', 'double']],
    ['flat', 'No energy', 'Flat, foggy, heavy.', ['basics', 'move', 'actfirst', 'bundle']],
    ['unmotivated', "Can't make myself care", 'Why bother? The goal feels far off.', ['watch', 'actfirst', 'bundle', 'fresh']],
    ['drifting', 'Keep drifting', 'Started, but I wander off.', ['friction', 'park', 'five', 'double']],
    ['time', 'Losing time', 'Hours vanish. Late again.', ['timevis', 'alarm', 'ifthen']],
    ['switch', "Can't stop or switch", "Locked in, or can't change gears.", ['transition', 'alarm', 'move']],
    ['shame', 'Beating myself up', 'I wasted the day.', ['forgive', 'fresh', 'feel', 'breathe']],
  ].map(([id, label, sub, cards]) => ({ id, label, sub, cards }));

  const EVIDENCE = { strong: 'Strong', moderate: 'Moderate', emerging: 'Emerging', practice: 'Practice-based' };

  window.OnyxUnstick = { SOURCES, T, STATES, EVIDENCE };
})();
