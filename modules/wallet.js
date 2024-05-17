const axios = require('axios');
const fs = require('fs');
const messages = require('../messages');

const LNBITS_URL = process.env.LNBITS_URL;
const LNBITS_API_KEY = process.env.LNBITS_API_KEY;
const DATA_FOLDER = 'data';
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': LNBITS_API_KEY
};

async function createUser(ctx) {
  const username = ctx.from.username;
  try {
    const response = await axios.post(`${LNBITS_URL}/usermanager/api/v1/users`, {
      name: username,
      email: `${username}@example.com`
    }, { headers: HEADERS });

    const user = response.data;
    const userId = user.id;

    const walletResponse = await axios.post(`${LNBITS_URL}/usermanager/api/v1/wallets`, {
      user_id: userId,
      name: `${username}'s wallet`
    }, { headers: HEADERS });

    const wallet = walletResponse.data;
    const walletId = wallet.id;

    await createLnurlp(ctx, userId);
    ctx.reply(messages.USER_AND_WALLET_CREATION_SUCCESS.replace('{}', userId).replace('{}', walletId));
    saveUserData(username, userId, walletId);
  } catch (error) {
    ctx.reply(messages.USER_CREATION_FAILED);
  }
}

async function createLnurlp(ctx, userId) {
  const username = ctx.from.username;
  try {
    const response = await axios.post(`${LNBITS_URL}/lnurlp/api/v1/links`, {
      user_id: userId,
      description: 'Lightning Address',
      amount: 0,
      username
    }, { headers: HEADERS });

    const lnurlp = response.data;
    const linkId = lnurlp.id;
    ctx.reply(`LNURLp created successfully! Link ID: ${linkId}`);
  } catch (error) {
    ctx.reply('Failed to create LNURLp.');
  }
}

function saveUserData(username, userId, walletId) {
  const userData = { user_id: userId, wallet_id: walletId };
  fs.writeFileSync(`${DATA_FOLDER}/${username}.json`, JSON.stringify(userData));
}

function loadUserData(username) {
  try {
    const data = fs.readFileSync(`${DATA_FOLDER}/${username}.json`);
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function createWallet(ctx) {
  const username = ctx.from.username;
  const userData = loadUserData(username);
  if (!userData) {
    await createUser(ctx);
  }
}

async function linkWallet(ctx) {
  const username = ctx.from.username;
  const userData = loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  try {
    ctx.reply(messages.LINK_WALLET_SUCCESS.replace('{}', process.env.LNBITS_PUBLIC_URL));
  } catch (error) {
    ctx.reply(messages.LINK_WALLET_FAILED);
  }
}

module.exports = {
  createUser,
  createWallet,
  loadUserData,
  linkWallet
};
