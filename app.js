const translations = {
  ar: {
    navToday: "اليوم",
    navJourney: "رحلتك",
    navLibrary: "المكتبة",
    eyebrow: "مساحة آمنة لتكون على طبيعتك",
    heroTitle: 'كل رحلة تبدأ<br><span>بخطوة صغيرة.</span>',
    heroDescription: "خذ لحظة لنفسك. لا تحتاج أن تعرف كل الإجابات — يكفي أن تبدأ من هنا.",
    startCheckin: "ابدأ لحظتك",
    journeyEyebrow: "مساحتك، إيقاعك",
    journeyTitle: "أين تود أن تبدأ؟",
    journeyNote: "اختر ما يناسبك اليوم. يمكنك العودة إلى أي مسار وقتما تشاء.",
    growthTitle: "النمو",
    growthDescription: "تعرّف على نفسك، وابنِ عادات صغيرة تشبهك.",
    resetTitle: "استعادة التوازن",
    resetDescription: "امنح نفسك مساحة للراحة والبدء من جديد.",
    discoverTitle: "الاكتشاف",
    discoverDescription: "أفكار وأسئلة تفتح لك طرقًا جديدة للتفكير.",
    explorePath: 'استكشف المسار <span aria-hidden="true">←</span>',
    checkinEyebrow: "وقفة قصيرة",
    checkinTitle: "كيف تشعر<br>في هذه اللحظة؟",
    checkinDescription: "لا توجد إجابة صحيحة أو خاطئة. لاحظ شعورك كما هو، دون حكم.",
    privacyNote: "تأملك يُحفظ على هذا الجهاز فقط.",
    moodQuestion: "اختر ما يقترب من شعورك",
    mood1: "مثقل",
    mood2: "متعب",
    mood3: "مستقر",
    mood4: "جيد",
    mood5: "مشرق",
    reflectionLabel: "ما الشيء الذي تحتاجه من نفسك اليوم؟",
    reflectionPlaceholder: "اكتب لنفسك بضع كلمات...",
    saveCheckin: "احفظ لحظتي",
    challengeEyebrow: "تحدّي اليوم · ٥ دقائق",
    challengeTitle: "اترك مساحة<br>للحظة هادئة.",
    challengeDescription: "ابتعد قليلًا عن الشاشة. تنفّس ببطء، ولاحظ ثلاثة أشياء حولك.",
    completeChallenge: "أنجزت التحدي",
    quote: "كن هنا<br>فقط.",
    libraryEyebrow: "فضولك يقودك",
    libraryTitle: "شيء صغير لتأخذه معك.",
    noteCategory: "فكرة للتأمل",
    noteTitle: "التقدّم لا يعني أن تكون بخير طوال الوقت. أحيانًا هو أن تعرف ما تحتاجه عندما لا تكون كذلك.",
    notePrompt: "سؤال اليوم: ما خطوة واحدة لطيفة يمكنك أن تمنحها لنفسك؟",
    noteAside: "اقرأها<br>على مهل.",
    footerNote: "خطوة بخطوة، وعلى طريقتك.",
    savedStatus: "حُفظت لحظتك على هذا الجهاز.",
    challengeDone: "أحسنت. أخذت لحظة لنفسك اليوم.",
    challengeUndone: "تمت إعادة التحدي لهذا اليوم."
  },
  en: {
    navToday: "Today",
    navJourney: "Your journey",
    navLibrary: "Field notes",
    eyebrow: "A space to meet yourself where you are",
    heroTitle: 'Every journey starts<br><span>with a small step.</span>',
    heroDescription: "Take a moment for yourself. You don't need all the answers — you can begin right here.",
    startCheckin: "Take a moment",
    journeyEyebrow: "Your space, your pace",
    journeyTitle: "Where would you like to begin?",
    journeyNote: "Choose what feels right today. You can return to any path whenever you like.",
    growthTitle: "Grow",
    growthDescription: "Get to know yourself and build small habits that feel like you.",
    resetTitle: "Find your balance",
    resetDescription: "Give yourself room to rest and begin again.",
    discoverTitle: "Discover",
    discoverDescription: "Ideas and questions that open up new ways of thinking.",
    explorePath: 'Explore this path <span aria-hidden="true">→</span>',
    checkinEyebrow: "A small pause",
    checkinTitle: "How are you<br>feeling right now?",
    checkinDescription: "There is no right or wrong answer. Notice how you feel, without judgment.",
    privacyNote: "Your reflection stays on this device.",
    moodQuestion: "Choose what comes closest to how you feel",
    mood1: "Heavy",
    mood2: "Tired",
    mood3: "Steady",
    mood4: "Good",
    mood5: "Bright",
    reflectionLabel: "What do you need from yourself today?",
    reflectionPlaceholder: "Write yourself a few words...",
    saveCheckin: "Save this moment",
    challengeEyebrow: "Today's pause · 5 minutes",
    challengeTitle: "Make room<br>for a quiet moment.",
    challengeDescription: "Step away from your screen. Breathe slowly and notice three things around you.",
    completeChallenge: "I did the pause",
    quote: "Just<br>be here.",
    libraryEyebrow: "Let curiosity lead",
    libraryTitle: "A small thought to take with you.",
    noteCategory: "A thought to reflect on",
    noteTitle: "Progress doesn't mean feeling okay all the time. Sometimes it's knowing what you need when you don't.",
    notePrompt: "Today's question: What is one kind step you can offer yourself?",
    noteAside: "Take your<br>time with it.",
    footerNote: "One step at a time, your way.",
    savedStatus: "Your moment is saved on this device.",
    challengeDone: "Well done. You made a moment for yourself today.",
    challengeUndone: "Today's pause has been reset."
  }
};

const checkinStorageKey = "neo-checkin-v1";
const challengeStorageKey = "neo-challenge-v1";
let currentLanguage = "ar";

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const translation = translations[language][element.dataset.i18n];
    if (translation) element.innerHTML = translation;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = translations[language][element.dataset.i18nPlaceholder];
  });
  const toggle = document.getElementById("language-toggle");
  toggle.textContent = language === "ar" ? "EN" : "ع";
  toggle.setAttribute("aria-label", language === "ar" ? "Switch language to English" : "تغيير اللغة إلى العربية");
  document.querySelector(".main-nav").setAttribute("aria-label", language === "ar" ? "التنقل الرئيسي" : "Main navigation");
  renderDate();
  renderChallenge();
}

function renderDate() {
  const now = new Date();
  document.getElementById("day-number").textContent = new Intl.DateTimeFormat(currentLanguage, { day: "2-digit" }).format(now);
  document.getElementById("date-label").textContent = new Intl.DateTimeFormat(currentLanguage, { month: "long", year: "numeric" }).format(now);
  document.getElementById("year").textContent = now.getFullYear();
}

document.getElementById("language-toggle").addEventListener("click", () => {
  setLanguage(currentLanguage === "ar" ? "en" : "ar");
});

document.getElementById("checkin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const checkin = {
    date: getLocalDateKey(),
    mood: formData.get("mood"),
    reflection: String(formData.get("reflection") || "").trim()
  };
  try {
    localStorage.setItem(checkinStorageKey, JSON.stringify(checkin));
    document.getElementById("checkin-status").textContent = translations[currentLanguage].savedStatus;
  } catch (error) {
    document.getElementById("checkin-status").textContent = currentLanguage === "ar"
      ? "تعذّر الحفظ على هذا الجهاز. حاول مجددًا."
      : "Could not save on this device. Please try again.";
    console.error("Could not save check-in", error);
  }
});

const challengeButton = document.getElementById("complete-challenge");

function renderChallenge() {
  const complete = localStorage.getItem(challengeStorageKey) === getLocalDateKey();
  challengeButton.setAttribute("aria-pressed", String(complete));
  challengeButton.classList.toggle("is-complete", complete);
  challengeButton.querySelector("[data-i18n]").textContent = complete
    ? (currentLanguage === "ar" ? "أعد التحدي" : "Reset today's pause")
    : translations[currentLanguage].completeChallenge;
  document.getElementById("challenge-status").textContent = complete ? translations[currentLanguage].challengeDone : "";
}

challengeButton.addEventListener("click", () => {
  const today = getLocalDateKey();
  const complete = localStorage.getItem(challengeStorageKey) === today;
  if (complete) {
    localStorage.removeItem(challengeStorageKey);
    document.getElementById("challenge-status").textContent = translations[currentLanguage].challengeUndone;
  } else {
    localStorage.setItem(challengeStorageKey, today);
    document.getElementById("challenge-status").textContent = translations[currentLanguage].challengeDone;
  }
  renderChallenge();
});

document.getElementById("checkin-form").addEventListener("input", () => {
  document.getElementById("checkin-status").textContent = "";
});

setLanguage("ar");
