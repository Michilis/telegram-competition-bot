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

// Ensure the data folder exists
if (!fs.existsSync(DATA_FOLDER)) {
  fs.mkdirSync(DATA_FOLDER);
}

async function createUser(ctx) {
  const username = ctx.from.username;
  try {
    // Create a new user
    const response = await axios.post(`${LNBITS_URL}/usermanager/api/v1/users`, {
      user_name: username,
      email: `${username}@example.com`
    }, { headers: HEADERS });

    const user = response.data;
    const userId = user.id;

    // Create a wallet for the new user
    const walletResponse = await axios.post(`${LNBITS_URL}/usermanager/api/v1/wallets`, {
      user_id: userId,
      wallet_name: `${username}'s wallet`
    }, { headers: HEADERS });

    const wallet = walletResponse.data;
    const walletId = wallet.id;

    // Save user data locally
    saveUserData(username, userId, walletId);

    // Create LNURLp for the new wallet
    await createLnurlp(ctx, userId);

    ctx.reply(messages.USER_AND_WALLET_CREATION_SUCCESS.replace('{}', userId).replace('{}', walletId));
  } catch (error) {
    console.error('Error creating user or wallet:', error.response ? error.response.data : error.message);
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
    console.error('Error creating LNURLp:', error.response ? error.response.data : error.message);
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
    console.error('Error loading user data:', error.message);
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
    console.error('Error linking wallet:', error.message);
    ctx.reply(messages.LINK_WALLET_FAILED);
  }
}

async function sendSats(ctx, amountStr, recipient) {
  const username = ctx.from.username;
  const userData = loadUserData(username);
  if (!userData) {
    ctx.reply(messages.USER_NOT_FOUND);
    return;
  }

  const amount = parseInt(amountStr, 10);
  const [recipientUsername, recipientDomain] = recipient.split('@');
  const recipientData = loadUserData(recipientUsername);
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
    console.error('Error sending Sats:', error.response ? error.response.data : error.message);
    ctx.reply(messages.SEND_SATS_FAILED);
  }
}

async function payInvoice(ctx, invoice) {
  const username = ctx.from.username;
  const userData = loadUserData(username);
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
    console.error('Error paying invoice:', error.response ? error.response.data : error.message);
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
    console.error('Error handling QR code:', error.response ? error.response.data : error.message);
    ctx.reply(messages.INVALID_INVOICE);
  }
}

module.exports = {
  createUser,
  createWallet,
  loadUserData,
  linkWallet,
  sendSats,
  payInvoice,
  handleQrCode
};
