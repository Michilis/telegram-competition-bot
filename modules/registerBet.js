const axios = require('axios');
const messages = require('../messages');

const LNBITS_URL = process.env.LNBITS_URL;
const LNBITS_API_KEY = process.env.LNBITS_API_KEY;
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': LNBITS_API_KEY
};

async function registerBet(ctx, competitionId, betDetails) {
  const { loadUserData } = require('./wallet');
  const username = ctx.from.username;
  const userData = loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  try {
    await axios.post(`${LNBITS_URL}/bets4sats/api/v1/tickets/${competitionId}`, {
      details: betDetails,
      bettor: username
    }, { headers: HEADERS });

    ctx.reply(messages.BET_REGISTERED_SUCCESS);
  } catch (error) {
    ctx.reply(messages.BET_REGISTRATION_FAILED);
  }
}

async function handleBetAmount(ctx, amount) {
  const competitionId = ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.split('_')[1];
  await registerBet(ctx, competitionId, `Bet amount: ${amount}`);
}

module.exports = {
  registerBet,
  handleBetAmount
};
