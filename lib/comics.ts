import type { Bg } from "@/components/comic/art";

/** Один кадр комикса. cast: "hero:happy finni:think" ; props: "🍪:200,150,34 🏷️:300,90,28" (x,y,size в координатах 360×220). */
export type PanelSpec = {
  bg: Bg;
  cast: string;
  props?: string;
  /** [ru, he, кто говорит (индекс в cast), стиль] */
  say?: [string, string, number?, ("say" | "think" | "shout")?];
  cap?: [string, string];
};

type S = PanelSpec["say"];
const p = (bg: Bg, cast: string, props?: string, say?: S, cap?: PanelSpec["cap"]): PanelSpec => ({ bg, cast, props, say, cap });

type Entry = PanelSpec | PanelSpec[];
const M: Record<string, Record<string, Entry>> = {
  /* ───── 1. Ярмарка браслетов ───── */
  bracelets: {
    intro: [
      p("school", "finni:sly hero:wow", "🤫:70,70,28", ["Ш-ш-ш… есть дело!", "שששש… יש עניין!", 0]),
      p("fair", "hero:happy finni:happy", "🎪:290,96,50 📿:180,164,34", ["Ярмарка через 5 дней!", "יריד בעוד 5 ימים!", 0], ["Школа, понедельник", "בית הספר, יום שני"]),
    ],
    reserve: p("math", "finni:think hero:neutral", "🏛️:290,100,50 🪙:180,160,30", ["Сначала плати себе!", "קודם משלמים לעצמך!", 0]),
    materials: p("shop", "hero:happy seller:neutral", "📿:180,150,36 🧵:150,168,30 💎:215,168,30", ["Какой набор взять?", "איזו חבילה לקחת?", 0, "think"]),
    "calc-max": p("math", "hero:think", "🧮:260,120,64 💰:300,170,30", ["Хватит ли на всё?", "יספיק לי?", 0, "think"]),
    qty: p("room", "hero:think", "📿:250,150,36 🧵:295,170,32 ❓:262,64,36", ["Сколько сделать?", "כמה לעשות?", 0, "think"]),
    schedule: p("room", "hero:wow", "⏰:270,80,48 📿:240,168,30 📚:300,164,30", ["Всё — до пятницы!", "הכול עד יום שישי!", 0, "shout"]),
    "price-story": p("math", "finni:happy", "🏷️:250,100,54 🪙:295,166,30 ✨:215,60,24"),
    "calc-unit": p("math", "hero:think", "📿:250,120,48 ➖:215,120,30 🪙:295,120,40"),
    price: p("fair", "hero:think", "🏷️:230,130,46 📿:290,164,34", ["Какую цену написать?", "איזה מחיר לכתוב?", 0, "think"]),
    marketing: p("fair", "hero:happy noa:happy", "📣:180,110,52 🪧:180,168,34", ["Налетай, браслеты!", "בואו, צמידים!", 0, "shout"]),
    reels: p("night", "hero:think finni:sly", "📱:180,130,60 🎬:150,60,28", ["Ещё один рилс…", "עוד רילס אחד…", 0, "think"]),
    fair1: p("fair", "hero:happy noa:happy", "📿:180,160,38 🪙:150,120,24", ["Первые покупатели!", "הקונים הראשונים!", 0]),
    crisis: p("fair", "hero:wow kid:sad", "🪢:180,150,40 💔:180,100,26", ["Шнурок порвался!", "החוט נקרע!", 1, "shout"]),
    credit: p("fair", "hero:think teen:sly", "💰:180,140,40 📅:180,90,30", ["Беру 10! Заплачу потом.", "לוקח 10! אשלם אחר כך.", 1]),
    fair2: p("fair", "hero:happy noa:happy dani:happy", "📿:180,150,30 🪙:120,110,22 🪙:240,100,22", ["Народу полно!", "המון אנשים!", 0, "shout"]),
    wrap: p("fair", "hero:happy finni:happy", "🔔:290,70,44 🧺:190,160,34", ["Звонок! Считаем!", "צלצול! סופרים!", 1]),
    "calc-profit": p("math", "hero:think", "🧮:260,120,60 📿:300,170,30"),
    allocate: p("home", "hero:think finni:happy", "🗺️:180,120,50 🐷:180,166,32"),
    kindness: p("street", "hero:happy", "🐶:240,168,44 ❤️:250,100,32 🥣:292,176,30", ["Корм для приюта", "אוכל למקלט", 0]),
    reflect: p("room", "hero:sad finni:happy", "🌱:180,140,40", ["Это слово — «пока»", "זו המילה «עדיין לא»", 1]),
  },
  /* ───── 2. Месяц карманных денег ───── */
  month: {
    intro: [
      p("home", "mom:happy hero:wow", "💵:180,140,40", ["Это на неделю!", "זה לשבוע!", 0]),
      p("home", "finni:happy hero:happy", "📅:290,70,48 🐷:180,160,36", ["Целый месяц игры!", "חודש שלם של משחק!", 0]),
    ],
    system: p("home", "hero:think finni:neutral", "🗂️:180,110,48 🐷:180,164,34 ✉️:130,160,26"),
    w1: p("home", "hero:happy", "💵:250,120,46 📅:296,60,34 🐷:215,168,34"),
    tempt: p("phone", "hero:wow", "📱:250,110,66 ⏳:296,48,34 🎮:215,166,28", ["Осталось 2 часа!!!", "נשארו שעתיים!!!", 0, "shout"]),
    "calc-gap": p("math", "hero:think", "🎧:255,110,50 🐷:300,166,34 ❓:215,64,30"),
    w2: p("home", "hero:happy", "💵:250,120,46 📅:296,60,34 🍦:215,166,32"),
    outing: p("street", "hero:think noa:happy dani:happy", "🍦:120,80,26 🎬:240,80,26", ["Идёшь с нами?", "בא איתנו?", 1]),
    gnome: p("shop", "hero:wow gnome:sly", "🎧:300,90,40 🏷️:196,84,32", ["Хи-хи! Цена выросла!", "חי-חי! המחיר עלה!", 1, "shout"]),
    "calc-infl": p("math", "gnome:sly hero:think", "📈:180,110,52 %:180,168,28"),
    w3: p("home", "hero:happy", "💵:250,120,46 📅:296,60,34 📉:215,168,30"),
    earn: p("street", "hero:happy neighbor:happy", "🐕:180,164,44 💵:180,98,32", ["Погуляю с собакой!", "אטייל עם הכלב!", 0]),
    loan: p("park", "hero:think dani:sad", "🤝:180,120,40 💵:180,166,28", ["Одолжи 15 ₪?", "תלווה 15 ₪?", 1]),
    w4: p("home", "hero:happy", "💵:250,120,46 📅:296,60,34 🏁:215,168,30"),
    breakdown: p("room", "hero:sad", "🎒:250,140,60 💥:290,96,34", ["Молния сломалась!", "הרוכסן נשבר!", 0, "shout"]),
    gift: p("home", "rose:happy hero:wow", "🎁:180,140,44 💵:180,92,30", ["Это тебе, внучка!", "זה בשבילך!", 0]),
    result: p("stage", "hero:happy finni:happy", "🏁:180,70,56 🎉:70,60,32 🎉:290,60,32"),
    buy: p("shop", "hero:happy seller:happy", "🎧:180,120,56 ✨:215,80,24", ["Пора решать!", "זמן להחליט!", 0]),
    short: p("park", "hero:sad finni:happy", "🧗:290,100,44 🎧:180,70,34", ["Чуть-чуть не хватило…", "חסר קצת…", 0, "think"]),
  },
  /* ───── 3. Команда: киоск лимонада ───── */
  kiosk: {
    intro: p("fair", "hero:happy adi:happy noa:happy", "🍋:180,70,40 🥤:180,136,28", ["Откроем киоск!", "נפתח קיוסק!", 0, "shout"]),
    split: p("home", "hero:think adi:wow noa:think", "🍕:180,150,44", ["Как делить пиццу-прибыль?", "איך מחלקים את הרווח?", 0, "think"]),
    product: p("fair", "adi:happy hero:think", "🍬:180,150,40 🍋:130,100,28", ["Давай ещё и леденцы!", "בואו גם סוכריות!", 0]),
    "calc-unit": p("math", "hero:think", "🍋:250,110,44 🥤:295,150,40 ➗:210,150,28"),
    supplier: p("shop", "hero:think seller:sly", "🍋:180,150,44 🏷️:180,100,30", ["Скидку? Ну… может.", "הנחה? אולי…", 1]),
    lazy: p("park", "adi:sad hero:wow", "🥤:180,150,38 ❌:180,100,34", ["Я забыл(а) стаканы!", "שכחתי את הכוסות!", 0, "shout"]),
    price: p("fair", "hero:think", "🏷️:230,120,46 🥤:290,160,38"),
    day: p("fair", "hero:happy noa:happy adi:happy", "🥤:180,150,34 🪙:120,110,22 🪙:240,100,22", ["Очередь! Очередь!", "תור! תור!", 0, "shout"]),
    complaint: p("fair", "hero:wow kid:sad", "🥤:180,150,36 😖:180,96,30", ["Слишком кислый!", "חמוץ מדי!", 1, "shout"]),
    rival: p("fair", "hero:wow teen:sly", "🥤:180,150,34 🏷️:180,96,28", ["А у нас дешевле!", "אצלנו זול יותר!", 1]),
    day2: p("fair", "hero:happy adi:happy noa:neutral", "🌇:290,70,42 🥤:180,160,30"),
    "calc-profit": p("math", "hero:think", "🧮:260,120,60 🥤:300,170,30"),
    "calc-share": p("math", "hero:think", "🍕:250,120,48 ➗:210,120,28 %:300,170,30"),
    promise: p("school", "hero:think teacher:neutral", "🤞:180,130,40", ["Я же обещал(а)…", "הרי הבטחתי…", 0, "think"]),
    feedback: p("park", "hero:think adi:sad noa:think", "💬:180,70,32"),
  },
  /* ───── 4. Детектив ───── */
  detective: {
    intro: p("night", "finni:happy hero:happy", "🔎:290,100,48 🕵️:60,90,32", ["Агентство «Финни и Ко»!", "סוכנות «פיני ושות׳»!", 0]),
    case1: p("phone", "hero:wow scammer:sly", "📩:180,100,52 🎉:140,60,26", ["ПОЗДРАВЛЯЕМ! Ты выиграл!", "מזל טוב! זכית!", 1, "shout"]),
    flags: p("math", "hero:think", "🚩:250,100,50 🚩:295,150,38 🔎:215,160,34"),
    case2: p("phone", "hero:wow", "🎁:250,110,60 🎮:296,60,30 ✨:215,60,24", ["Золотой сундук?!", "תיבת זהב?!", 0, "shout"]),
    case3: p("phone", "hero:think dani:neutral", "🔑:180,110,48 ❓:180,60,28", ["Дай мне пароль!", "תן לי את הסיסמה!", 1]),
    case4: p("phone", "hero:think teen:happy", "🚗:180,130,44 💸:180,70,30", ["Заработал 10 000 ₪!", "הרווחתי 10,000 ₪!", 1, "shout"]),
    "reels-min": p("phone", "hero:wow", "⏱️:250,100,54 📱:296,160,40", ["Ещё один… и ещё…", "עוד אחד… ועוד…", 0, "think"]),
    rule: p("room", "hero:happy finni:happy", "🛠️:180,130,44 ⏱️:180,76,30"),
    case6: p("phone", "hero:think", "🪙:250,100,48 📆:296,150,38", ["7 дней бесплатно…", "7 ימים חינם…", 0, "think"]),
    case7: p("phone", "hero:wow", "🛍️:250,110,50 🏷️:296,60,34 😍:215,160,32", ["Слишком хорошая цена!", "מחיר טוב מדי!", 0, "shout"]),
    case8: p("street", "hero:happy mom:neutral", "✈️:290,60,44 📸:180,120,34", ["Выложить фото?", "להעלות תמונה?", 0, "think"]),
    truth: p("room", "hero:sad finni:happy", "🪞:290,110,56", ["Ошибаются все. Важно — что дальше.", "כולם טועים. חשוב מה הלאה.", 1]),
  },
  /* ───── 5. Мой канал ───── */
  channel: {
    intro: p("room", "hero:happy", "🎬:250,110,56 📷:296,166,36 🔴:215,56,22", ["Запись!", "הקלטה!", 0, "shout"]),
    niche: p("room", "hero:think", "💡:250,70,48 🎮:215,160,34 🎨:296,160,34", ["О чём канал?", "על מה הערוץ?", 0, "think"]),
    gear: p("shop", "hero:happy seller:neutral", "🎤:150,150,34 📷:190,160,34 💡:222,150,34"),
    "calc-roi": p("math", "hero:think", "🎤:250,110,44 ➡️:215,160,26 💰:296,150,40"),
    truth: p("phone", "finni:sly hero:wow", "💸:180,120,46 ❓:180,60,28", ["Откуда деньги у блогеров?", "מאיפה כסף לבלוגרים?", 0]),
    cons: p("room", "hero:think", "📅:250,100,52 🎥:296,160,38"),
    privacy: p("room", "hero:wow", "🔎:250,100,54 🏠:296,160,34 📷:215,160,30", ["Что видно в кадре?", "מה רואים בפריים?", 0, "think"]),
    hater: p("phone", "hero:sad", "😤:250,100,48 💬:296,160,38", ["«Ужасно. Удали!»", "«נורא. תמחקי!»", 0, "think"]),
    bait: p("phone", "hero:sly", "📣:250,100,50 🔥:296,150,40", ["ШОК!!! Не поверишь!", "בלתי יאמן!!!", 0, "shout"]),
    mid: p("stage", "hero:happy", "👁️:250,100,36 👥:296,100,36 📊:272,160,40"),
    sponsor: p("street", "hero:think seller:happy", "🧸:180,130,44 ✉️:180,76,30"),
    fake: p("phone", "hero:wow scammer:sly", "🤖:180,110,44 👥:180,60,28", ["Купи 10 000 подписчиков!", "קני 10,000 עוקבים!", 1, "shout"]),
    time: p("room", "hero:wow", "⏳:250,90,48 📚:215,160,32 🎬:296,160,34"),
    results: p("stage", "hero:happy finni:happy", "🏁:180,70,50 📊:70,70,30 🎉:290,70,30"),
    "calc-hour": p("math", "hero:think", "⏰:250,110,48 ➗:215,160,26 💰:296,150,40"),
    value: p("park", "hero:happy finni:happy", "🧠:180,90,48 ❤️:180,160,28", ["Навык дороже денег!", "מיומנות שווה יותר מכסף!", 1]),
    ethic: p("park", "hero:think finni:neutral", "🌍:180,100,48"),
  },
  /* ───── 6. Кто платит за внимание ───── */
  attention: {
    intro: p("phone", "hero:wow finni:sly", "👁️:180,90,50", ["Лента смотрит на тебя!", "הפיד מסתכל עליך!", 1]),
    product: p("phone", "finni:think", "💰:250,100,50 📢:296,160,36 ❓:215,60,30", ["Если бесплатно — кто платит?", "אם זה חינם — מי משלם?", 0, "think"]),
    hook1: p("phone", "hero:think", "🪝:250,100,52 ✨:296,160,30", ["Какой крючок поставить?", "איזה ווים לשים?", 0, "think"]),
    "calc-earn": p("math", "hero:think", "📺:250,110,50 💰:296,160,40"),
    "hooks-find": p("phone", "hero:wow", "🔔:230,90,40 🔥:290,100,36 🪝:262,160,40"),
    tricks: p("stage", "finni:happy", "🎩:250,100,56 ✨:215,60,28 ✨:296,150,28"),
    "ad-find": p("phone", "hero:think", "👟:250,110,54 ⏰:296,60,34 🔥:215,160,32", ["ТОЛЬКО СЕГОДНЯ!!!", "רק היום!!!", 0, "shout"]),
    "calc-disc": p("math", "hero:think", "🏷️:250,110,52 %:296,160,34"),
    friend: p("street", "hero:wow dani:happy", "📱:180,110,46 🛒:180,168,30", ["Я почти нажал «Купить»!", "כמעט לחצתי «קנה»!", 1]),
    notif: p("room", "hero:wow", "📲:250,100,52 📚:296,160,38 🔔:215,60,30", ["Дзынь! Не сейчас…", "דינג! לא עכשיו…", 0, "think"]),
    fomo: p("school", "hero:sad noa:happy", "😬:180,100,36", ["Ты что, не смотрела?!", "מה, לא ראית?!", 1, "shout"]),
    limit: p("room", "hero:think", "⏱️:250,100,56 📱:296,160,38"),
    "calc-year": p("math", "hero:think", "⏳:250,110,50 365:296,160,30"),
    hours: p("stage", "hero:happy", "🚀:250,100,56 📚:215,160,30 🎨:296,160,30"),
  },
  /* ───── 7. Гном-Инфлянт ───── */
  inflation: {
    intro: [
      p("shop", "hero:wow gnome:sly", "🍕:300,100,40 🪙:120,166,24", ["Куда пропали шекели?", "לאן נעלמו השקלים?", 0, "think"]),
      p("shop", "finni:sly gnome:sly", "👹:180,100,36", ["Это он — Гном-Инфлянт!", "זה הוא — גמד האינפלציה!", 0]),
    ],
    c1: p("shop", "gnome:sly hero:think", "🍕:180,120,48 🏷️:180,66,30", ["Цены +10%! Хи-хи!", "המחירים +10%! חי-חי!", 0]),
    c2: p("shop", "gnome:sly hero:think", "🍕:180,120,48 📈:180,66,34", ["А теперь ещё +10%…", "ועכשיו עוד +10%…", 0]),
    c3: p("math", "hero:wow", "💸:250,100,50 🍕:296,160,36", ["Тех же денег хватает на меньше!", "אותו כסף קונה פחות!", 0, "think"]),
    store: p("home", "hero:think finni:neutral", "🏺:140,168,34 🏦:180,100,40 🐷:222,168,34", ["Где хранить деньги?", "איפה לשמור כסף?", 0, "think"]),
    greenhouse: p("greenhouse", "finni:happy", "🌱:250,150,40 🪙:296,150,30 ☀️:296,50,34"),
    c4: p("greenhouse", "hero:happy", "💰:250,150,36 🌱:296,150,40 ✨:215,80,24"),
    c5: p("math", "finni:think", "🔮:250,110,52 72:296,160,34"),
    alloc: p("greenhouse", "hero:think", "🏠:210,110,34 🏦:250,110,34 🐷:290,110,34 🌱:250,168,34"),
    race: p("park", "noa:happy dani:neutral", "📈:180,100,48 🏁:180,168,30", ["Кто окажется богаче?", "מי יהיה עשיר יותר?", 0, "think"]),
    scam: p("street", "hero:think teen:sly", "💬:180,100,36 🎣:180,166,30", ["20% в месяц! Гарантия!", "20% בחודש! מובטח!", 1, "shout"]),
    plan: p("greenhouse", "hero:happy", "🎯:250,100,50 🌱:296,164,36"),
  },
  /* ───── 8. Первая работа ───── */
  job: {
    intro: p("street", "hero:happy", "💼:250,110,54 ✨:296,60,26", ["Моя первая работа!", "העבודה הראשונה שלי!", 0]),
    safe: p("street", "hero:wow scammer:sly", "⚠️:180,100,44", ["Приходи ко мне домой…", "בואי אליי הביתה…", 1]),
    hours: p("room", "hero:think", "⏰:250,80,46 🐕:215,164,34 📚:296,164,34"),
    "calc-total": p("math", "hero:think", "🧮:250,110,56 💵:296,160,38"),
    haggle: p("street", "neighbor:sly hero:wow", "💵:180,130,40 🐕:180,170,32", ["Тебе и этого хватит.", "גם זה יספיק לך.", 0]),
    double: p("room", "hero:wow", "📅:250,90,48 🐕:215,164,34 🚗:296,164,34", ["Два заказа на час!", "שתי הזמנות לאותה שעה!", 0, "shout"]),
    "calc-opp": p("math", "hero:think", "⚖️:250,110,52 💵:296,160,36"),
    skill: p("home", "hero:think mom:happy", "🎓:180,110,44 📚:180,166,30", ["Вложиться в себя?", "להשקיע בעצמי?", 0, "think"]),
    "calc-payback": p("math", "hero:think", "🎓:250,110,48 ⏳:296,160,36 💵:215,160,30"),
    pay: p("home", "hero:happy", "💰:250,110,50 🗺️:296,160,38"),
    rival: p("street", "neighbor:neutral hero:sad", "😮:180,100,34 🐕:180,166,32", ["Мальчик берёт дешевле.", "ילד לוקח פחות.", 0]),
    tired: p("room", "hero:sad", "🔋:250,100,50 📚:296,160,36 😴:215,60,30"),
  },
  /* ───── 9. Большая покупка: велосипед ───── */
  bigbuy: {
    intro: p("bikeshop", "hero:happy", "🚲:250,150,66 💰:215,80,28", ["Копила на мечту!", "חסכתי על חלום!", 0]),
    hidden: p("bikeshop", "hero:wow seller:sly", "🕵️:180,110,40 🧾:180,166,32", ["А шлем и замок — отдельно!", "וקסדה ומנעול — בנפרד!", 1]),
    "calc-a": p("bikeshop", "hero:think seller:happy", "🚲:180,140,56 🏷️:180,80,30"),
    "calc-b": p("street", "hero:think neighbor:neutral", "🚲:180,146,50 🔧:180,90,28"),
    "calc-c": p("phone", "hero:think", "📦:250,110,50 🚚:296,160,40"),
    "calc-year": p("math", "hero:think", "📊:250,110,52 🚲:296,160,36"),
    inspect: p("street", "hero:think neighbor:neutral", "🔎:150,100,36 🚲:200,150,48"),
    haggle: p("street", "hero:sly neighbor:neutral", "🤝:180,100,40 💵:180,166,30", ["А за 380 ₪ возьмёте?", "ב-380 ₪ תסכים?", 0]),
    final: p("bikeshop", "finni:happy hero:think", "🚦:180,100,42 🚲:180,160,36", ["Ты всё посчитала. Выбирай!", "חישבת הכול. תבחרי!", 0]),
    pressure: p("bikeshop", "seller:sly hero:wow", "⏰:180,100,44", ["Скидка только до закрытия!", "ההנחה רק עד הסגירה!", 0, "shout"]),
    after: p("street", "hero:happy", "🚲:250,150,60 🔒:296,100,34", ["Теперь — замок!", "עכשיו — מנעול!", 0]),
    regret: p("park", "hero:happy finni:happy", "🚲:180,150,52 🌳:300,100,36"),
  },
  /* ───── 10. Откуда деньги у семьи ───── */
  family: {
    intro: p("home", "mom:happy dad:neutral hero:happy", "🏠:180,70,36 🧾:180,166,32"),
    "calc-net": p("math", "hero:think", "💼:250,110,50 ➖:296,160,30 🏛️:215,160,34"),
    needs: p("home", "hero:think mom:neutral", "🧾:180,130,40 🍽️:180,70,28"),
    budget: p("home", "mom:think dad:think hero:think", "💼:180,70,34"),
    car: p("street", "dad:sad mom:sad", "🚗:180,150,62 🔧:180,76,32", ["Машина сломалась…", "האוטו התקלקל…", 0]),
    shortfall: p("home", "mom:sad hero:wow", "💳:180,130,40 ❓:180,76,28", ["Не хватает денег…", "חסר כסף…", 0]),
    "calc-loan": p("math", "hero:think", "💳:250,110,48 📅:296,160,36 %:215,160,30"),
    "calc-hours": p("math", "hero:wow", "🍕:250,110,48 ⏱️:296,160,38"),
    thanks: p("home", "hero:happy mom:happy", "❤️:180,100,42"),
    meeting: p("home", "mom:happy dad:happy hero:happy", "💰:180,76,34 🏠:180,166,28", ["Семейный совет!", "מועצת משפחה!", 0]),
    rich: p("park", "mom:happy dad:happy hero:happy", "🌟:180,60,40"),
  },
  /* ───── 11. Добрые деньги ───── */
  giving: {
    intro: p("stage", "hero:happy finni:happy", "💛:180,80,48 🏆:70,70,32"),
    grandma: p("street", "rose:sad hero:happy", "🛒:180,160,40 🥦:180,100,30", ["Мне тяжело ходить в магазин…", "קשה לי ללכת לחנות…", 0]),
    "scam-letter": p("phone", "hero:wow scammer:sly", "📩:180,100,48", ["СРОЧНО! Переведи деньги!", "דחוף! תעביר כסף!", 1, "shout"]),
    school: p("school", "teacher:happy hero:happy", "📚:180,130,40 🔧:180,76,30"),
    "split-fund": p("math", "hero:think finni:neutral", "⚖️:180,110,52"),
    fix: p("room", "hero:think", "🎧:250,110,50 🪡:296,160,34", ["Починить или купить новые?", "לתקן או לקנות חדשות?", 0, "think"]),
    "calc-eco": p("math", "hero:think", "♻️:250,110,50 💵:296,160,38"),
    pressure: p("school", "dani:sly hero:wow", "😬:180,100,36", ["Давай все скинемся!", "בואו כולם נתרום!", 0]),
    meaning: p("park", "hero:happy rose:happy", "💛:180,90,48"),
  },
  /* ───── 12. Остров Пиццы ───── */
  island: {
    intro: p("island", "finni:happy hero:wow", "🏝️:300,60,34 🍕:180,166,36", ["Добро пожаловать!", "ברוכה הבאה!", 0]),
    "calc-bank": p("greenhouse", "hero:think", "🏦:250,110,52 📈:296,150,36"),
    alloc: p("island", "hero:think finni:neutral", "🍕:150,170,32 🏦:190,170,32 🍎:230,170,32"),
    y1: p("island", "hero:happy", "📈:250,100,54 🍕:296,160,36 🎉:215,60,26", ["Пицца взлетела!", "הפיצה המריאה!", 0, "shout"]),
    greed: p("island", "dani:sly hero:wow", "🤑:180,100,42", ["Переложи всё в пиццу!", "תעביר הכול לפיצה!", 0]),
    y2: p("island", "hero:sad", "📉:250,100,54 🍕:296,160,34 💥:215,60,28", ["Обвал!", "קריסה!", 0, "shout"]),
    fear: p("island", "hero:sad finni:neutral", "😰:180,90,40"),
    "scam-island": p("island", "hero:wow scammer:sly", "🎭:180,90,42 💬:180,160,24", ["30% в месяц! Гарантия!", "30% בחודש! מובטח!", 1, "shout"]),
    y3: p("island", "hero:happy", "🌅:250,80,50 📈:296,160,36"),
    "calc-compound": p("greenhouse", "hero:think", "🌱:250,120,50 %:296,160,30"),
    tip: p("island", "dani:think hero:think", "👥:180,90,36", ["Ты умная — что купить?", "את חכמה — מה לקנות?", 0]),
    wealth: p("island", "hero:happy finni:happy", "🧭:180,100,48"),
  },
  /* ───── 13. Переговоры с родителями ───── */
  negotiator: {
    intro: p("home", "mom:neutral dad:neutral hero:think", "🤝:180,80,38"),
    args: p("home", "hero:think dad:neutral", "🔍:180,110,44 💬:180,166,26"),
    timing: p("home", "mom:sad dad:sad hero:wow", "⏰:180,66,40 🍽️:180,166,28", ["Они только с работы…", "הם רק חזרו מהעבודה…", 2, "think"]),
    "calc-need": p("math", "hero:think", "🧾:250,110,50 🚌:296,160,34"),
    "calc-gap": p("math", "hero:think", "🔢:250,110,50 ➖:296,160,30"),
    open: p("home", "hero:happy mom:happy dad:neutral", "🎬:180,70,34", ["Можно с вами поговорить?", "אפשר לדבר איתכם?", 0]),
    objection: p("home", "dad:wow hero:sad", "😮:180,90,36 💸:180,166,28", ["Это слишком много!", "זה יותר מדי!", 0, "shout"]),
    deal: p("home", "hero:happy mom:happy", "🎯:180,90,42 🤝:180,166,32", ["Договорились?", "סגרנו?", 0]),
    no: p("home", "hero:think finni:neutral", "💭:180,76,38", ["А если «нет»?", "ואם «לא»?", 1]),
  },
  /* ───── 14. Финал ───── */
  finale: {
    intro: p("stage", "hero:happy finni:happy", "🏆:180,70,56 🎉:60,60,30 🎉:300,60,30", ["Большой финал!", "הגמר הגדול!", 1, "shout"]),
    "b-infl": p("stage", "gnome:sly hero:wow", "👹:180,70,34"),
    "b-profit": p("stage", "hero:think", "🧮:250,110,54 📿:296,160,34"),
    "b-scam": p("stage", "scammer:sly hero:wow", "🔎:180,100,40", ["Отправь код из SMS!", "שלחי את הקוד מה-SMS!", 0, "shout"]),
    "b-reels": p("stage", "hero:think", "📱:250,110,56 🎯:296,160,34"),
    "b-impulse": p("stage", "hero:think", "👟:250,110,50 ⏱️:296,160,36", ["Подожду 24 часа.", "אחכה 24 שעות.", 0, "think"]),
    "b-people": p("stage", "dani:sad hero:think", "💬:180,80,34 💵:180,166,28"),
    myplan: p("math", "hero:happy finni:happy", "🗺️:180,100,46 💰:180,164,30"),
    "calc-dream": p("bikeshop", "hero:happy", "🚲:250,150,62 🎯:215,70,30"),
    habit: p("room", "hero:think", "🎒:250,120,50 🗓️:296,160,36"),
    cert: p("stage", "hero:happy finni:happy", "🎓:180,70,50 📜:180,160,34", ["Сертификат Финни!", "תעודת פיני!", 1, "shout"]),
  },
};

/** Общие кадры, если у сцены нет своего. */
const GENERIC: Record<string, PanelSpec> = {
  offline: p("park", "hero:happy finni:happy", "🌍:290,60,40 👣:180,170,26", ["Теперь — в настоящем мире!", "עכשיו — בעולם האמיתי!", 1]),
  end: p("stage", "hero:happy finni:happy", "🏆:180,70,56 🎉:60,60,30 🎉:300,60,30", ["Миссия пройдена!", "המשימה הושלמה!", 1, "shout"]),
  story: p("room", "hero:neutral finni:happy", "✨:180,70,26"),
  choice: p("room", "hero:think", "❓:250,90,46"),
  calc: p("math", "hero:think", "🧮:250,110,56"),
  input: p("math", "hero:think", "🎚️:250,110,50"),
  find: p("phone", "hero:wow", "🔎:250,100,54"),
  split: p("math", "hero:think", "🍕:250,110,50"),
};

export function panelsFor(missionId: string, sceneId: string, kind: string): PanelSpec[] {
  const e = M[missionId]?.[sceneId];
  if (e) return Array.isArray(e) ? e : [e];
  return [GENERIC[kind] ?? GENERIC.story];
}

export const hasOwnPanel = (missionId: string, sceneId: string) => !!M[missionId]?.[sceneId];
export const COMICS_TABLE = M;
