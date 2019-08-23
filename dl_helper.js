const request = require('request');

const fs = require('fs');
const home_dir = process.env.HOME_DIR;

const KEY_VALUE_TTL = process.env.KEY_VALUE_TTL || 30; // days
const Keyv = require('keyv');
const keyv_ttl = KEY_VALUE_TTL * 24 * 60 * 60 * 1000; // KEY_VALUE_TTL in days
const keyv = new Keyv();

const Transmission = require('transmission-promise');
const transmission = new Transmission({
    host: process.env.RPC_HOST, // default 'localhost'
    port: process.env.RPC_PORT, // default 9091
    username: process.env.RPC_USER_LOGIN, // default blank
    password: process.env.RPC_USER_PASSWORD, // default blank
});

const TOKEN = process.env.TELEGRAM_TOKEN;

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(TOKEN, {polling: true});
const bot_timeout = 60 * 1000; // min

const user_allowed = ['vsul_ru', 'Amasing_Paprika'];
const btn_download = '🌍 скачать',
    btn_cancel = '🚫 отмена',
    btn_delete = '🚫 удалить',
    btn_list = '📋 список',
    btn_free_space = '📊 место на диске';

const ACTION = {
    DELETE: 'delete',
    DOWNLOAD: 'download',
};

const commonOpts = {
    reply_markup: JSON.stringify({
        keyboard: [
            [btn_download, btn_list],
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

const getMagnet = (link) => {
    return new Promise((resolve, reject) => {
        if (new RegExp('^magnet:','gi').test(link)) {
            resolve(link);
        } else {
            request(link, {}, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    const body = res.body;
                    const magnet = new RegExp('href=\"(magnet\:[^"]+)\"', "gi").exec(body);

                    resolve(magnet && magnet[1] ? magnet[1] : null);
                }
            });
        }
    });
};

// event handlers
bot.onText(/\/start/, (msg) => {
    callbackOnText(msg, (msg) => {
        bot.sendMessage(msg.chat.id, '🙏 к вашим услугам', commonOpts);
    });
});

bot.onText(new RegExp(btn_download), (msg) => {
    callbackOnText(msg, (msg) => {
        readyForDownload = true;
        bot.sendMessage(msg.chat.id, '😎 готов скачивать, пришлите мне ссылку');

        sleep(msg);
    });
});

bot.onText(/^(https:\/\/rutracker.org|https:\/\/rutracker.net|magnet:)/, (msg) => {
    callbackOnText(msg, (msg) => {
        clearTimeout(dlTimeout);

        const opts = {
            reply_to_message_id: msg.message_id,
            reply_markup: JSON.stringify({
                keyboard: [
                    [btn_download, btn_list],
                    [btn_free_space, btn_cancel]
                ]
            })
        };

        if (readyForDownload) {
            bot.sendMessage(msg.chat.id, '✋ подождите, сейчас поставлю в очередь на скачивание');
            (async () => {
                try {
                    const magnet = await getMagnet(msg.text);
                    const res = await transmission.addUrl(magnet, {
                        'download-dir': `${home_dir}/rsync/${msg.from.username}`
                    });

                    const keyv_id = `torrent_ids_${msg.from.id}`;
                    const ids = await keyv.get(keyv_id) || [];

                    if (!ids.includes(res.id)) {
                        await keyv.set(keyv_id, [...ids, res.id], keyv_ttl);

                        bot.sendMessage(msg.chat.id, `👍 поставил на закачку. еще что-нибудь?`, opts);
                    } else {
                        bot.sendMessage(msg.chat.id, `😩 этот торрент уже скачивается`, opts);
                    }

                } catch (e) {
                    bot.sendMessage(msg.chat.id, '😥 не смог найти magnet-ссылку по вашему адресу', opts);
                }
            })();
        } else {
            bot.sendMessage(msg.chat.id, '😥 не понял задачу, давайте сначала', opts);
        }

        sleep(msg);
    });
});

bot.onText(new RegExp(btn_free_space), (msg) => {

    callbackOnText(msg, async (msg) => {
        try {
            const res = await transmission.freeSpace('/');
            const size = (res['size-bytes'] / (1024 * 1024 * 1024)).toFixed(2);
            await bot.sendMessage(msg.chat.id, `📊 свободное место: ${size} Gb`);
        } catch (e) {
            console.error(err);
            await bot.sendMessage(msg.chat.id, `😭 не могу посчитать свободное место`);
        }
    });
});

bot.onText(new RegExp(btn_list), (msg) => {

    callbackOnText(msg, async (msg) => {

        const keyv_id = `torrent_ids_${msg.from.id}`;
        const ids = await keyv.get(keyv_id) || [];

        if (ids.length) {
            try {
                const res = await transmission.get(ids);
                const update_ids = [];

                if (res.torrents && res.torrents.length) {
                    for (let i = res.torrents.length; i--;) {
                        const torrent = res.torrents[i];
                        const opts = {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {text: btn_delete, callback_data: [ACTION.DELETE, torrent.id].join('_')},
                                    ]
                                ]
                            }
                        };

                        const index = res.torrents.length - i;
                        const progress = Math.round((torrent.haveValid / torrent.sizeWhenDone).toFixed(3) * 100);
                        await bot.sendMessage(msg.chat.id, `${index}. ${torrent.name}\nскачано: ${progress ? progress : 0}%`, opts);

                        update_ids.push(torrent.id);
                    }
                } else {
                    await bot.sendMessage(msg.chat.id, `😩 ваш список закачек пока пустой`);
                }

                await keyv.set(keyv_id, update_ids, keyv_ttl);
            } catch (err) {
                console.error(err);
                await bot.sendMessage(msg.chat.id, `😭 ошибка во время получения списка заказчек, попробуйте позже`);
            }
        } else {
            await bot.sendMessage(msg.chat.id, `😩 ваш список закачек пока пустой`);
        }
    });
});

bot.onText(new RegExp(btn_cancel), (msg) => {
    callbackOnText(msg, (msg) => {
        reset();
        bot.sendMessage(msg.chat.id, '😴 если что, разбудите меня позже...');
    });
});

// delete / download callback
bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data.split('_')[0];
    const torrent_id = +callbackQuery.data.split('_')[1];
    const msg = callbackQuery.message;
    const keyv_id = `torrent_ids_${msg.from.id}`;
    const ids = await keyv.get(keyv_id) || [];

    switch (action) {
        case ACTION.DELETE:
            await transmission.remove(torrent_id, true);
            await keyv.set(keyv_id, ids.filter(val => val !== torrent_id), keyv_ttl);
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            break;
        case ACTION.DOWNLOAD:
            break;
    }
});
