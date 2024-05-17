const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
const messages = require('./messages');
const wallet = require('./modules/wallet');
const competitions = require('./modules/competitions');
const registerBet = require('./modules/registerBet');
const axios = require('axios');
const fs = require('fs');
const { decode } = require('jsqr');

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const LNBITS_API_KEY = process.env.LNBITS_API_KEY;
const LNBITS_URL = process.env.LNBITS_URL;
const MESSAGE_DISPOSE_DURATION = 10000;
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': LNBITS_API_KEY
};

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
  await sendSats(ctx, args[0], args[1]);
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
    await payInvoice(ctx, text);
  } else if (ctx.chat.type === 'private' && ctx.message.reply_to_message && ctx.message.reply_to_message.text === messages.ENTER_BET_AMOUNT) {
    await registerBet.handleBetAmount(ctx, text);
  }
});

bot.on('photo', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    ctx.reply(messages.DM_ONLY_COMMAND);
    return;
  }
  await handleQrCode(ctx);
});

bot.on('command', async (ctx) => {
  setTimeout(() => ctx.deleteMessage(ctx.message.message_id), MESSAGE_DISPOSE_DURATION);
});

async function sendSats(ctx, amountStr, recipient) {
  const username = ctx.from.username;
  const userData = wallet.loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  const amount = parseInt(amountStr, 10);
  const [recipientUsername, recipientDomain] = recipient.split('@');
  const recipientData = wallet.loadUserData(recipientUsername);
  if (!recipientData) {
    ctx.reply('Recipient not found.');
    return;
  }

  const senderWalletId = userData.wallet_id;
  const recipientLnurl = `${LNBITS_URL}/lnurlp/api/v1/well-known/${recipientUsername}@${recipientDomain}`;

  try {
    await axios.post(`${LNBITS_URL}/payments`, {
      out: true,
      amount,
      wallet_id: senderWalletId,
      memo: 'Sending Sats',
      payment_request: recipientLnurl
    }, { headers: HEADERS });

    ctx.reply(messages.SEND_SATS_SUCCESS);
  } catch (error) {
    ctx.reply(messages.SEND_SATS_FAILED);
  }
}

async function payInvoice(ctx, invoice) {
  const username = ctx.from.username;
  const userData = wallet.loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  const walletId = userData.wallet_id;

  try {
    await axios.post(`${LNBITS_URL}/payments`, {
      out: true,
      wallet_id: walletId,
      payment_request: invoice
    }, { headers: HEADERS });

    ctx.reply(messages.PAY_INVOICE_SUCCESS);
  } catch (error) {
    ctx.reply(messages.PAY_INVOICE_FAILED);
  }
}

async function handleQrCode(ctx) {
  const photo = ctx.message.photo.pop();
  const fileId = photo.file_id;
  const file = await bot.telegram.getFile(fileId);
  const filePath = file.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  try {
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');
    const qrCode = await decode(imageBuffer);

    if (qrCode) {
      await payInvoice(ctx, qrCode.data);
    } else {
      ctx.reply(messages.INVALID_INVOICE);
    }
  } catch (error) {
    ctx.reply(messages.INVALID_INVOICE);
  }
}

bot.launch();
