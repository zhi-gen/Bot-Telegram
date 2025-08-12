const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const CloudConvert = require('cloudconvert');

// --- KONFIGURASI PENTING ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;
const CLOUDCVRT_API_KEY = process.env.CLOUDCVRT_API_KEY; // API Key Baru!

// Cek semua variabel
if (!BOT_TOKEN || !CHANNEL_ID || !CHANNEL_USERNAME || !CLOUDCVRT_API_KEY) {
  console.error("Satu atau lebih Environment Variables belum diatur!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const cloudConvert = new CloudConvert(CLOUDCVRT_API_KEY);

// --- KEYBOARD & TOMBOL (Tidak berubah) ---
const joinChannelKeyboard = Markup.inlineKeyboard([
  [Markup.button.url(`➡️ Gabung Channel`, `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
  [Markup.button.callback(`✅ Saya Sudah Bergabung`, 'check_join')]
]);
const mainMenuKeyboard = Markup.keyboard([ ['⏳ Convert'], ['📌 About', '💰 Donasi'] ]).resize();
const convertMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📂 Video to Mp3 (Via Link)', 'info_videolink')],
  [Markup.button.callback('🖼 Jpg to Png (Via File)', 'info_jpgfile')]
]);

// --- FUNGSI BANTUAN (Tidak berubah) ---
async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) { return false; }
}

// --- LOGIKA UTAMA BOT ---

bot.start(async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.reply(`Halo ${ctx.from.first_name}! Selamat datang kembali.`, mainMenuKeyboard);
  } else {
    await ctx.reply(`Halo ${ctx.from.first_name}! Anda harus bergabung ke channel kami.`, joinChannelKeyboard);
  }
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

bot.hears('⏳ Convert', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.reply('Silakan pilih jenis konversi. Cukup kirimkan file (JPG) atau link video (YouTube, dll).', convertMenuKeyboard);
  } else {
    await ctx.reply('Akses ditolak. Gabung channel kami dulu ya.', joinChannelKeyboard);
  }
});

bot.hears('📌 About', (ctx) => ctx.replyWithHTML(`Ini adalah bot konversi file yang dibuat oleh :\n💬 <a href="https://t.me/BloggerManado">Zhigen</a>`));
bot.hears('💰 Donasi', (ctx) => ctx.replyWithHTML(`Anda bisa mendukung kami melalui 👇\n☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`));

// --- PENANGANAN FITUR ---

// Info tombol inline
bot.action('info_videolink', ctx => ctx.answerCbQuery('Kirimkan saja link video (misal dari YouTube) langsung ke chat ini.', { show_alert: true }));
bot.action('info_jpgfile', ctx => ctx.answerCbQuery('Kirimkan saja foto/gambar Anda langsung ke chat ini.', { show_alert: true }));


// Fitur JPG to PNG (Tidak berubah)
bot.on('photo', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (!isSubscribed) return ctx.reply('Fitur ini hanya untuk member channel.', joinChannelKeyboard);
  try {
    await ctx.reply('Gambar diterima, memproses menjadi PNG...');
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const response = await axios({ url: fileLink.href, responseType: 'arraybuffer' });
    const pngBuffer = await sharp(response.data).png().toBuffer();
    await ctx.replyWithDocument({ source: pngBuffer, filename: `converted.png` });
  } catch (error) {
    console.error('Error konversi JPG ke PNG:', error);
    await ctx.reply('Maaf, terjadi kesalahan saat memproses gambar.');
  }
});


// FITUR BARU: Konversi dari Link via CloudConvert
bot.on('text', async (ctx) => {
    // Cek apakah pesan merupakan URL
    const urlRegex = /(http|https|ftp|ftps):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?/;
    if (!urlRegex.test(ctx.message.text)) {
        // Abaikan jika bukan URL (kecuali perintah yg sudah ditangani 'hears')
        return;
    }

    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) return ctx.reply('Fitur ini hanya untuk member channel.', joinChannelKeyboard);

    const userLink = ctx.message.text;
    let processingMessage = null;

    try {
        // Kirim pesan tunggu
        processingMessage = await ctx.reply('✅ Link diterima, memulai proses konversi di server CloudConvert... Ini mungkin butuh beberapa menit, mohon bersabar 🙏');

        // Buat 'job' di CloudConvert
        let job = await cloudConvert.jobs.create({
            tasks: {
                'import-link': {
                    operation: 'import/url',
                    url: userLink
                },
                'convert-to-mp3': {
                    operation: 'convert',
                    input: 'import-link',
                    output_format: 'mp3',
                    engine: 'ffmpeg',
                    audio_bitrate: 128000
                },
                'export-mp3': {
                    operation: 'export/url',
                    input: 'convert-to-mp3',
                    inline: false,
                    archive_multiple_files: false
                }
            }
        });

        // Tunggu hingga job selesai
        job = await cloudConvert.jobs.wait(job.id);

        // Jika job berhasil, dapatkan link download MP3
        if (job.status === 'finished') {
            const file = cloudConvert.jobs.getExportUrls(job)[0];
            const finalFileName = file.filename || 'audio.mp3';

            // Hapus pesan "memproses..."
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
            
            // Kirim file audio
            await ctx.replyWithAudio(
                { url: file.url, filename: finalFileName },
                { caption: `Konversi selesai! ✨\n\nvia @${ctx.botInfo.username}`, title: finalFileName }
            );
        } else {
            throw new Error(`Job status: ${job.status}`);
        }

    } catch (error) {
        console.error('Error Konversi Link:', error);
        if (processingMessage) {
            await ctx.telegram.deleteMessage(ctx.chat.id, processingMessage.message_id);
        }
        await ctx.reply('Maaf, terjadi kesalahan saat mengonversi link Anda. Pastikan link valid dan publik.');
    }
});

// Handler untuk Vercel (Jangan diubah)
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).send('OK');
  }
};
