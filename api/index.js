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

// --- KEYBOARD DIPERBARUI ---
const mainMenuKeyboard = Markup.keyboard([
  ['⏳ Link To MP3', '🖼 Jpg To Png'],
  ['📂 Image to PDF'],
  ['📌 About', '💰 Donasi']
]).resize();

// Fungsi "Penjaga" utama kita
async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) {
    console.error("Gagal mengecek status member:", e.message);
    return false;
  }
}

// --- LOGIKA UTAMA BOT ---

bot.start(async (ctx) => {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (isSubscribed) {
        await ctx.reply('Halo! Saya adalah bot konversi. Silakan pilih menu di bawah.', mainMenuKeyboard);
    } else {
        await ctx.reply('Selamat datang! Untuk menggunakan bot ini, Anda harus bergabung ke channel kami terlebih dahulu.', joinChannelKeyboard);
    }
});

bot.action('check_join', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.deleteMessage();
    await ctx.reply('Terima kasih! Anda sekarang bisa menggunakan bot.', mainMenuKeyboard);
  } else {
    await ctx.answerCbQuery('Anda terdeteksi belum bergabung. Silakan bergabung terlebih dahulu.', { show_alert: true });
  }
});

// --- TOMBOL MENU UTAMA DENGAN PENJAGA ---
async function handleMenu(ctx, replyText) {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak. Anda harus menjadi anggota channel untuk menggunakan fitur ini.', joinChannelKeyboard);
    
    ctx.reply(replyText);
}

bot.hears('⏳ Link To MP3', (ctx) => handleMenu(ctx, 'Silakan kirimkan link video (YouTube, TikTok, FB) untuk diubah ke MP3.'));
bot.hears('🖼 Jpg To Png', (ctx) => handleMenu(ctx, 'Silakan kirimkan gambar/foto Anda (format JPG) untuk diubah ke PNG.'));
bot.hears('📂 Image to PDF', (ctx) => handleMenu(ctx, 'Silakan kirimkan gambar/foto Anda untuk diubah ke PDF.'));
bot.hears('📌 About', (ctx) => ctx.replyWithHTML(`Ini adalah bot konversi yang dibuat oleh :\n💬 <a href="https://t.me/BloggerManado">Zhigen</a>`));
bot.hears('💰 Donasi', (ctx) => ctx.replyWithHTML(`Anda bisa mendukung kami melalui 👇\n☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`));

// --- PENANGANAN FITUR INTI (DENGAN PENJAGA) ---

bot.on('photo', async (ctx) => {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak. Anda harus menjadi anggota channel untuk menggunakan fitur ini.', joinChannelKeyboard);
    
    let processingMessage = null;
    try {
        // Cek caption untuk menentukan tujuan konversi
        const caption = ctx.message.caption ? ctx.message.caption.toLowerCase() : '';

        if (caption.includes('pdf')) {
            // Konversi ke PDF
            processingMessage = await ctx.reply('📂 Gambar diterima, memproses menjadi PDF...');
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            const response = await axios({ url: fileLink.href, responseType: 'arraybuffer' });
            
            // Sharp bisa langsung output ke PDF
            const pdfBuffer = await sharp(response.data).toFormat('pdf').toBuffer();
            
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            await ctx.replyWithDocument({ source: pdfBuffer, filename: `converted_to_pdf.pdf` }, { caption: `Konversi ke PDF berhasil! ✨\n\nvia @${ctx.botInfo.username}` });

        } else {
            // Default: Konversi ke PNG
            processingMessage = await ctx.reply('🖼 Gambar diterima, memproses menjadi PNG...');
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileLink = await ctx.telegram.getFileLink(photo.file_id);
            const response = await axios({ url: fileLink.href, responseType: 'arraybuffer' });
            const pngBuffer = await sharp(response.data).png().toBuffer();
            
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            await ctx.replyWithDocument({ source: pngBuffer, filename: `converted_to_png.png` }, { caption: `Konversi ke PNG berhasil! ✨\n\nvia @${ctx.botInfo.username}` });
        }
        
    } catch (error) {
        console.error('Error konversi gambar:', error);
        if (processingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
        await ctx.reply('Maaf, terjadi kesalahan saat memproses gambar Anda.');
    }
});

bot.on('text', async (ctx) => {
    const urlRegex = /(http|https):\/\/[^\s$.?#].[^\s]*/i;
    const urlMatch = ctx.message.text.match(urlRegex);

    if (!urlMatch) return;

    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak. Anda harus menjadi anggota channel untuk menggunakan fitur ini.', joinChannelKeyboard);

    const userLink = urlMatch[0];
    let processingMessage = null;

    try {
        processingMessage = await ctx.reply('✅ Link diterima, sedang menghubungi server downloader...');
        const options = {
            method: 'POST',
            url: `https://${RAPIDAPI_HOST}/v1/social/autolink`,
            headers: { 'Content-Type': 'application/json', 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST },
            data: { url: userLink }
        };

        const response = await axios.request(options);
        const medias = response.data.medias;
        const audioMedia = medias.find(media => media.type === 'audio');

        if (audioMedia && audioMedia.url) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, '✅ Video ditemukan! Mengirimkan audio MP3...');
            await ctx.replyWithAudio({ url: audioMedia.url }, { caption: `Berhasil diunduh! ✨\n\nvia @${ctx.botInfo.username}`, title: audioMedia.title || 'audio.mp3' });
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Gagal menemukan audio dari link tersebut.');
        }
    } catch (error) {
        console.error('Error Detail:', error.response ? error.response.data : error.message);
        if (processingMessage) await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Maaf, terjadi kesalahan pada link Anda.');
        else await ctx.reply('Maaf, terjadi kesalahan pada link Anda.');
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
