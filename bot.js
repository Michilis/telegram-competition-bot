const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const messages = require('./messages');
const wallet = require('./modules/wallet');
const competitions = require('./modules/competitions');
const registerBet = require('./modules/registerBet');

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start(async (ctx) => {
  if (ctx.chat.type === 'private') {
    await wallet.createWallet(ctx);
  }
  await competitions.listCompetitions(ctx);
});

bot.help((ctx) => {
  ctx.reply(messages.HELP_MESSAGE);
});

bot.command('create_user', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply(messages.DM_ONLY_COMMAND);
    return;
  }
  await wallet.createUser(ctx);
});

bot.command('create_competition', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 6) {
    ctx.reply(messages.USAGE_CREATE_COMPETITION);
    return;
  }
  await competitions.createCompetition(ctx, args);
});

bot.command('list_competitions', async (ctx) => {
  await competitions.listCompetitions(ctx);
});

bot.command('register_bet', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply(messages.ENTER_BET_AMOUNT);
    return;
  }
  await registerBet.registerBet(ctx, args[0], args.slice(1).join(' '));
});

bot.command('send', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    ctx.reply(messages.SEND_SATS_USAGE);
    return;
  }
  await wallet.sendSats(ctx, args[0], args[1]);
});

bot.command('link', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply(messages.DM_ONLY_COMMAND);
    return;
  }
  await wallet.linkWallet(ctx);
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.match(/^[lnbc|LNBC][0-9a-zA-Z]{1,}$/)) {
    await wallet.payInvoice(ctx, text);
  } else if (ctx.chat.type === 'private' && ctx.message.reply_to_message && ctx.message.reply_to_message.text === messages.ENTER_BET_AMOUNT) {
    await registerBet.handleBetAmount(ctx, text);
  }
});

bot.on('photo', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply(messages.DM_ONLY_COMMAND);
    return;
  }
  await wallet.handleQrCode(ctx);
});

bot.on('command', async (ctx) => {
  setTimeout(() => ctx.deleteMessage(ctx.message.message_id), MESSAGE_DISPOSE_DURATION);
});

bot.launch();
