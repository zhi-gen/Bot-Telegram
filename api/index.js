const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');

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
const userConversionMode = new Map();

// --- KEYBOARD & FUNGSI BANTUAN (Tidak Berubah) ---
const joinChannelKeyboard = Markup.inlineKeyboard([
  [Markup.button.url(`➡️ Gabung Channel`, `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
  [Markup.button.callback(`✅ Saya Sudah Bergabung`, 'check_join')]
]);
const mainMenuKeyboard = Markup.keyboard([
  ['⏳ Link To MP3', '🖼 Jpg To Png'],
  ['📂 Image to PDF'],
  ['📌 About', '💰 Donasi']
]).resize();
async function isUserSubscribed(userId) { /* ... kode ... */ }
function getPdfBuffer(doc) { /* ... kode ... */ }
// ... (Semua kode 'hears' dan 'start' tidak berubah) ...


// --- PENANGANAN FITUR LINK DOWNLOADER (DENGAN PERBAIKAN) ---
bot.on('text', async (ctx) => {
    const urlRegex = /(http|https):\/\/[^\s$.?#].[^\s]*/i;
    const urlMatch = ctx.message.text.match(urlRegex);
    if (!urlMatch) return;
    const mode = userConversionMode.get(ctx.from.id);
    if (mode !== 'mp3') return;
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak...', joinChannelKeyboard);

    const userLink = urlMatch[0];
    let processingMessage = null;

    try {
        processingMessage = await ctx.reply('✅ Link diterima, memperbaiki alamat... Menghubungi server downloader...');

        // --- INI BAGIAN YANG DIPERBAIKI ---
        const options = {
            method: 'GET',
            // GANTI '/GANTI_DENGAN_PATH_YANG_BENAR' DENGAN ENDPOINT DARI RAPIDAPI
            url: `https://${RAPIDAPI_HOST}/GANTI_DENGAN_PATH_YANG_BENAR`,
            params: {
                url: userLink
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': RAPIDAPI_HOST
            }
        };

        const response = await axios.request(options);
        console.log('Struktur Respons API:', JSON.stringify(response.data, null, 2));

        // Logika untuk memproses respons (tidak berubah, mungkin perlu disesuaikan nanti)
        let audioLink = null;
        if (response.data.result && response.data.result.formats) {
            const audioFormats = response.data.result.formats.filter(f => f.audio_channels > 0 && f.video_channels === 0);
            if (audioFormats.length > 0) {
                 audioLink = audioFormats.sort((a, b) => (b.audio_bitrate || 0) - (a.audio_bitrate || 0))[0];
            }
        }

        if (audioLink && audioLink.url) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, '✅ Video ditemukan! Mengirimkan audio...');
            await ctx.replyWithAudio({ url: audioLink.url }, { caption: `Berhasil diunduh! ✨\n\nvia @${ctx.botInfo.username}` });
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Gagal menemukan format audio dari link tersebut.');
        }

    } catch (error) {
        console.error('Error Detail:', error.response ? JSON.stringify(error.response.data) : error.message);
        if (processingMessage) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Maaf, terjadi kesalahan pada link Anda.');
        } else {
            await ctx.reply('Maaf, terjadi kesalahan pada link Anda.');
        }
    }
});

// ... (Kode bot.on('photo') dan module.exports tidak berubah) ...
