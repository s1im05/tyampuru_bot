
const poll_up = '❤';
const poll_down = '✖';
const icon_globe = '🌍';
const last_id_file = 'last_id';
const chat_id = '@tyampuru';
const api_path = 'https://tyampuru.ru/api/post/';
const link_path = 'https://tyampuru.ru/post/';

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const POST_DELAY = process.env.POST_DELAY || 60;

const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
const fs = require('fs');
const options = {
    polling: true
};
const bot = new TelegramBot(TOKEN, options);

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
                    {text: `${poll_up} 0`, callback_data: JSON.stringify({'action': 'poll', 'vote': 'up', 'postId': data.id})},
                    {text: `${poll_down} 0`, callback_data: JSON.stringify({'action': 'poll', 'vote': 'down', 'postId': data.id})}
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

    if (data.action === 'poll') {
        (async () => {
            try {
                const reply = msg.reply_markup.inline_keyboard;
                const index = data.vote === 'up' ? 0 : 1;
                const vote = +reply[0][index].text.substr(2);
                reply[0][index].text = reply[0][index].text.substr(0, 2) + (vote+1);

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


