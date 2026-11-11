/*
 * CS.motion · topic spotting and the topic -> motion map (CONTRACT 5.7, decisions "Motion default").
 *
 * The cover text, the brief and the hook family give a few topic tags; the tags choose the recipe and, for the story recipe,
 * the metaphor. This is a deterministic keyword match, not a model: the same spec always gets the same motion.
 * Entries are normalised Arabic or lower-case English tokens; a trailing * means "starts with"; entries with a space match as phrases.
 */

var TOPIC_LEXICON = {
  mistakes: ["اخطاء", "خطا", "غلط", "اغلاط", "غلطه", "تموت*", "يموت*", "تقتل*", "يقتل*", "قاتل*", "تدمر*", "يدمر*", "تخرب*", "يخرب*", "فشل*", "تفشل*", "يفشل*",
    "تضيع*", "يضيع*", "خساير*", "خساره", "تخسر*", "يخسر*", "mistake*", "wrong", "kill*", "fail*", "ruin*", "wreck*", "destroy*", "blunder*"],
  urgency: ["عاجل", "فورا", "حالا", "دلوقتي", "دلوقت", "الان", "الحين", "هالحين", "هلق", "هسا", "ينتهي*", "تنتهي*", "يفوت*", "تفوت*", "ساعات", "دقايق", "دقائق", "ثواني", "سباق",
    "متاخر*", "تاخر*", "محدود*", "سارع*", "اخر فرصه", "ينتهي الوقت", "الوقت بينتهي", "الوقت يمر", "الوقت ينفد", "ضيق الوقت", "قبل فوات الوقت", "urgent", "deadline", "hurry", "hours",
    "minutes", "seconds", "race", "running out", "last chance"],
  spread: ["انتشار", "ينتشر*", "تنتشر*", "انتشرت", "عالمي*", "العالم", "دول العالم", "كل الدول", "عدة دول", "دوله", "مدن", "مدينه", "محافظات", "فروع", "كل مكان", "حول العالم", "spread*",
    "global*", "worldwide", "countries", "cities", "everywhere"],
  decision: ["قرار", "قرارات", "احسم*", "حسم*", "اختار*", "اختيار", "الحقيقه", "خرافه", "خرافات", "اسطوره", "ايهما", "الافضل", "مقابل", "ضد", "الحكم", "صح ولا غلط",
    "vs", "versus", "myth*", "truth", "decide*", "decision*", "choose*", "verdict", "better"],
  money: ["فلوس", "مال", "ربح*", "ارباح", "ادفع*", "تدفع*", "سعر", "اسعار", "ميزانيه", "رخيص*", "غالي*", "ببلاش", "مجاني*", "تكلفه", "دخل", "راتب", "ثروه", "اموال", "مصاري", "مصروف*", "ريال*", "درهم", "دراهم", "دينار*", "دولار*", "جنيه",
    "money", "cash", "profit*", "price*", "cost*", "budget", "free", "paid", "income", "salary", "revenue"],
  growth: ["نمو", "تنمو", "زياده", "ارتفاع", "تضاعف*", "مضاعف*", "اضعاف", "ضعف", "ارتفع*", "يرتفع*", "تزيد*", "يزيد*", "مبيعات", "نتايج", "نتائج", "growth", "grow*",
    "double*", "rise*", "increase*", "boost*", "results", "sales"],
  steps: ["خطوه", "خطوات", "طريقه", "طرق", "كيف", "ازاي", "شلون", "كيفيه", "دليل", "شرح", "نظام", "اسلوب", "framework", "steps", "step", "how", "guide", "system", "method"],
  news: ["خبر", "اخبار", "جديد", "جديده", "اطلاق", "اطلقت", "تحديث", "اعلان", "اعلنت", "launch*", "new", "announced", "update", "released", "breaking"],
  story: ["قصه", "قصتي", "حكايه", "تجربتي", "تجربه", "رحلتي", "story", "journey", "case"],
  // Egyptian, Gulf, Levantine, MSA, English. These are change verbs/markers, never ordinary conjunctions such as ولا.
  change: ["بقي", "بقت", "بقوا", "اتغير*", "بدل", "صار", "صارت", "صاروا", "بدال", "تبدل*", "اصبح", "اصبحت", "اصبحوا", "تغير*", "تحول*", "استبدل*", "مقابل", "ضد", "vs", "versus", "now", "rename*", "instead"],
  launch: ["دخلت", "اطلق*", "نزلت", "رسمي*", "جديد", "جديده", "اطلاق", "يديد", "يديده", "نزل", "دش*", "طلع", "صدور", "اصدار", "launch*", "new", "released", "debut*"],
  product: ["claude", "chatgpt", "gemini", "higgsfield", "instagram", "openai", "anthropic", "canva", "perplexity", "grok", "copilot", "midjourney", "figma", "notion", "capcut", "seedance", "sora", "veo", "kling", "cursor", "replit", "elevenlabs", "photoshop", "adobe", "deepseek", "runway", "davinci", "leonardo", "ideogram", "krea", "flux", "lovable", "manus", "windsurf", "vscode", "n8n", "zapier"],
  question: [], emphasis: []
};

var TOPIC_METAPHOR = { mistakes: "heartbeat", urgency: "clock", spread: "dots", growth: "bars", money: "coins", decision: "check", news: "spark", story: "spark" };
var CLITIC_RE = /^(?:وال|بال|كال|فال|لل|ال|بي|و|ف|ب|ل|ك|ه|ح)/;   // proclitics and the colloquial present / future prefixes (بيتموت، هتموت، حيموت)

function stemMatches(token, entry) {
  var prefix = entry.charAt(entry.length - 1) === "*", stem = prefix ? entry.slice(0, -1) : entry;
  if (prefix ? token.indexOf(stem) === 0 : token === stem) return true;
  var bare = token.replace(CLITIC_RE, "");
  return bare !== token && (prefix ? bare.indexOf(stem) === 0 : bare === stem);
}

function changeMarker(text) {
  var norm = normalizeAr(text), tokens = norm.split(/[^a-z0-9ء-ي]+/).filter(Boolean);
  return /→/.test(norm) || tokens.some(function (token) { return TOPIC_LEXICON.change.some(function (entry) { return stemMatches(token, entry); }); }) ||
    (tokens.indexOf("قبل") >= 0 && tokens.indexOf("بعد") > tokens.indexOf("قبل")) || (tokens.indexOf("before") >= 0 && tokens.indexOf("after") > tokens.indexOf("before"));
}

function directQuestion(text) {
  if (!/[؟?]/.test(text || "")) return false;
  return /(?:^|[^a-zء-ي])(?:عندك|معاك|معك|انت|انتم|انتي|انتا|لديك|لديكم|بتستخدم|تستخدم|تستعمل|تبي|تبغي|بدك|بدكم|you|your)(?=$|[^a-zء-ي])/.test(normalizeAr(text));
}

function shortEmphasis(text) {
  var matches = String(text || "").match(/==([^=]+)==/g) || [];
  return matches.some(function (m) { var n = m.slice(2, -2).trim().split(/\s+/).filter(Boolean).length; return n > 0 && n <= 2; });
}

/** Scores every topic for `text`; returns { tags: [names, strongest first], scores }. */
function detectTopics(text) {
  var norm = normalizeAr(text), tokens = norm.split(/[^a-z0-9ء-ي]+/).filter(Boolean), padded = " " + tokens.join(" ") + " ";
  var scores = {}, tag, list, i, j, entry;
  for (tag in TOPIC_LEXICON) {
    list = TOPIC_LEXICON[tag]; scores[tag] = 0;
    for (i = 0; i < list.length; i++) {
      entry = list[i];
      if (entry.indexOf(" ") >= 0) { if (padded.indexOf(" " + entry + " ") >= 0) scores[tag] += 2; continue; }
      for (j = 0; j < tokens.length; j++) if (stemMatches(tokens[j], entry)) { scores[tag] += 1; break; }
    }
  }
  if (changeMarker(text) && !scores.change) scores.change = 1;
  scores.question = directQuestion(text) ? 1 : 0;
  scores.emphasis = shortEmphasis(text) ? 1 : 0;
  var tags = Object.keys(scores).filter(function (t) { return scores[t] > 0; }).sort(function (a, b) { return scores[b] - scores[a] || (a < b ? -1 : 1); });
  return { tags: tags, scores: scores };
}

function metaphorForTags(tags) {
  for (var i = 0; i < tags.length; i++) if (TOPIC_METAPHOR[tags[i]]) return TOPIC_METAPHOR[tags[i]];
  return null;
}

var WHY = {
  counter: { ar: "الغلاف يبدأ برقم، فيعدّ الرقم صعودًا ثم يستقر في مكانه.", en: "The cover leads with a number, so it counts up and lands." },
  heartbeat: { ar: "الموضوع عن أخطاء تضرّ، فنبض القلب يتسارع ثم يتوقف.", en: "The topic is about mistakes that hurt, so a heartbeat races and flatlines." },
  clock: { ar: "الموضوع عاجل، فعقرب الساعة يتسارع قبل أن يظهر العنوان.", en: "The topic is urgent, so a clock hand races before the title lands." },
  dots: { ar: "الموضوع عن انتشار، فنقاط تضيء الخريطة واحدة بعد أخرى.", en: "The topic is about spread, so dots light up a map one by one." },
  stamp: { ar: "الموضوع قرار أو حكم، فتُختم الكلمة المهمة بختم واضح.", en: "A decision or verdict gets a stamp on the key word." },
  reorder: { ar: "المحتوى خطوات ونظام، فتنتظم الكلمات في أماكنها.", en: "The content is a method, so the words fall into order." },
  story: { ar: "المحتوى خبر أو قصة، فتبدأ الحركة برمز قصير ثم يظهر العنوان.", en: "News or a story opens with a short symbol before the title builds." },
  curtain: { ar: "الموضوع إطلاق أو جديد، فالستائر تكشف العنوان سطرًا بعد سطر.", en: "A launch gets a curtain reveal, one headline line at a time." },
  zoom: { ar: "كلمة قصيرة تحمل الفكرة، فنبدأ بها كبيرة ثم نكشف الغلاف حولها.", en: "A short key phrase opens in close-up, then the camera reveals its context." },
  notify: { ar: "خبر أداة أو سؤال ليك، فيوصلك العنوان كرسالة بتتكتب.", en: "Product news or a direct question arrives as a message being typed." },
  split: { ar: "الفكرة فيها تغيير أو مقارنة، فالجانبان يلتقيا في مكانهما.", en: "A change or comparison brings two sides together in their poster positions." },
  cascade: { ar: "لا رمز بصريًا أقوى من الكلمات نفسها، فتنزل الكلمات واحدة واحدة ويُظلَّل المهم.", en: "No visual symbol beats the words, so they drop in one by one and the key phrase is highlighted." },
  calm: { ar: "حركة هادئة تُبقي الغلاف كما صُمّم.", en: "A calm move that keeps the cover as designed." }
};

function firstSlide(spec) {
  var s = spec && spec.slides, i;
  if (!s) return null;
  for (i = 0; i < s.length; i++) if (s[i].type === "cover" || s[i].type === "poster") return s[i];
  return s[0] || null;
}

/** The topic -> motion decision (CS.motion.recommend). Order follows CONTRACT 5.7 and the "Motion default" decision. */
function recommendMotion(spec) {
  var symbol = spec && spec.ext && spec.ext.coverSymbol;
  if (symbol && !CS.motion.metaphors[symbol]) throw motionError("E_USAGE", "ext.coverSymbol must be one of: " + Object.keys(CS.motion.metaphors).join(", "));
  var cover = firstSlide(spec) || {}, hook = (spec && spec.hook) || {}, parts = [hook.cover, hook.text, spec && spec.brief && spec.brief.topic,
    spec && spec.angle && spec.angle.title, cover.kicker, cover.headline, cover.sub, spec && spec.captionPack && spec.captionPack.firstLine];
  var text = parts.filter(Boolean).join(" ");
  var found = detectTopics(text), tags = found.tags, arch = spec && spec.architecture, family = hook.family || "";
  var coverText = (cover.headline || hook.cover || "").replace(/==/g, "") + " " + (cover.sub || "");
  var western = coverText.replace(/[٠-٩]/g, function (c) { return "٠١٢٣٤٥٦٧٨٩".indexOf(c); });
  var numeral = /[0-9]/.test(western.replace(/\b(19|20)[0-9]{2}\b/g, "")) || (spec && spec.slides || []).some(function (s) { return s.type === "stat" || (s.number && s.number.value); });
  var has = function (t) { return tags.indexOf(t) >= 0; };
  var pick = function (recipe, feel, why, metaphor) { return { recipe: recipe, feel: feel, why: why, metaphor: symbol || metaphor || null, tags: tags }; };
  if (has("urgency") && found.scores.urgency >= 2) return pick("drop-clock", "story", WHY.clock, "clock");
  if (has("spread") && found.scores.spread >= 2) return pick("map-dots", "story", WHY.dots, "dots");
  if (arch === "myth-fact" || family === "P4" || (has("decision") && found.scores.decision >= 2)) return pick("stamp", "story", WHY.stamp);
  if (has("mistakes")) return pick("story", "story", WHY.heartbeat, "heartbeat");
  if (changeMarker(coverText)) return pick("split", "story", WHY.split);
  if (numeral) return pick("counter", "calm", WHY.counter);
  if (arch === "steps" || arch === "framework" || has("steps")) return pick("reorder", "story", WHY.reorder);
  if (((arch === "news" || has("news")) && detectTopics(coverText).scores.product > 0) || directQuestion(coverText)) return pick("notify", "story", WHY.notify);
  if (has("launch")) return pick("curtain", "story", WHY.curtain);
  if (arch === "news" || arch === "story" || arch === "case-study" || has("news") || has("story")) {
    var m = metaphorForTags(tags) || "spark";
    return pick("story", "story", WHY.story, m);
  }
  if (shortEmphasis(cover.headline || hook.cover)) return pick("zoom", "story", WHY.zoom);
  return pick("highlight-sweep", "calm", WHY.cascade);
}
