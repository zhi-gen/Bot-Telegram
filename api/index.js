const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');

// --- KONFIGURASI PENTING ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;

if (!BOT_TOKEN || !CHANNEL_ID || !CHANNEL_USERNAME || !RAPIDAPI_KEY || !RAPIDAPI_HOST) {
  console.error("Satu atau lebih Environment Variables belum diatur!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- KEYBOARD & FUNGSI BANTUAN ---
const joinChannelKeyboard = Markup.inlineKeyboard([
  [Markup.button.url(`➡️ Gabung Channel`, `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
  [Markup.button.callback(`✅ Saya Sudah Bergabung`, 'check_join')]
]);
const mainMenuKeyboard = Markup.keyboard([ ['⏳ Convert'], ['📌 About', '💰 Donasi'] ]).resize();

async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) { return false; }
}

// --- LOGIKA UTAMA BOT ---

bot.start(async (ctx) => {
    await ctx.reply('Halo! Saya adalah bot pengunduh video dari YouTube, TikTok, dan Facebook. Kirimkan saja linknya, dan saya akan mengubahnya menjadi MP3. Pastikan Anda sudah bergabung ke channel kami ya!', mainMenuKeyboard);
});

bot.action('check_join', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.deleteMessage();
    await ctx.reply('Terima kasih! Anda sekarang bisa menggunakan bot.', mainMenuKeyboard);
  } else {
    await ctx.answerCbQuery('Anda belum bergabung.', { show_alert: true });
  }
});

bot.hears('⏳ Convert', (ctx) => ctx.reply('Silakan kirimkan link dari YouTube, TikTok, atau Facebook.'));
bot.hears('📌 About', (ctx) => ctx.replyWithHTML(`Ini adalah bot konversi file yang dibuat oleh :\n💬 <a href="https://t.me/BloggerManado">Zhigen</a>`));
bot.hears('💰 Donasi', (ctx) => ctx.replyWithHTML(`Anda bisa mendukung kami melalui 👇\n☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`));

// --- PENANGANAN FITUR UTAMA: LINK DOWNLOADER ---
bot.on('text', async (ctx) => {
    const urlRegex = /(http|https):\/\/[^\s$.?#].[^\s]*/i;
    const urlMatch = ctx.message.text.match(urlRegex);

    if (!urlMatch) return;

    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Fitur ini hanya untuk member channel.', joinChannelKeyboard);

    const userLink = urlMatch[0];
    let processingMessage = null;

    try {
        processingMessage = await ctx.reply('✅ Link diterima, sedang menghubungi server downloader... Mohon tunggu sebentar.');

        const options = {
            method: 'POST',
            url: `https://${RAPIDAPI_HOST}/v1/social/autolink`,
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST
            },
            data: {
                url: userLink
            }
        };

        const response = await axios.request(options);
        
        console.log('Struktur Respons API:', JSON.stringify(response.data, null, 2));

        const medias = response.data.medias;
        const audioMedia = medias.find(media => media.type === 'audio');

        if (audioMedia && audioMedia.url) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, '✅ Video ditemukan! Mengirimkan audio MP3...');
            
            await ctx.replyWithAudio(
                { url: audioMedia.url },
                { caption: `Berhasil diunduh! ✨\n\nvia @${ctx.botInfo.username}`, title: audioMedia.title || 'audio.mp3' }
            );
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Gagal menemukan audio dari link tersebut. Mungkin video ini tidak memiliki suara atau tidak didukung.');
        }

    } catch (error) {
        console.error('Error Detail:', error.response ? error.response.data : error.message);
        if (processingMessage) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Maaf, terjadi kesalahan. Pastikan link Anda benar dan publik, atau coba lagi nanti.');
        } else {
            await ctx.reply('Maaf, terjadi kesalahan. Pastikan link Anda benar dan publik.');
        }
    }
});

// --- BAGIAN YANG DIPERBAIKI ---
// Handler untuk Vercel
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).send('OK');
  }
};
