const { Telegraf, Markup } = require('telegraf');

// --- KONFIGURASI PENTING ---
// Ambil data dari Environment Variables di Vercel
const BOT_TOKEN = process.env.8109412047:AAEXkOiK0EVwR2wErEnEIQ2_twQIritF23s;
const CHANNEL_ID = process.env.-1002624070375; // ID Channel, contoh: -1001234567890
const CHANNEL_USERNAME = process.env.@channelpaoruus; // Username channel dengan '@', contoh: @infobotchannel

// Pastikan semua variabel ada
if (!BOT_TOKEN || !CHANNEL_ID || !CHANNEL_USERNAME) {
  console.error("Pastikan BOT_TOKEN, CHANNEL_ID, dan CHANNEL_USERNAME sudah diatur di Vercel!");
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
// Fungsi untuk mengecek apakah user adalah anggota channel
async function isUserSubscribed(userId) {
  try {
    const member = await bot.telegram.getChatMember(CHANNEL_ID, userId);
    // Status bisa 'creator', 'administrator', 'member', 'restricted', 'left', 'kicked'
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (e) {
    console.error("Gagal mengecek status member:", e);
    return false;
  }
}

// --- LOGIKA BOT ---

// Perintah /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);

  if (isSubscribed) {
    await ctx.reply(`Halo ${ctx.from.first_name}! Selamat datang kembali. Silakan pilih menu di bawah.`, mainMenuKeyboard);
  } else {
    await ctx.reply(
      `Halo ${ctx.from.first_name}!\n\nUntuk menggunakan bot ini, Anda harus bergabung ke channel kami terlebih dahulu.`,
      joinChannelKeyboard
    );
  }
});

// Menangani tombol "Saya Sudah Bergabung"
bot.action('check_join', async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);

  if (isSubscribed) {
    // Hapus pesan "gabung channel" dan tampilkan menu utama
    await ctx.deleteMessage();
    await ctx.reply('Terima kasih sudah bergabung! Sekarang Anda bisa menggunakan semua fitur.', mainMenuKeyboard);
  } else {
    // Beri peringatan jika belum bergabung
    await ctx.answerCbQuery('Anda belum bergabung ke channel. Silakan bergabung terlebih dahulu.', { show_alert: true });
  }
});

// Menangani menu '⏳ Convert'
bot.hears('⏳ Convert', async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);

  if (isSubscribed) {
    await ctx.reply('Silakan pilih jenis konversi:', convertMenuKeyboard);
  } else {
    await ctx.reply('Akses ditolak. Anda harus bergabung ke channel kami terlebih dahulu.', joinChannelKeyboard);
  }
});

// Menangani menu About dan Donasi
bot.hears('📌 About', (ctx) => ctx.reply('Ini adalah bot konversi file yang dibuat oleh [Nama Anda].'));
bot.hears('💰 Donasi', (ctx) => ctx.reply('Anda bisa mendukung kami melalui [Link Donasi Anda].'));


// Menangani tombol inline untuk konversi (FITUR DILINDUNGI)
const protectedActions = ['video_to_mp3', 'jpg_to_png'];
bot.action(protectedActions, async (ctx) => {
  const userId = ctx.from.id;
  const isSubscribed = await isUserSubscribed(userId);

  if (isSubscribed) {
    // Tampilkan pesan bahwa fitur sedang dikembangkan
    const action = ctx.callbackQuery.data;
    await ctx.answerCbQuery(); // Hentikan loading di tombol
    await ctx.reply(`Fitur "${action}" sedang dalam pengembangan. Coba lagi nanti ya!`);
  } else {
    await ctx.answerCbQuery('Akses ditolak! Silakan bergabung ke channel terlebih dahulu.', { show_alert: true });
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
