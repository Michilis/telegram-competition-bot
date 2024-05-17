const axios = require('axios');
const messages = require('../messages');
const { loadUserData } = require('./wallet');

const LNBITS_URL = process.env.LNBITS_URL;
const LNBITS_API_KEY = process.env.LNBITS_API_KEY;
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': LNBITS_API_KEY
};

async function createCompetition(ctx, args) {
  const username = ctx.from.username;
  const userData = loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  const [name, info, banner, choicesStr, closingDatetime, amountTicketsStr] = args;
  const choices = choicesStr.split(',');
  if (choices.length < 2 || choices.length > 10) {
    ctx.reply(messages.CHOICES_LIMIT_ERROR);
    return;
  }

  const amountTickets = parseInt(amountTicketsStr, 10);
  const walletId = userData.wallet_id;

  try {
    await axios.post(`${LNBITS_URL}/bets4sats/api/v1/competitions`, {
      wallet: walletId,
      name,
      info,
      banner,
      closing_datetime: closingDatetime,
      amount_tickets: amountTickets,
      min_bet: 1,
      max_bet: 100000,
      choices
    }, { headers: HEADERS });

    ctx.reply(messages.COMPETITION_CREATED_SUCCESS);
  } catch (error) {
    ctx.reply(messages.COMPETITION_CREATION_FAILED);
  }
}

async function listCompetitions(ctx) {
  try {
    const response = await axios.get(`${LNBITS_URL}/bets4sats/api/v1/competitions`, { headers: HEADERS });
    const competitions = response.data;
    const keyboard = competitions.map(comp => [ { text: comp.name, callback_data: `comp_${comp.id}` } ]);
    ctx.reply('Competitions:', { reply_markup: { inline_keyboard: keyboard } });
  } catch (error) {
    ctx.reply(messages.COMPETITIONS_LIST_FAILED);
  }
}

module.exports = {
  createCompetition,
  listCompetitions
};
