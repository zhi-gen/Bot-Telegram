const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');

// --- KONFIGURASI PENTING ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME;

if (!BOT_TOKEN || !CHANNEL_ID || !CHANNEL_USERNAME) {
  console.error("Variabel lingkungan belum diatur!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- KEYBOARD & TOMBOL ---
const joinChannelKeyboard = Markup.inlineKeyboard([
  [Markup.button.url(`➡️ Gabung Channel`, `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
  [Markup.button.callback(`✅ Saya Sudah Bergabung`, 'check_join')]
]);

const mainMenuKeyboard = Markup.keyboard([
  ['⏳ Convert'],
  ['📌 About', '💰 Donasi']
]).resize();

const convertMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📂 Video to Mp3', 'video_to_mp3')],
  [Markup.button.callback('🖼 Jpg to Png', 'jpg_to_png')]
]);

// --- FUNGSI BANTUAN ---
async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) {
    return false;
  }
}

// --- LOGIKA BOT ---

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);
  if (isSubscribed) {
    await ctx.reply(`Halo ${ctx.from.first_name}! Selamat datang kembali.`, mainMenuKeyboard);
  } else {
    await ctx.reply(`Halo ${ctx.from.first_name}! Anda harus bergabung ke channel kami.`, joinChannelKeyboard);
  }
});

bot.action('check_join', async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);
  if (isSubscribed) {
    await ctx.deleteMessage();
    await ctx.reply('Terima kasih! Anda sekarang bisa menggunakan bot.', mainMenuKeyboard);
  } else {
    await ctx.answerCbQuery('Anda belum bergabung. Silakan bergabung terlebih dahulu.', { show_alert: true });
  }
});

bot.hears('⏳ Convert', async (ctx) => {
  const isSubscribed = await isUserSubscribed(ctx.from.id);
  if (isSubscribed) {
    await ctx.reply('Pilih jenis konversi. Untuk konversi, cukup kirimkan file Anda (JPG atau Video).', convertMenuKeyboard);
  } else {
    await ctx.reply('Akses ditolak. Gabung channel kami dulu ya.', joinChannelKeyboard);
  }
});

// --- PERUBAHAN MENU ABOUT & DONASI ---
// Menggunakan parse_mode: 'HTML' agar bisa menyisipkan link
bot.hears('📌 About', (ctx) => {
    const aboutText = `Ini adalah bot konversi file yang dibuat oleh :
💬 <a href="https://t.me/BloggerManado">Zhigen</a>`;
    ctx.replyWithHTML(aboutText);
});

bot.hears('💰 Donasi', (ctx) => {
    const donasiText = `Anda bisa mendukung kami melalui 👇
☕ <a href="https://saweria.co/Zhigen">Uang Kopi</a>`;
    ctx.replyWithHTML(donasiText);
});

// --- FITUR BARU: JPG to PNG ---
bot.on('photo', async (ctx) => {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) {
        return ctx.reply('Fitur ini hanya untuk member channel. Silakan join dulu.', joinChannelKeyboard);
    }
    
    try {
        await ctx.reply('Gambar diterima, sedang memproses menjadi PNG...');
        
        // Ambil foto dengan resolusi tertinggi
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileId = photo.file_id;
        
        // Dapatkan link download file dari Telegram
        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // Unduh gambar menggunakan axios
        const response = await axios({
            url: fileLink.href,
            responseType: 'arraybuffer'
        });
        const buffer = Buffer.from(response.data, 'binary');
        
        // Konversi gambar ke PNG menggunakan Sharp
        const pngBuffer = await sharp(buffer).png().toBuffer();
        
        // Kirim kembali sebagai dokumen untuk menjaga kualitas dan format
        await ctx.replyWithDocument({
            source: pngBuffer,
            filename: `converted_by_zhigenbot.png`
        });
        
    } catch (error) {
        console.error('Error konversi JPG ke PNG:', error);
        await ctx.reply('Maaf, terjadi kesalahan saat memproses gambar Anda.');
    }
});


// --- FITUR BARU: VIDEO to MP3 (SANGAT KOMPLEKS) ---
// Catatan: Konversi Video ke MP3 di Vercel sangat sulit karena butuh software FFmpeg.
// Untuk saat ini, kita buat bot merespons bahwa fitur sedang dikembangkan.
bot.on('video', async (ctx) => {
    const isSubscribed = await isUserSubscribed(ctx.from.id);
    if (!isSubscribed) {
        return ctx.reply('Fitur ini hanya untuk member channel. Silakan join dulu.', joinChannelKeyboard);
    }

    // Beri tahu user bahwa fitur sedang dikembangkan
    await ctx.reply('🎬 Video diterima! Mohon maaf, fitur konversi Video ke MP3 ini sangat kompleks dan masih dalam tahap pengembangan lebih lanjut. Terima kasih atas pengertiannya 😊');
    
    // Di masa depan, di sinilah logika download dan konversi video akan ditempatkan.
});


// Handler untuk Vercel (Jangan diubah)
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
  } finally {
    res.status(200).send('OK');
  }
};
