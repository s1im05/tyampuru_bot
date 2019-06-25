
const icon_poll_up = '❤';
const icon_poll_down = '✖';
const icon_globe = '🌍';
const last_id_file = 'last_id';
const chat_id = '@tyampuru';
const api_path = 'https://tyampuru.ru/api/post/';
const link_path = 'https://tyampuru.ru/post/';

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const POST_DELAY = process.env.POST_DELAY || 60;

const ACTION_POLL = 'poll';
const ACTION_POLL_UP = 'poll_up';
const ACTION_POLL_DOWN = 'poll_down';

const TelegramBot = require('node-telegram-bot-api');
const Keyv = require('keyv');
const request = require('request');
const fs = require('fs');

const keyv_ttl = 60 * 60 * 1000; // 1 hour
const options = {
    polling: true
};
const bot = new TelegramBot(TOKEN, options);
const keyv = new Keyv();

const getPost = (postId) => {
    return new Promise((resolve, reject) => {
        const url = `${api_path}${postId}`;

        request.get(url, (err, res, body) => {
            if (err) {
                reject(err);
            }

            const data = JSON.parse(body);

            if (data.image) {
                resolve(data);
                fs.writeFileSync(last_id_file, data.id);
            } else {
                // recursive call
                (async () => {
                    try {
                        resolve(await getPost(+data.id + 1));
                    } catch (e) {
                        reject(e);
                    }
                })();
            }
        });
    });
};

const doPoll = async (data, msg) => {

    const postKey = `post_${data.postId}`;
    const userVoteKey = `${postKey}_user_${msg.chat.id}`;

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
        if (data.vote === ACTION_POLL_UP) {
            postVoteData.voteUp++;
        } else {
            postVoteData.voteDown++;
        }
        await keyv.set(userVoteKey, true, keyv_ttl);
    }
    await keyv.set(postKey, postVoteData, keyv_ttl);

    return postVoteData;
};

const sendNextPost = () => {

    let lastId = 0;
    try {
        lastId = +fs.readFileSync(last_id_file);
    } catch (e) {
        console.error(last_id_file, 'not exists');
    }

    return getPost(++lastId).then(data => {

        let caption = data.title;
        if (data.tags) {
            caption += `\n\n${data.tags}`;
        }

        return bot.sendPhoto(chat_id, data.image, {
            reply_markup: {
                inline_keyboard: [[
                    {text: `${icon_poll_up} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_UP, 'postId': data.id})},
                    {text: `${icon_poll_down} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_DOWN, 'postId': data.id})}
                ], [
                    {text: `${icon_globe} ссылка`, url: `${link_path}${data.id}`}
                ]]
            },
            caption: caption
        });
    });
};

bot.on('callback_query', function onCallbackQuery(callbackQuery) {
    const data = JSON.parse(callbackQuery.data);
    const msg = callbackQuery.message;

    if (data.action === ACTION_POLL) {
        (async () => {

            const pollData = await doPoll(data, msg);

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


