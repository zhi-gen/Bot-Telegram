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
    if (!isSubscribed) return ctx.reply('Akses ditolak. Anda harus menjadi anggota channel untuk menggunakan fitur ini.', joinChannelKeyboard);
    userConversionMode.set(ctx.from.id, mode);
    ctx.reply(replyText);
}

bot.hears('⏳ Link To MP3', (ctx) => handleMenu(ctx, 'mp3', 'Mode: Link ke MP3. Silakan kirimkan link video.'));
bot.hears('🖼 Jpg To Png', (ctx) => handleMenu(ctx, 'png', 'Mode: Gambar ke PNG. Silakan kirimkan gambar/foto Anda.'));
bot.hears('📂 Image to PDF', (ctx) => handleMenu(ctx, 'pdf', 'Mode: Gambar ke PDF. Silakan kirimkan gambar/foto Anda.'));
bot.hears('📌 About', (ctx) => ctx.replyWithHTML(`Ini adalah bot konversi yang dibuat oleh admin ganteng dan tidak sombong 😁 :\n💬 <a href="https://t.me/BloggerManado">Zhigen</a>`));
bot.hears('💰 Donasi', (ctx) => ctx.replyWithHTML(`Anda bisa mendukung saya, agar bisa menambah fitur lainnya untuk kepentingan bersama melalui, klik👇\n☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`));

// --- PENANGANAN FITUR GAMBAR BERDASARKAN MODE ---
bot.on('photo', async (ctx) => {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Akses ditolak...', joinChannelKeyboard);
    
    const mode = userConversionMode.get(ctx.from.id) || 'png';
    let processingMessage = null;
    try {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        const imageBuffer = (await axios({ url: fileLink.href, responseType: 'arraybuffer' })).data;
        if (mode === 'pdf') {
            processingMessage = await ctx.reply('📂 Mode PDF aktif, memproses gambar...');
            const imageMetadata = await sharp(imageBuffer).metadata();
            const doc = new PDFDocument({ size: [imageMetadata.width, imageMetadata.height] });
            doc.image(imageBuffer, 0, 0, { width: imageMetadata.width, height: imageMetadata.height });
            doc.end();
            const pdfBuffer = await getPdfBuffer(doc);
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            await ctx.replyWithDocument({ source: pdfBuffer, filename: `converted.pdf` }, { caption: `Konversi ke PDF berhasil! ✨\n\nvia @${ctx.botInfo.username}` });
        } else {
            processingMessage = await ctx.reply('🖼 Mode PNG aktif, memproses gambar...');
            const pngBuffer = await sharp(imageBuffer).png().toBuffer();
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            await ctx.replyWithDocument({ source: pngBuffer, filename: `converted.png` }, { caption: `Konversi ke PNG berhasil! ✨\n\nvia @${ctx.botInfo.username}` });
        }
    } catch (error) {
        console.error('Error konversi gambar:', error);
        if (processingMessage) await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
        await ctx.reply('Maaf, terjadi kesalahan saat memproses gambar Anda.');
    }
});

// --- FITUR LINK DOWNLOADER ---
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
        processingMessage = await ctx.reply('✅ Link diterima, menghubungi server downloader...');
        
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
        const responseData = response.data;

        const videoTitle = responseData.title || 'audio';
        const medias = responseData.medias;
        const audioMedia = medias.find(media => media.type === 'audio');
        
        if (audioMedia && audioMedia.url) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, `✅ Info ditemukan! Mengirimkan MP3: "${videoTitle}"`);
            await ctx.replyWithAudio(
                { url: audioMedia.url, filename: `${videoTitle}.mp3` },
                { caption: `Berhasil diunduh! ✨\n\nvia @${ctx.botInfo.username}` }
            );
        } else {
            throw new Error('Gagal menemukan link audio dalam respons API.');
        }

    } catch (error) {
        console.error('Error Detail:', error.response ? JSON.stringify(error.response.data) : error.message);
        if (processingMessage) {
            await ctx.telegram.editMessageText(ctx.chat.id, processingMessage.message_id, null, 'Maaf, terjadi kesalahan pada link Anda. API mungkin tidak mendukung link ini atau sedang down.');
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
