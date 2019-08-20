const KEY_VALUE_TTL = process.env.KEY_VALUE_TTL || 3; // days
const Keyv = require('keyv');
const keyv_ttl = KEY_VALUE_TTL * 24 * 60 * 60 * 1000; // KEY_VALUE_TTL in days
const keyv = new Keyv();

const TOKEN = process.env.TELEGRAM_TOKEN;
const disk = require('diskusage');

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(TOKEN, { polling: true });
const bot_timeout =  60 * 1000; // min

const user_allowed = ['vsul_ru', 'Amasing_Paprika'];
const btn_dl = '🌍 скачать',
    btn_cancel = '🚫 отмена',
    btn_list = '📋 список',
    btn_free_space = '📊 место на диске';

const commonOpts = {
    reply_markup: JSON.stringify({
        keyboard: [
            [btn_dl, btn_list],
            [btn_free_space, btn_cancel]
        ]
    })
};

// flags
let dlTimeout,
    readyForDownload = false;

// helpers
const callbackOnText = (msg, callback) => {
    if (user_allowed.includes(msg.from.username)) {
        callback(msg);
    } else {
        bot.sendMessage(msg.chat.id, '😰 я тебя не знаю и не собираюсь с тобой общаться');
    }
};

const reset = () => {
    clearTimeout(dlTimeout);
    readyForDownload = false;
};

const sleep = (msg) => {
    dlTimeout = setTimeout(() => {
        reset();
        bot.sendMessage(msg.chat.id, '😩 мне надоело ждать, пойду пока посплю...');
    }, bot_timeout);
};

const download = (msg) => {
    console.log(msg);

    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(msg);
        }, 3000);
    });

};

// event handlers
bot.onText(/\/start/, (msg) => {
    callbackOnText(msg, (msg) => {
        bot.sendMessage(msg.chat.id, '🙏 к вашим услугам', commonOpts);
    });
});

bot.onText(new RegExp(btn_dl), (msg) => {
    callbackOnText(msg, (msg) => {
        readyForDownload = true;
        bot.sendMessage(msg.chat.id, '😎 отлично, пришлите мне ссылку');

        sleep(msg);
    });
});

bot.onText(/^(https:\/\/rutracker.org|https:\/\/rutracker.net)/, (msg) => {
    callbackOnText(msg, (msg) => {
        clearTimeout(dlTimeout);

        const opts = {
            reply_to_message_id: msg.message_id,
            reply_markup: JSON.stringify({
                keyboard: [
                    [btn_dl, btn_list],
                    [btn_free_space, btn_cancel]
                ]
            })
        };

        if (readyForDownload) {
            bot.sendMessage(msg.chat.id, '✋ подождите, сейчас поставлю в очередь на скачивание');
            download(msg)
                .then(dlRes => {
                    bot.sendMessage(msg.chat.id, '👍 поставил на закачку. еще что-нибудь?', opts);
                });
        } else {
            bot.sendMessage(msg.chat.id, '😥 не понял задачу, давайте сначала', opts);
        }

        sleep(msg);
    });
});

bot.onText(new RegExp(btn_free_space), (msg) => {
    callbackOnText(msg, (msg) => {
        disk.check('/')
            .then(info => {
                bot.sendMessage(msg.chat.id, `📊 свободное место: ${(info.available / (1024 * 1024 * 1024)).toFixed(2).toString()} Gb`);
            })
            .catch(err => {
                console.error(err);
                bot.sendMessage(msg.chat.id, `😭 не могу посчитать свободное место`);
            })
    });
});

bot.onText(new RegExp(btn_cancel), (msg) => {
    callbackOnText(msg, (msg) => {
        reset();
        bot.sendMessage(msg.chat.id, '😴 если что, разбудите меня позже...');
    });
});
