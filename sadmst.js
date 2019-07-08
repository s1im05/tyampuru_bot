
const icon_poll_up = '👍';
const icon_poll_down = '👎';

const chat_id = '@sadMoustache';

const IMG_DIR = process.env.IMG_DIR || './images';
const TOKEN = process.env.TELEGRAM_TOKEN;
const POST_DELAY = process.env.POST_DELAY || 1; // min
const KEY_VALUE_TTL = process.env.KEY_VALUE_TTL || 3 * 60; // min

const ACTION_POLL = 'poll';
const ACTION_POLL_UP = 'poll_up';
const ACTION_POLL_DOWN = 'poll_down';

const TelegramBot = require('node-telegram-bot-api');
const Keyv = require('keyv');
const fs = require('fs');


const keyv_ttl = KEY_VALUE_TTL * 60 * 1000; // KEY_VALUE_TTL in min
const options = {
    polling: true
};
const bot = new TelegramBot(TOKEN, options);
const keyv = new Keyv();

const getPost = () => {

    return new Promise((resolve, reject) => {
        fs.readdir(IMG_DIR, (err, res) => {
            if (err) {
                reject(err);
            }

            if (res && res.length) {
                const randomFile = res[Math.floor(Math.random() * res.length)];
                resolve(`${IMG_DIR}/${randomFile}`);
            } else {
                resolve(null);
            }

        });
    });
};

const doPoll = async (data, msg, from) => {

    const postKey = `post_${data.postId}`;
    const userVoteKey = `${postKey}_user_${from.id}`;

    let postVoteData = await keyv.get(postKey);
    if (!postVoteData) {
        const reply = msg.reply_markup.inline_keyboard;

        postVoteData = {
            voteUp: +reply[0][0].text.substr(2),
            voteDown: +reply[0][1].text.substr(2),
        };
    }

    const hasUserVote = await keyv.get(userVoteKey);
    if (!hasUserVote) {
        if (data.vote === ACTION_POLL_DOWN) {
            postVoteData.voteDown++;
        } else {
            postVoteData.voteUp++;
        }
        await keyv.set(userVoteKey, true, keyv_ttl);
    }
    await keyv.set(postKey, postVoteData, keyv_ttl);

    return postVoteData;
};

const sendNextPost = async () => {
    const postId = Date.now();

    let file;

    try {
        file = await getPost();
        if (file) {
            await bot.sendPhoto(chat_id, file, {
                reply_markup: {
                    inline_keyboard: [[
                        {text: `${icon_poll_up} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_UP, 'postId': postId})},
                        {text: `${icon_poll_down} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_DOWN, 'postId': postId})},
                    ]]
                }
            });
        }
    } catch (e) {
        // console.error(e);
    } finally {
        fs.unlinkSync(file);
    }
};

bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const data = JSON.parse(callbackQuery.data);
    const msg = callbackQuery.message;
    const from = callbackQuery.from;

    if (data.action === ACTION_POLL) {
        (async () => {

            const pollData = await doPoll(data, msg, from);

            try {
                const reply = msg.reply_markup.inline_keyboard;
                reply[0][0].text = `${icon_poll_up} ${pollData.voteUp}`;
                reply[0][1].text = `${icon_poll_down} ${pollData.voteDown}`;

                await bot.editMessageReplyMarkup({
                    inline_keyboard: [...reply]
                }, {
                    chat_id: chat_id,
                    message_id: msg.message_id
                });
            } catch (e) {
                // console.error(e);
            }
        })();
    }
});


sendNextPost()
    .then(() => {
        setInterval(() => {
            const promise = sendNextPost();
        }, POST_DELAY * 60 * 1000);
    });

