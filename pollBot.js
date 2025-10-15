const { Telegraf, Markup } = require("telegraf");
const moment = require("moment"); // библиотека для работы с датами
moment.locale("ru");
const bot = new Telegraf("8016112503:AAFJEUKvE-LYtmd4AJCw_YgbtfyRqdbRvbU");
const GROUP_CHAT_ID = -1002937296294;

const selectedDates = new Set();
const userData = {};

bot.command("getid", (ctx) => {
  ctx.reply(`ID этого чата: ${ctx.chat.id}`);
});

bot.telegram.setMyCommands([
  { command: "start", description: "Назначить даты" },
  { command: "calendar", description: "Открыть календарь" },
  { command: "reset", description: "Сбросить выбранные даты" },
  { command: "help", description: "Показать справку" },
]);

bot.command("calendar", (ctx) => {
  const now = moment();
  userData[ctx.from.id] = {
    selected: new Set(),
    year: now.year(),
    month: now.month(),
  };
  ctx.reply(
    "📅 Выберите даты для опроса:",
    generateCalendar(now.year(), now.month())
  );
});

bot.command("reset", (ctx) => {
  userData[ctx.from.id] = { selected: new Set() };
  ctx.reply("🔄 Выбранные даты сброшены.");
});

bot.command("help", (ctx) => {
  ctx.reply(
    "🧭 Команды:\n/start — начать работу\n/calendar — выбрать даты\n/reset — сбросить даты"
  );
});

// === Генерация календаря ===
function generateCalendar(year, month, selected = new Set()) {
  const start = moment([year, month]);
  const end = moment(start).endOf("month");
  const monthName = start.format("MMMM YYYY"); // например: Октябрь 2025

  const weeks = [];

  // 1️⃣ Заголовок месяца
  weeks.push([Markup.button.callback(`📅 ${monthName}`, "noop")]);

  // 2️⃣ Дни недели
  const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  weeks.push(weekDays.map((d) => Markup.button.callback(d, "noop")));

  // 3️⃣ Пустые кнопки до первого дня месяца
  let week = [];
  for (let i = 1; i < start.isoWeekday(); i++) {
    week.push(Markup.button.callback(" ", "noop"));
  }

  // 4️⃣ Основные дни месяца
  for (let i = 1; i <= end.date(); i++) {
    const today = moment().format('YYYY-MM-DD');
    const day = moment([year, month, i]);
    const dateStr = day.format("YYYY-MM-DD");
    const label = selected.has(dateStr)
      ? `✅${day.format("D")}`
      : dateStr === today
      ? `🔹${day.format("D")}`
      : day.format("D");
    week.push(Markup.button.callback(label, `date_${dateStr}`));

    // если неделя закончилась или день последний — добавляем строку
    if (day.isoWeekday() === 7 || i === end.date()) {
      // 5️⃣ добиваем неделю до 7 дней пустыми ячейками
      while (week.length < 7) {
        week.push(Markup.button.callback(" ", "noop"));
      }
      weeks.push(week);
      week = [];
    }
  }

  // 6️⃣ Навигация + кнопка "Создать опрос"
  const controls = [
    [
      Markup.button.callback("◀️", `month_${year}_${month - 1}`),
      Markup.button.callback("▶️", `month_${year}_${month + 1}`),
    ],
  ];

  if (selected.size >= 2) {
    controls.unshift([
      Markup.button.callback("📊 Создать опрос", "create_poll"),
    ]);
  }

  return Markup.inlineKeyboard([...weeks, ...controls]);
}

// === /start ===
bot.start((ctx) => {
  const now = moment();
  userData[ctx.from.id] = {
    selected: new Set(),
    year: now.year(),
    month: now.month(),
  };

  ctx.reply(
    "🎲 Привет! Выбери даты для опроса о следующей игре:",
    generateCalendar(now.year(), now.month())
  );
});

// === Переключение месяца ===
bot.action(/month_(\d+)_(\-?\d+)/, async (ctx) => {
  const id = ctx.from.id;
  const user = userData[id];
  if (!user) return;

  let year = parseInt(ctx.match[1]);
  let month = parseInt(ctx.match[2]);

  if (month < 0) {
    month = 11;
    year -= 1;
  }
  if (month > 11) {
    month = 0;
    year += 1;
  }

  user.year = year;
  user.month = month;

  await ctx.editMessageReplyMarkup(
    generateCalendar(year, month, user.selected).reply_markup
  );
});

// === Выбор даты ===
bot.action(/date_(\d{4}-\d{2}-\d{2})/, async (ctx) => {
  const id = ctx.from.id;
  const user = userData[id];
  if (!user) return;

  const date = ctx.match[1];
  if (user.selected.has(date)) {
    user.selected.delete(date); // повторное нажатие — отмена выбора
  } else {
    user.selected.add(date);
  }

  await ctx.editMessageReplyMarkup(
    generateCalendar(user.year, user.month, user.selected).reply_markup
  );
});

// === Создание опроса ===
bot.action("create_poll", async (ctx) => {
  const id = ctx.from.id;
  const user = userData[id];
  if (!user || user.selected.size < 2)
    return ctx.answerCbQuery("❌ Нужно выбрать минимум 2 даты!");

  user.awaitingTitle = true;
  await ctx.reply(
    '📝 Введите название опроса, например:\n\n"Покорение Северной горы. Когда играем?"'
  );
});

// === Ввод названия ===
bot.on("text", async (ctx) => {
  const id = ctx.from.id;
  const user = userData[id];
  if (!user || !user.awaitingTitle) return;

  const title = ctx.message.text.trim();
  if (!title) return ctx.reply("Введите название!");

  const options = Array.from(user.selected)
    .sort()
    .map((d) => moment(d).format("D MMMM (ddd)"));

  await ctx.telegram.sendPoll(GROUP_CHAT_ID, title, options, {
    is_anonymous: false,
  });

  await ctx.reply(`✅ Опрос "${title}" создан!`);

  // очищаем данные
  delete userData[id];
});

// === Запуск ===
bot.launch();
console.log("🎮 Бот для выбора дат запущен!");
