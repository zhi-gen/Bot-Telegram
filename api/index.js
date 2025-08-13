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

// --- KEYBOARD & FUNGSI BANTUAN ---
const joinChannelKeyboard = Markup.inlineKeyboard([
  [Markup.button.url(`➡️ Gabung Channel`, `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
  [Markup.button.callback(`✅ Saya Sudah Bergabung`, 'check_join')]
]);
const mainMenuKeyboard = Markup.keyboard([
  ['⏳ Link To MP3', '🖼 Jpg To Png'],
  ['📂 Image to PDF'],
  ['📌 About', '💰 Donasi']
]).resize();

async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) {
    console.error("Gagal mengecek status member:", e.message);
    return false;
  }
}

function getPdfBuffer(doc) {
    return new Promise((resolve, reject) => {
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
    });
}

// Fungsi untuk menunda eksekusi (menunggu proses konversi)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// --- LOGIKA UTAMA BOT ---
bot.start(async (ctx) => {
    userConversionMode.set(ctx.from.id, 'png');
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (isSubscribed) {
        await ctx.reply('Halo! Saya adalah bot konversi file. Silakan pilih menu di bawah.', mainMenuKeyboard);
    } else {
        await ctx.reply('Selamat datang! Untuk menggunakan bot ini, Anda harus bergabung ke channel kami terlebih dahulu.', joinChannelKeyboard);
    }
});

bot.action('check_join', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.deleteMessage();
    userConversionMode.set(ctx.from.id, 'png');
    await ctx.reply('Terima kasih! Anda sekarang bisa menggunakan bot.', mainMenuKeyboard);
  } else {
    await ctx.answerCbQuery('Anda terdeteksi belum bergabung.', { show_alert: true });
  }
});

async function handleMenu(ctx, mode, replyText) {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak...', joinChannelKeyboard);
    userConversionMode.set(ctx.from.id, mode);
    ctx.reply(replyText);
}

bot.hears('⏳ Link To MP3', (ctx) => handleMenu(ctx, 'mp3', 'Mode: Link ke MP3. Silakan kirimkan link YouTube.'));
bot.hears('🖼 Jpg To Png', (ctx) => handleMenu(ctx, 'png', 'Mode: Gambar ke PNG. Silakan kirimkan gambar/foto Anda.'));
bot.hears('📂 Image to PDF', (ctx) => handleMenu(ctx, 'pdf', 'Mode: Gambar ke PDF. Silakan kirimkan gambar/foto Anda.'));
bot.hears('📌 About', (ctx) => ctx.replyWithHTML(`Ini adalah bot konversi yang dibuat oleh admin ganteng dan tidak sombong 😁 :\n💬 <a href="https://t.me/BloggerManado">Zhigen</a>`));
bot.hears('💰 Donasi', (ctx) => ctx.replyWithHTML(`Anda bisa mendukung saya, agar bisa menambah fitur lainnya untuk kepentingan bersama melalui, klik👇\n☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`));

bot.on('photo', async (ctx) => {
    // Kode konversi gambar (tidak berubah)
});

// --- FITUR LINK DOWNLOADER DENGAN PERBAIKAN FINAL ---
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
        processingMessage = await ctx.reply('✅ Link diterima, memulai proses konversi di server eksternal...');

        // --- LANGKAH 1: MENDAPATKAN PROGRESS URL ---
        const initialOptions = {
            method: 'GET',
            url: `https://${RAPIDAPI_HOST}/api/v1/info`, // Menggunakan endpoint yang benar
            params: { url: userLink },
            headers: { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST }
        };

        const initialResponse = await axios.request(initialOptions);
        
        if (!initialResponse.data.progress_url) {
            throw new Error('Gagal mendapatkan progress URL dari API.');
        }

        const progressUrl = initialResponse.data.progress_url;
        await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, '⏳ Server sedang memproses video Anda... Mohon tunggu sekitar 10-20 detik.');

        // --- LANGKAH 2: MENUNGGU DAN MENGAMBIL LINK DOWNLOAD ---
        await sleep(15000); // Tunggu 15 detik untuk memberi waktu server mengonversi

        const finalResponse = await axios.get(progressUrl);

        // Mencari link download MP3 dari data progres
        const mp3LinkData = finalResponse.data.download_links.find(link => link.type === 'mp3');
        
        if (mp3LinkData && mp3LinkData.url) {
            const title = finalResponse.data.title || 'audio';
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, `✅ Konversi selesai! Mengirimkan MP3: "${title}"`);
            await ctx.replyWithAudio({ url: mp3LinkData.url, filename: `${title}.mp3` }, { caption: `Berhasil diunduh! ✨\n\nvia @${ctx.botInfo.username}` });
        } else {
            throw new Error('Tidak ditemukan link download MP3 setelah menunggu.');
        }

    } catch (error) {
        console.error('Error Detail:', error.response ? JSON.stringify(error.response.data) : error.message);
        if (processingMessage) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Maaf, terjadi kesalahan. API mungkin tidak mendukung link ini, sedang down, atau video terlalu panjang.');
        } else {
            await ctx.reply('Maaf, terjadi kesalahan pada link Anda.');
        }
    }
});

// Handler untuk Vercel
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).send('OK');
  }
};
