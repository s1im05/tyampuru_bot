
const icon_poll_up = '👍';
const icon_poll_down = '👎';

const chat_id = process.env.TELEGRAM_CHAT;

const TOKEN = process.env.TELEGRAM_TOKEN;
const POST_DELAY = process.env.POST_DELAY || 30; // min
const KEY_VALUE_TTL = process.env.KEY_VALUE_TTL || 24 * 60; // min

const ACTION_POLL = 'poll';
const ACTION_POLL_UP = 'poll_up';
const ACTION_POLL_DOWN = 'poll_down';

const TelegramBot = require('node-telegram-bot-api');
const Keyv = require('keyv');

const Parser = require('rss-parser');
const parser = new Parser();

const keyv_ttl = KEY_VALUE_TTL * 60 * 1000; // KEY_VALUE_TTL in min
const bot = new TelegramBot(TOKEN, { polling: true });
const keyv = new Keyv();

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

let isYoutube = false;

const getPostData = async () => {
    let itemToPost = null;
    const postedIds = await keyv.get('postedIds') || [];
    const feedURL = isYoutube ? 'https://www.youtube.com/feeds/videos.xml?channel_id=UCq7JZ8ATgQWeu6sDM1czjhg' : 'https://rss.stopgame.ru/rss_news.xml';

    const feed = await parser.parseURL(feedURL);

    feed.items.forEach((item) => {
        const id = item.guid || item.id;
        if (!postedIds.includes(id)) {
            itemToPost = {
                id: id,
                title: item.title,
                link: item.link,
                image: isYoutube ? null : item.enclosure.url
            };
        }
    });

    return itemToPost;
};

const sendNextPost = async () => {

    const itemToPost = await getPostData();
    const postId = itemToPost.id;

    try {
        if (postId && itemToPost) {

            const options = {
                reply_markup: {
                    inline_keyboard: [[
                        {text: `${icon_poll_up} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_UP, 'postId': postId})},
                        {text: `${icon_poll_down} 0`, callback_data: JSON.stringify({'action': ACTION_POLL, 'vote': ACTION_POLL_DOWN, 'postId': postId})},
                    ]]
                }
            };

            if (isYoutube) {
                await bot.sendMessage(chat_id, itemToPost.link, options);
            } else {
				options = {
					caption: `${itemToPost.title}\n\n${itemToPost.link}`
				};
                await bot.sendPhoto(chat_id, itemToPost.image, options);
            }

        }
    } catch (e) {
        console.error(e);
    } finally {
        const postedIds = await keyv.get('postedIds') || [];
        postedIds.push(postId);
        await keyv.set('postedIds', postedIds, keyv_ttl);

        isYoutube = !isYoutube;
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

bot.onText(/\/stopgame/, () => {
    sendNextPost();
});

setInterval(() => {
    const promise = sendNextPost();
}, POST_DELAY * 60 * 1000);

