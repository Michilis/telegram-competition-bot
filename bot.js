import logging
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Updater, CommandHandler, CallbackQueryHandler, MessageHandler, Filters, CallbackContext
import requests
import json
from dotenv import load_dotenv
from datetime import datetime
import messages as msg

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
LNBITS_URL = os.getenv('LNBITS_URL')
LNBITS_API_KEY = os.getenv('LNBITS_API_KEY')

HEADERS = {
    'Content-Type': 'application/json',
    'X-Api-Key': LNBITS_API_KEY
}

DATA_FOLDER = 'data'
if not os.path.exists(DATA_FOLDER):
    os.makedirs(DATA_FOLDER)

def start(update: Update, context: CallbackContext) -> None:
    if update.message.chat.type == 'private':
        create_wallet(update, context)
    list_competitions(update, context)

def help_command(update: Update, context: CallbackContext) -> None:
    update.message.reply_text(msg.HELP_MESSAGE)

def create_user(update: Update, context: CallbackContext) -> None:
    if update.message.chat.type != 'private':
        update.message.reply_text(msg.DM_ONLY_COMMAND)
        return

    username = update.message.from_user.username
    response = requests.post(f'{LNBITS_URL}/usermanager/api/v1/users', headers=HEADERS, json={
        'name': username,
        'email': f'{username}@example.com'
    })
    if response.status_code == 201:
        user = response.json()
        user_id = user['id']
        wallet_response = requests.post(f'{LNBITS_URL}/usermanager/api/v1/wallets', headers=HEADERS, json={
            'user_id': user_id,
            'name': f"{username}'s wallet"
        })
        if wallet_response.status_code == 201:
            wallet = wallet_response.json()
            wallet_id = wallet['id']
            create_lnurlp(update, context, user_id)
            update.message.reply_text(msg.USER_AND_WALLET_CREATION_SUCCESS.format(user_id, wallet_id))
            save_user_data(username, user_id, wallet_id)
        else:
            update.message.reply_text(msg.WALLET_CREATION_FAILED)
    else:
        update.message.reply_text(msg.USER_CREATION_FAILED)

def create_lnurlp(update: Update, context: CallbackContext, user_id: str) -> None:
    username = update.message.from_user.username
    response = requests.post(f'{LNBITS_URL}/lnurlp/api/v1/links', headers=HEADERS, json={
        'user_id': user_id,
        'description': 'Lightning Address',
        'amount': 0,  # 0 for any amount
        'username': username
    })
    if response.status_code == 201:
        lnurlp = response.json()
        link_id = lnurlp['id']
        update.message.reply_text(f'LNURLp created successfully! Link ID: {link_id}')
    else:
        update.message.reply_text('Failed to create LNURLp.')

def save_user_data(username, user_id, wallet_id):
    user_data = {
        'user_id': user_id,
        'wallet_id': wallet_id
    }
    with open(f'{DATA_FOLDER}/{username}.json', 'w') as f:
        json.dump(user_data, f)

def load_user_data(username):
    try:
        with open(f'{DATA_FOLDER}/{username}.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return None

def create_competition(update: Update, context: CallbackContext) -> None:
    user_data = load_user_data(update.message.from_user.username)
    if not user_data:
        update.message.reply_text(msg.USER_NOT_FOUND)
        return

    try:
        args = context.args
        name = args[0]
        info = args[1]
        banner = args[2]
        choices = args[3].split(',')
        closing_datetime = args[4]
        amount_tickets = int(args[5])
    except IndexError:
        update.message.reply_text(msg.USAGE_CREATE_COMPETITION)
        return

    if len(choices) < 2 or len(choices) > 10:
        update.message.reply_text(msg.CHOICES_LIMIT_ERROR)
        return

    wallet_id = user_data['wallet_id']
    response = requests.post(f'{LNBITS_URL}/bets4sats/api/v1/competitions', headers=HEADERS, json={
        'wallet': wallet_id,
        'name': name,
        'info': info,
        'banner': banner,
        'closing_datetime': closing_datetime,
        'amount_tickets': amount_tickets,
        'min_bet': 1,
        'max_bet': 100000,
        'choices': choices
    })
    if response.status_code == 201:
        update.message.reply_text(msg.COMPETITION_CREATED_SUCCESS)
    else:
        update.message.reply_text(msg.COMPETITION_CREATION_FAILED)

def list_competitions(update: Update, context: CallbackContext) -> None:
    response = requests.get(f'{LNBITS_URL}/bets4sats/api/v1/competitions', headers=HEADERS)
    if response.status_code == 200:
        competitions = response.json()
        keyboard = []
        for comp in competitions:
            keyboard.append([InlineKeyboardButton(comp['name'], callback_data=f"comp_{comp['id']}")])
        reply_markup = InlineKeyboardMarkup(keyboard)
        update.message.reply_text('Competitions:', reply_markup=reply_markup)
    else:
        update.message.reply_text(msg.COMPETITIONS_LIST_FAILED)

def register_bet(update: Update, context: CallbackContext) -> None:
    query = update.callback_query
    query.answer()
    context.user_data['competition_id'] = query.data.split('_')[1]
    query.edit_message_text(msg.ENTER_BET_AMOUNT)

def handle_bet_amount(update: Update, context: CallbackContext) -> None:
    competition_id = context.user_data.get('competition_id')
    if not competition_id:
        return

    try:
        amount = int(update.message.text)
    except ValueError:
        update.message.reply_text('Please enter a valid number.')
        return

    user_data = load_user_data(update.message.from_user.username)
    if not user_data:
        update.message.reply_text(msg.USER_NOT_FOUND)
        return

    response = requests.post(f'{LNBITS_URL}/bets4sats/api/v1/tickets/{competition_id}', headers=HEADERS, json={
        'details': f'Bet amount: {amount}',
        'bettor': update.message.from_user.username
    })
    if response.status_code == 200:
        update.message.reply_text(msg.BET_REGISTERED_SUCCESS)
    else:
        update.message.reply_text(msg.BET_REGISTRATION_FAILED)

def send_sats(update: Update, context: CallbackContext) -> None:
    if update.message.chat.type != 'private':
        update.message.reply_text(msg.DM_ONLY_COMMAND)
        return

    try:
        args = context.args
        recipient_username = args[0]
        amount = int(args[1])
    except (IndexError, ValueError):
        update.message.reply_text(msg.SEND_SATS_USAGE)
        return

    sender_data = load_user_data(update.message.from_user.username)
    if not sender_data:
        update.message.reply_text(msg.USER_NOT_FOUND)
        return

    recipient_data = load_user_data(recipient_username)
    if not recipient_data:
        update.message.reply_text('Recipient not found.')
        return

    sender_wallet_id = sender_data['wallet_id']
    recipient_lnurl = f'{LNBITS_URL}/lnurlp/api/v1/well-known/{recipient_username}'

    response = requests.post(f'{LNBITS_URL}/payments', headers=HEADERS, json={
        'out': True,
        'amount': amount,
        'wallet_id': sender_wallet_id,
        'memo': 'Sending Sats',
        'payment_request': recipient_lnurl
    })

    if response.status_code == 201:
        update.message.reply_text(msg.SEND_SATS_SUCCESS)
    else:
        update.message.reply_text(msg.SEND_SATS_FAILED)

def create_wallet(update: Update, context: CallbackContext) -> None:
    username = update.message.from_user.username
    user_data = load_user_data(username)
    if not user_data:
        create_user(update, context)

def pay_invoice(update: Update, context: CallbackContext) -> None:
    if update.message.chat.type != 'private':
        update.message.reply_text(msg.DM_ONLY_COMMAND)
        return

    invoice = update.message.text
    user_data = load_user_data(update.message.from_user.username)
    if not user_data:
        update.message.reply_text(msg.USER_NOT_FOUND)
        return

    wallet_id = user_data['wallet_id']
    response = requests.post(f'{LNBITS_URL}/payments', headers=HEADERS, json={
        'out': True,
        'wallet_id': wallet_id,
        'payment_request': invoice
    })

    if response.status_code == 201:
        update.message.reply_text(msg.PAY_INVOICE_SUCCESS)
    else:
        update.message.reply_text(msg.PAY_INVOICE_FAILED)

# Main function to start the bot
def main() -> None:
    updater = Updater(TOKEN)

    dispatcher = updater.dispatcher

    dispatcher.add_handler(CommandHandler("start", start))
    dispatcher.add_handler(CommandHandler("help", help_command))
    dispatcher.add_handler(CommandHandler("create_user", create_user))
    dispatcher.add_handler(CommandHandler("create_competition", create_competition, pass_args=True))
    dispatcher.add_handler(CommandHandler("list_competitions", list_competitions))
    dispatcher.add_handler(CommandHandler("register_bet", register_bet))
    dispatcher.add_handler(CommandHandler("send_sats", send_sats, pass_args=True))
    dispatcher.add_handler(CallbackQueryHandler(register_bet))
    dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_bet_amount))
    dispatcher.add_handler(MessageHandler(Filters.text & Filters.regex(r'^[lnbc|LNBC][0-9a-zA-Z]{1,}$'), pay_invoice))

    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main()

