// Faith & Money is original Money Moves writing. Scripture quotations are from
// the World English Bible (WEB), a public-domain translation published by
// eBible.org. Keep quotation text exact when updating this library.
export const DEVOTIONAL_LIBRARY_ID = 'faith-and-money';
export const DEVOTIONAL_TRANSLATION = 'WEB';
export const DEVOTIONAL_TRANSLATION_ATTRIBUTION = 'World English Bible (WEB), public domain.';
export const DEVOTIONAL_CONTENT_VERSION = 1;

const devotional = (value) => ({
  ...value,
  contentVersion:DEVOTIONAL_CONTENT_VERSION,
  translation:DEVOTIONAL_TRANSLATION,
  translationAttribution:DEVOTIONAL_TRANSLATION_ATTRIBUTION,
  estimatedMinutes:7
});

export const FAITH_MONEY_DEVOTIONALS = Object.freeze([
  devotional({
    id:'faith-money-mammon', sequence:1, theme:'Mammon', title:'What Sits on the Throne?',
    verseReference:'Matthew 6:24',
    verseText:'No one can serve two masters, for either he will hate the one and love the other; or else he will be devoted to one and despise the other. You can’t serve both God and Mammon.',
    devotionalText:`Money is useful. It pays for groceries, keeps lights on, creates room for generosity, and can help us prepare for ordinary responsibilities. Jesus did not describe money as imaginary or unimportant. He described a rival loyalty. Mammon is not merely a number in an account; it is the promise that enough money will make us finally safe, important, or in control.

That promise can sound reasonable. A budget can become a quiet attempt to eliminate every uncertainty. A promotion can become evidence that we matter. A purchase can become a way to soothe a fear we have not named. Even scarcity can make money feel like the center of every decision. None of this makes you foolish or faithless. It does invite an honest question: when money speaks loudly, whose voice becomes harder to hear?

Serving God does not mean ignoring bills, refusing work, or pretending needs are unspiritual. It means refusing to ask money to do what only God can do. Money can be planned, earned, given, saved, and spent. It cannot tell the truth about your worth. It cannot guarantee that people will stay. It cannot make every future outcome manageable.

Notice where money has become emotionally loaded for you. Perhaps it represents relief after a hard season. Perhaps it represents freedom, recognition, or a fear of dependence. Bring that meaning into the light without shame. A clear look is not condemnation; it is the beginning of freedom.

Today, let one practical choice become an act of worship rather than an attempt at self-protection. Review a balance honestly. Delay an impulse purchase. Make a plan for a bill. Ask for help. Give thanks for provision already present. The action does not earn God’s care. It helps your habits tell the truth about who leads your life.

You do not need to solve your entire relationship with money in one reflection. Pay attention to the next place where fear asks for more authority than it deserves. Let that recognition become a prayer and a practical choice. The point is not to despise money or deny need. The point is to let your habits witness to a deeper source of security.`,
    prompts:[
      {id:'mammon-meaning', text:'What does money most often represent to you emotionally: safety, freedom, approval, control, or something else?'},
      {id:'mammon-voice', text:'Where do you notice money becoming louder than trust, gratitude, or wisdom?'},
      {id:'mammon-practice', text:'What small financial action could help you practice serving God rather than fear today?'}
    ],
    optionalClosingReflection:'God, help me receive money as a tool and not a master. Teach me to act wisely without asking possessions to carry my identity.'
  }),
  devotional({
    id:'faith-money-stewardship', sequence:2, theme:'Stewardship', title:'Faithful With What Is Here',
    verseReference:'1 Corinthians 4:2',
    verseText:'Here, moreover, it is required of stewards that they be found faithful.',
    devotionalText:`Stewardship begins with a simple shift: what is in our hands is entrusted, not self-defining. That is true whether the amount feels abundant, thin, growing, or uncertain. Faithfulness is not a contest with someone else’s income, family circumstances, health, opportunities, or starting line. It is a response to the real life you have been given today.

Sometimes stewardship language becomes heavy, as if every receipt proves a person’s character. That is not its purpose. A steward is not a machine that never rests, enjoys, makes a mistake, or needs mercy. Faithfulness is practiced over time through attention, honesty, repair, and care. It can look like opening the statement you have avoided. It can look like making a modest plan instead of an impressive one. It can look like acknowledging a limit without calling yourself a failure.

Your resources include more than money. Time, attention, work, relationships, skills, energy, and possessions all require discernment. That does not mean every hour must be optimized. It means our choices can be brought before God with openness. We can ask whether a habit reflects the values we say matter: rest, generosity, responsibility, truthfulness, or care for people entrusted to us.

Use this moment to separate faithfulness from performance. You may not be able to change every financial condition at once. You can take one truthful next step. Track what is actually happening. Set a boundary that protects an essential need. Keep a promise you can realistically keep. Receive help without pretending you have none.

Stewardship is not proof that you deserve security. It is a way of participating in the life God has given you. The goal is not a perfect spreadsheet. The goal is a more integrated life, where the way you use resources increasingly agrees with the love, honesty, and humility you want to practice.

Consider the difference between reacting and tending. Reaction is driven by urgency and self-protection; tending returns, notices, and acts with care. Your finances may need many small acts of tending. None needs to be dramatic to matter. Faithfulness grows through repeated attention, especially when you choose honesty on a day when avoidance would feel easier.`,
    prompts:[
      {id:'stewardship-entrusted', text:'What resource in your life feels especially entrusted to your care right now?'},
      {id:'stewardship-honesty', text:'What financial fact would become lighter if you faced it honestly and without self-contempt?'},
      {id:'stewardship-step', text:'What is one faithful next step that is realistic for this week?'}
    ],
    optionalClosingReflection:'God, make me faithful with what is here. Give me courage for honesty, wisdom for limits, and grace to begin again.'
  }),
  devotional({
    id:'faith-money-contentment', sequence:3, theme:'Contentment', title:'Enough for Today',
    verseReference:'1 Timothy 6:6–8',
    verseText:'But godliness with contentment is great gain. For we brought nothing into the world, and we certainly can’t carry anything out. But having food and clothing, we will be content with that.',
    devotionalText:`Contentment is often confused with settling, denial, or a lack of ambition. Scripture offers something sturdier. Contentment is the capacity to receive the present without letting unmet desires decide whether life is good. It does not deny that needs are real. It does not tell a person in hardship to be grateful for injustice. It refuses to make endless acquisition the measure of a meaningful life.

Money can train our attention toward what is missing. There is always a better home, a newer device, a more impressive vacation, a more secure account balance, or a version of ourselves who never worries. Desire itself is not the enemy. Desire can point to beauty, rest, belonging, generosity, or a need for change. The question is whether desire becomes a demand: I cannot be at peace until I have this.

Contentment creates a pause between wanting and obeying the want. In that pause, you can ask what the desire is trying to accomplish. Do you need relief? Recognition? Rest? A sense of being included? Sometimes the wisest response is a planned purchase. Sometimes it is a conversation, a walk, a boundary, or a reminder of what is already sustaining you.

Try naming a few ordinary gifts that are easy to overlook: a meal, a person who knows you, work you can do, a safe place to sleep, a skill you are learning, a moment of laughter. Gratitude is not a demand to feel cheerful. It is a practice of seeing what is present alongside what is unfinished.

Contentment can make room for wise goals because it frees them from panic. You can save, repair, learn, and plan without turning the next milestone into your savior. Enough for today is not the end of hope. It is a place to stand while hope becomes more truthful.

If contentment feels distant, begin with attention rather than emotion. Notice one thing that is sustaining you and one desire you can hold without immediately satisfying. This is not a denial of hope. It is a way to let hope become patient, practical, and less vulnerable to every advertisement, comparison, or anxious thought.`,
    prompts:[
      {id:'contentment-desire', text:'What purchase, milestone, or financial condition has been carrying more emotional weight than it can bear?'},
      {id:'contentment-gifts', text:'What ordinary provision or relationship can you name with gratitude today?'},
      {id:'contentment-pause', text:'How could you create a pause between wanting something and acting on that desire?'}
    ],
    optionalClosingReflection:'God, teach me to receive today as a gift. Free me from the lie that more is always the same as better.'
  }),
  devotional({
    id:'faith-money-generosity', sequence:4, theme:'Generosity', title:'A Freely Chosen Gift',
    verseReference:'2 Corinthians 9:7–8',
    verseText:'Let each man give according as he has determined in his heart, not grudgingly or under compulsion, for God loves a cheerful giver. And God is able to make all grace abound to you, that you, always having all sufficiency in everything, may abound to every good work.',
    devotionalText:`Generosity is not a performance for God or other people. It is a response of freedom. The passage does not describe a giver pressured into proving sincerity. It describes a person who considers, decides, and gives from the heart. That matters because guilt can produce activity without love, while freedom makes room for honest care.

Generosity also looks different in different seasons. Someone carrying urgent bills, caregiving duties, unemployment, or debt may not have the same financial capacity as someone with a wider margin. A generous life is not measured by a public number. It can include money, but also time, hospitality, attention, expertise, advocacy, encouragement, and a willingness to notice another person’s need.

Before you give, it is wise to look at reality. What obligations need to be met? What amount would be responsible? What cause or person aligns with your values? A plan can protect generosity from becoming impulsive, hidden resentment, or a way to avoid your own needs. Planning does not make a gift cold. It can make it more sustainable.

There is also generosity toward yourself. This is not permission to ignore every limit. It is permission to recognize that deprivation is not automatically holiness. Rest, nourishment, care, and appropriate delight can be received with gratitude. When generosity is rooted in God’s grace, it is not a dramatic gesture that empties you to impress someone. It is a pattern that helps love circulate.

Ask what kind of giver you are becoming. Do you give to manage an image, to escape discomfort, to earn approval, or because you want your resources to participate in good? There is no need to pretend the answer is simple. God can meet you in the mixed motives and lead you toward a more open hand.

You can start with a modest decision that you can sustain. A thoughtful gift, shared meal, practical favor, or planned contribution can all become part of a generous rhythm. Let the rhythm fit your actual life. Generosity grows more freely when it is connected to gratitude, wisdom, and the dignity of both giver and receiver.

Let generosity remain an invitation, not a scoreboard. The most faithful act may be small, quiet, and unknown to anyone else.`,
    prompts:[
      {id:'generosity-capacity', text:'What form of generosity is realistic in your present season, including forms that are not money?'},
      {id:'generosity-motive', text:'What motives tend to show up when you give or when you avoid giving?'},
      {id:'generosity-plan', text:'What small, planned act of generosity would align with your values this month?'}
    ],
    optionalClosingReflection:'God, make my generosity free, wise, and grounded in grace rather than pressure or display.'
  }),
  devotional({
    id:'faith-money-debt', sequence:5, theme:'Debt', title:'Truth Without Shame',
    verseReference:'Proverbs 22:7',
    verseText:'The rich rule over the poor. The borrower is servant to the lender.',
    devotionalText:`Debt can carry more than a balance. It can carry fear, secrecy, regret, grief, family expectations, education, medical need, a season of survival, or a decision you would make differently now. This proverb names a real loss of freedom in borrowing. It does not give us permission to turn that reality into a verdict about a person’s worth.

Not all debt is the same, and not every borrower had the same choices. Some debt follows an emergency. Some is connected to housing, education, work, or care for others. Some grew through habits that now need attention. Honest reflection can hold all of this without flattening the story. Shame says, “I am my debt.” Wisdom says, “This is a real condition, and I can face it one truthful step at a time.”

Facing debt may mean gathering information: balances, interest rates, minimum payments, dates, and the consequences of missed payments. That information can feel intimidating, but clarity is not cruelty. It is a way to recover agency. If the situation is complex, seeking qualified financial, legal, credit-counseling, or pastoral support can be a wise act of care. Asking for help is not a spiritual failure.

You do not have to promise yourself a dramatic turnaround today. You can identify the next responsible move: make a list, protect essentials, contact a creditor, avoid a new charge, build a small buffer, or create a payment plan you can sustain. Progress may be slow. Slow progress is still progress.

God’s care is not delayed until the balance reaches zero. Your dignity is not waiting on a credit score. Let truth replace avoidance, and let mercy replace contempt. Responsibility grows best in soil that is honest and compassionate.

If you are carrying consequences from a former decision, remember that responsibility is not the same as permanent self-punishment. You can acknowledge harm, make repairs where possible, and learn new practices. This may take time and may require professional help. You are still allowed to be treated as a whole person while doing difficult financial work.

Write down one fact, one question, and one next step. Clarity becomes more manageable when it is broken into pieces you can actually carry.`,
    prompts:[
      {id:'debt-story', text:'What emotions or stories become attached to debt for you?'},
      {id:'debt-truth', text:'What financial fact would help you move from avoidance toward clarity?'},
      {id:'debt-support', text:'What next step or qualified support could help you carry this responsibly?'}
    ],
    optionalClosingReflection:'God, meet me in the truth of this situation. Give me courage for the next responsible step and freedom from shame.'
  }),
  devotional({
    id:'faith-money-financial-anxiety', sequence:6, theme:'Financial Anxiety', title:'Today Has Enough to Carry',
    verseReference:'Matthew 6:34',
    verseText:'Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself. Each day’s own evil is sufficient.',
    devotionalText:`Financial anxiety often tries to protect us by rehearsing every possible future. What if the job changes? What if the bill is larger than expected? What if an emergency comes? What if the plan fails? The mind can mistake constant vigilance for preparation, even when the rehearsal leaves us unable to act in the present.

Jesus does not deny that tomorrow may contain difficulty. He directs attention to the limits of today. There is a difference between wise planning and carrying every imagined outcome at once. Planning names what can be done: check due dates, set aside a buffer, compare options, ask questions, make a call, or update a budget. Anxiety keeps demanding a guarantee that no plan can provide.

When money fear rises, begin with the smallest true fact. What is due now? What resources are actually available? What decision can wait? Who could help you think clearly? Put the next action on paper. Then notice what remains outside your control. Releasing control is not passivity; it is refusing to confuse responsibility with omniscience.

Your body may also need care. A worried nervous system can make every notification feel urgent. Take a breath before opening an account. Step away after completing a task. Talk with a trusted person. If anxiety is persistent or overwhelming, a qualified mental-health professional can offer support alongside financial planning. Prayer and practical help can belong together.

God’s presence does not promise a painless future or a perfect account balance. It offers companionship in the real day you have. You are allowed to take one next step, receive help, and return tomorrow for the next one.

Try not to judge the value of a day only by whether the anxiety disappears. A day can be faithful when you complete one needed task, rest after it, and refuse to punish yourself for having limits. Let practical preparation and compassionate attention work together. Tomorrow can be met tomorrow, with the support available then.

If a task feels impossible, make it smaller: locate the statement, write the question, or schedule the call. Small beginnings still count. Kindness toward yourself makes clear action more possible.`,
    prompts:[
      {id:'anxiety-fact', text:'What is one present financial fact you can name without predicting the whole future?'},
      {id:'anxiety-action', text:'What practical action is within your control today?'},
      {id:'anxiety-release', text:'What imagined outcome are you carrying that you need to release rather than solve tonight?'}
    ],
    optionalClosingReflection:'God, meet me in today. Give me wisdom for what I can do and peace for what I cannot control.'
  }),
  devotional({
    id:'faith-money-greed', sequence:7, theme:'Greed', title:'More Than Possessions',
    verseReference:'Luke 12:15',
    verseText:'He said to them, “Beware! Keep yourselves from covetousness, for a man’s life doesn’t consist of the abundance of the things which he possesses.”',
    devotionalText:`Greed is easy to locate in someone else’s excess and harder to notice in our own anxieties. It is not simply having resources or enjoying something good. It is the pull to treat more as the answer to who we are, what we deserve, or what will finally make us secure. It can appear in a crowded closet, but it can also appear in a heart that cannot celebrate another person’s provision.

The warning in this passage is protective. A life is larger than its inventory. Possessions can serve a home, a family, work, beauty, rest, and generosity. They become dangerous when they begin to define the person who holds them. If losing an item, status symbol, or financial advantage feels like losing yourself, the attachment may be asking too much.

Greed can also wear respectable clothing. It can sound like never having enough margin, always needing the next upgrade, refusing to share information or opportunity, or measuring success only by accumulation. None of these patterns are healed by self-disgust. They are healed by truth, gratitude, and practices that loosen our grip.

Try a small practice of enoughness. Use what you already own. Repair before replacing when that is reasonable. Decline a comparison-driven purchase. Share something useful. Give credit. Let another person’s good news be good news without turning it into evidence against your life.

This is not a call to romanticize scarcity or to feel guilty for ordinary comfort. It is an invitation to let possessions return to their proper size. You are more than what you earn, own, display, or protect. A free heart can receive good things with gratitude and release them without panic.

Pay attention to the stories attached to your purchases. A possession may be useful, beautiful, or worth saving for. It does not have to prove that you are successful, safe, or finally ahead. When you can name the story, you have more freedom to choose whether the purchase serves your life or asks your life to serve it.

That freedom creates room to enjoy what is good without making it the measure of a good life.`,
    prompts:[
      {id:'greed-attachment', text:'What possession, status marker, or financial outcome feels unusually tied to your identity?'},
      {id:'greed-comparison', text:'Where does comparison make “more” feel necessary rather than optional?'},
      {id:'greed-practice', text:'What practice of enoughness could help loosen your grip this week?'}
    ],
    optionalClosingReflection:'God, free me from measuring my life by what I possess. Teach me gratitude, openhandedness, and joy in the good of others.'
  }),
  devotional({
    id:'faith-money-planning', sequence:8, theme:'Planning', title:'Plans With Open Hands',
    verseReference:'Proverbs 21:5',
    verseText:'The plans of the diligent surely lead to profit; and everyone who is hasty surely rushes to poverty.',
    devotionalText:`Planning is an act of attention. It gives tomorrow a place in today’s decisions without pretending that tomorrow is fully ours. A spending plan, savings goal, debt payoff schedule, or calendar reminder can be a practical expression of care. It helps us see tradeoffs before urgency chooses for us.

The proverb commends diligence and warns against haste. Diligence is not frantic productivity. It is the willingness to look, learn, and return. It can mean a short weekly review, a realistic category target, or a pause before a major purchase. Haste often grows where we are tired, afraid, embarrassed, or eager to feel immediate relief. Naming that pattern can create room for a different response.

Plans are helpful servants and poor gods. They cannot guarantee employment, health, prices, relationships, or timing. When a plan changes, that does not automatically mean you failed. It may mean the facts changed. Wisdom adjusts. You can revise a goal, extend a timeline, ask for help, or make space for an expense you did not expect.

Make plans specific enough to guide you and gentle enough to survive real life. Instead of a vague promise to “do better,” choose one action: automate a transfer, list current obligations, decide a waiting period for purchases, schedule a check-in, or set aside a small amount for a known cost. Let the plan serve your values rather than your image.

Planning becomes spiritually healthy when it makes us more truthful, more prepared to love, and less ruled by panic. Hold the future with care, then hold it with open hands.

Reviewing a plan is part of planning. Set a time to return to it after new information arrives. A changed plan is not necessarily a broken promise; it can be evidence that you are paying attention. Give yourself permission to revise with honesty rather than abandoning the whole effort when life interrupts your first draft.

Ask whether the plan still serves your values, your obligations, and the people affected by it. Then make the next adjustment without panic. Patient review protects a plan from becoming a burden over time for you.`,
    prompts:[
      {id:'planning-pattern', text:'Where does haste most often show up in your money decisions?'},
      {id:'planning-action', text:'What single practical plan would reduce avoidable stress without demanding perfection?'},
      {id:'planning-release', text:'What part of your future do you need to plan for wisely while releasing the need to control it?'}
    ],
    optionalClosingReflection:'God, give me diligence without fear. Help my plans become tools for wisdom, care, and flexibility.'
  }),
  devotional({
    id:'faith-money-integrity', sequence:9, theme:'Integrity', title:'The Same Person in Small Things',
    verseReference:'Luke 16:10',
    verseText:'He who is faithful in a very little is faithful also in much. He who is dishonest in a very little is also dishonest in much.',
    devotionalText:`Integrity in money is rarely built through one dramatic decision. It is formed in ordinary moments: reporting an expense accurately, returning what is not ours, telling the truth about a charge, honoring a commitment, declining to hide a purchase, and admitting when a plan has changed. Small choices shape the kind of person we become.

This can feel uncomfortable because money touches private places. It may reveal disagreements, pressure, habits, or fears we would rather keep vague. Integrity is not exposure for its own sake. It is wholeness. It allows the story we tell ourselves, the commitments we make to others, and the choices we make with resources to move toward alignment.

Honesty also needs compassion. If you discover a pattern you regret, the goal is not to punish yourself until you feel worthy. The goal is repair. That may involve correcting a record, apologizing, changing access to a payment method, creating a new boundary, or asking someone to help you stay accountable. Repair is not instant, but it is concrete.

Consider the small places where convenience tempts you to become divided: subscriptions you avoid reviewing, expenses you do not mention, taxes or invoices you rationalize, promises you make without checking capacity. A faithful response may be as simple as opening the email, updating the amount, or saying, “I need to revisit this honestly.”

God is not asking you to manufacture a flawless financial image. He invites you to become a person whose private choices can bear the light. Integrity brings a kind of rest because it reduces the energy required to manage hidden stories.

You may need time to understand what repair requires. Start with accuracy. Then choose a next action that respects both truth and the people affected. Integrity is not loud or theatrical. It is often quiet, repeated, and ordinary. Over time, those ordinary choices create a life that is easier to inhabit with peace.

Where you are unsure, seek qualified counsel rather than using secrecy as a substitute for clarity. Honest questions are part of faithful practice. You can learn without abandoning responsibility or hope today.`,
    prompts:[
      {id:'integrity-small', text:'What small money decision currently invites you to practice honesty or repair?'},
      {id:'integrity-alignment', text:'Where do your stated values and your financial habits feel out of alignment?'},
      {id:'integrity-repair', text:'What concrete repair or boundary could move you toward wholeness?'}
    ],
    optionalClosingReflection:'God, make me truthful in small things. Give me humility to repair what needs repair and courage to live without hidden stories.'
  }),
  devotional({
    id:'faith-money-comparison', sequence:10, theme:'Comparison', title:'Your Own Faithful Work',
    verseReference:'Galatians 6:4–5',
    verseText:'But let each man examine his own work, and then he will have something to boast in himself, and not in someone else. For each man will bear his own burden.',
    devotionalText:`Comparison turns another person’s visible life into a scorecard for our own. Money gives comparison many tools: salaries, homes, weddings, cars, vacations, gifts, investments, and social media glimpses. We can feel superior, behind, resentful, or ashamed before we even know the actual story behind the image.

The invitation here is to examine your own work. That is not isolation. It is a return to reality. You have a particular history, set of obligations, abilities, needs, and relationships. Another person’s provision may be worth celebrating, but it cannot tell you what faithfulness requires of you today.

Comparison often hides a legitimate longing. You may want rest, stability, beauty, recognition, freedom, or a sense of possibility. Instead of condemning the longing, name it. Then ask whether the comparison is offering a truthful path toward it. A neighbor’s renovation may not be the real issue; perhaps you need a more peaceful home plan. A friend’s promotion may not be the real issue; perhaps you want growth or meaningful work.

Practicing gratitude does not mean pretending you do not want change. It means refusing to use someone else’s life as proof that yours is deficient. You can make goals rooted in your values, not in the urgency to keep up. You can celebrate another person’s good without erasing your own grief or desire.

Take one step toward your own faithful work. Review a goal that reflects your real priorities. Unfollow a feed that consistently stirs shame. Tell a trusted person what you hope for. Let your path become specific enough to walk, rather than a blur of everyone else’s milestones.

Your life may include burdens another person never sees, and another person may carry burdens you do not see. Comparison erases those realities. Examining your own work restores them. Give yourself permission to make choices that are appropriate to your actual circumstances, even when they do not look impressive from the outside.

Let gratitude and grief both have a voice. Neither has to become a verdict about your worth or your future. Both can guide you toward honest, unhurried, and faithful choices today, too.`,
    prompts:[
      {id:'comparison-trigger', text:'What financial comparison most reliably leaves you feeling behind or superior?'},
      {id:'comparison-longing', text:'What legitimate longing might be underneath that comparison?'},
      {id:'comparison-path', text:'What value-aligned goal belongs to your own path rather than someone else’s timeline?'}
    ],
    optionalClosingReflection:'God, help me attend to my own faithful work. Give me freedom to celebrate others without losing sight of the life before me.'
  }),
  devotional({
    id:'faith-money-abundance', sequence:11, theme:'Abundance', title:'Enough Grace for Good Work',
    verseReference:'2 Corinthians 9:8',
    verseText:'And God is able to make all grace abound to you, that you, always having all sufficiency in everything, may abound to every good work.',
    devotionalText:`Abundance is easy to misunderstand as a promise of constant increase. This verse speaks of grace and sufficiency for good work, not a guarantee that every financial desire will be met on our preferred timeline. God’s abundance cannot be reduced to visible wealth, and material hardship is never proof of spiritual failure.

Sometimes abundance is a larger margin. Sometimes it is a meal shared, a friend who helps, time to recover, a skill that opens a door, courage to tell the truth, or enough strength for the next task. Naming these gifts does not minimize the need for income, housing, medical care, or justice. It helps us notice that provision can arrive in more than one form.

A scarcity mindset can make every resource feel like a threat to protect. It may say that there will never be enough time, money, attention, or opportunity to share. A grounded sense of sufficiency asks a different question: what has been given for the good I can do now? The answer may be modest. It may still be enough for one act of love, one responsible decision, or one moment of courage.

This reflection is not an instruction to give beyond your capacity or to ignore urgent needs. Wise boundaries remain important. Abundance is not exhaustion. It is trust that your life is not defined only by what you lack, and that you can participate in good without first becoming invulnerable.

Look for a form of grace already present in your life. Perhaps it is a person, an ability, a resource, or a chance to begin again. Receive it with gratitude. Then consider one good work your current resources can support.

This may be a season to receive as well as give. Receiving help with humility can also be part of abundance, because it recognizes that people are made for mutual care. You do not have to earn every kindness. Notice where a gift is already making good possible, and let gratitude shape your response.

Enough grace for today may look ordinary. Receive it without contempt, and use it with care for the good in front of you.`,
    prompts:[
      {id:'abundance-grace', text:'What form of grace or provision is present in your life that is easy to overlook?'},
      {id:'abundance-sufficiency', text:'Where does scarcity thinking make it difficult to see what is enough for today?'},
      {id:'abundance-good-work', text:'What one good work can your current resources support without ignoring your real limits?'}
    ],
    optionalClosingReflection:'God, help me receive your grace without turning it into a promise of ease. Show me the good I can do with what is here.'
  }),
  devotional({
    id:'faith-money-trust', sequence:12, theme:'Trust', title:'A Path You Do Not Have to See',
    verseReference:'Proverbs 3:5–6',
    verseText:'Trust in Yahweh with all your heart, and don’t lean on your own understanding. In all your ways acknowledge him, and he will make your paths straight.',
    devotionalText:`Trust can sound abstract when money decisions are concrete. There are bills to pay, forms to complete, conversations to have, and consequences that do not disappear because we pray. Biblical trust is not refusal to think. It is choosing not to make our own limited understanding the final authority over every fear and decision.

You may not see a straight path from where you are. A financial transition can contain competing goods: care for family, health, work, debt, housing, generosity, rest, and long-term goals. Wisdom may require research, counsel, numbers, and patience. Trust keeps those tools in their place. They inform you; they do not have to become your god.

Acknowledging God in all your ways can be very ordinary. It can mean pausing before a decision, telling the truth about a limit, praying with a partner, asking a wise person for perspective, or choosing patience when panic demands a quick answer. It can mean moving forward with incomplete information while remaining willing to adjust.

Trust does not guarantee the outcome you want. It does not make risk disappear or turn every loss into a simple lesson. It gives you a place to stand when you cannot see the whole path. You can be responsible and still admit that you are not in control of everything. You can grieve uncertainty and still take the next faithful step.

As this first set of devotionals closes, return to the invitation that has run through each one: money is real, but it is not ultimate. Your choices matter, but they do not have to carry your identity alone. God meets you in plans, limits, repair, generosity, and the unfinished places of your story.

Trust can be practiced in the next conversation, next budget review, next request for help, or next act of restraint. You do not need certainty before you begin. Take the next honest step with the information you have, keep your hands open to correction, and remember that God’s presence is not limited to the moments you feel confident.

When the way remains unclear, return to what is true: you are not alone, and you can take the next faithful step.`,
    prompts:[
      {id:'trust-uncertainty', text:'What financial uncertainty are you carrying that has no immediate, guaranteed answer?'},
      {id:'trust-wisdom', text:'What wise action can you take without pretending you control the final outcome?'},
      {id:'trust-next-step', text:'What would it look like to acknowledge God in your next money decision?'}
    ],
    optionalClosingReflection:'God, guide me where I cannot see the whole path. Help me act wisely, receive help, and trust you with what remains uncertain.'
  })
]);

export function devotionalById(id) {
  return FAITH_MONEY_DEVOTIONALS.find(item => item.id === id) || null;
}

export function validateFaithMoneyDevotionalLibrary(library = FAITH_MONEY_DEVOTIONALS) {
  const errors = [];
  if (!Array.isArray(library) || library.length !== 12) return {ok:false, errors:['The Faith & Money library must contain exactly twelve devotionals.']};
  const ids = new Set();
  const sequences = new Set();
  const passages = new Set();
  for (const item of library) {
    if (!item || typeof item !== 'object') { errors.push('Every devotional must be an object.'); continue; }
    for (const field of ['id', 'title', 'theme', 'verseReference', 'translation', 'verseText', 'devotionalText', 'contentVersion']) {
      if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`${item.id || 'unknown'} is missing ${field}.`);
    }
    if (ids.has(item.id)) errors.push(`Duplicate devotional id ${item.id}.`); else ids.add(item.id);
    if (!Number.isSafeInteger(item.sequence) || item.sequence < 1 || sequences.has(item.sequence)) errors.push(`Invalid devotional sequence for ${item.id}.`); else sequences.add(item.sequence);
    if (passages.has(item.verseReference)) errors.push(`Duplicate primary passage ${item.verseReference}.`); else passages.add(item.verseReference);
    if (item.translation !== DEVOTIONAL_TRANSLATION) errors.push(`${item.id} must use ${DEVOTIONAL_TRANSLATION}.`);
    if (!Array.isArray(item.prompts) || item.prompts.length !== 3) errors.push(`${item.id} must have exactly three prompts.`);
    const promptIds = new Set();
    for (const prompt of item.prompts || []) {
      if (!prompt?.id || !prompt?.text) errors.push(`${item.id} has an incomplete prompt.`);
      if (promptIds.has(prompt?.id)) errors.push(`${item.id} has duplicate prompt id ${prompt?.id}.`);
      promptIds.add(prompt?.id);
    }
    const words = String(item.devotionalText || '').trim().split(/\s+/).filter(Boolean).length;
    if (words < 350 || words > 650) errors.push(`${item.id} reflection must be 350–650 words.`);
    const serialized = JSON.stringify(item);
    if (/(?:https?:\/\/|javascript:|<script|<iframe)/i.test(serialized)) errors.push(`${item.id} contains prohibited executable or remote content.`);
    if (/Joyce Meyer/i.test(serialized)) errors.push(`${item.id} contains prohibited third-party attribution.`);
  }
  for (let sequence = 1; sequence <= 12; sequence += 1) if (!sequences.has(sequence)) errors.push(`Missing devotional sequence ${sequence}.`);
  return {ok:errors.length === 0, errors};
}
