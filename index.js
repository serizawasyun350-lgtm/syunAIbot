const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const messages = require('./messages');

// Renderのスリープ防止・ポート監視用Webサーバー
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('しゅんAIBOTは元気に稼働中だぜ☆'));
app.listen(port, () => console.log(`Webサーバー起動 (Port: ${port})`));

// オンラインマークを「スマホ（Discord Android）」にする設定
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    ws: {
        properties: {
            browser: 'Discord Android'
        }
    }
});

// チャンネルごとの設定保存（メモリ保存：再起動で初期値に戻ります）
// key: channelId, value: { enabled: boolean, probability: number }
const channelSettings = new Map();

// スラッシュコマンドの定義（画像の通りに設定）
const commands = [
    new SlashCommandBuilder()
        .setName('ここで話さない')
        .setDescription('このチャンネルを自動返信対象から外すんね'),
    new SlashCommandBuilder()
        .setName('ここで話す')
        .setDescription('このチャンネルをメンションなしで自動返信チャンネルにするぜ☆')
        .addIntegerOption(option =>
            option.setName('確率')
                .setDescription('反応確率（1〜100%、省略時は100%）')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('確率変えよー')
        .setDescription('このチャンネルのメンションなし反応確率を変更するぜ☆')
        .addIntegerOption(option =>
            option.setName('確率')
                .setDescription('新しい反応確率（1〜100%）')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('今どんなかんじ')
        .setDescription('このサーバーの自動返信チャンネルと反応確率を確認しよー！')
].map(cmd => cmd.toJSON());

// 起動時の処理とコマンド登録
client.once('ready', async () => {
    console.log(`${client.user.tag} がスマホモードでログインしたぜ！`);
    console.log(`登録メッセージ数: ${messages.length}個`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('スラッシュコマンドの登録完了！');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
});

// スラッシュコマンド実行時の処理
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, channelId, guild } = interaction;

    if (commandName === 'ここで話さない') {
        channelSettings.delete(channelId);
        await interaction.reply('了解！このチャンネルではもう勝手に話さないようにするんね〜');
    } 
    else if (commandName === 'ここで話す') {
        const prob = interaction.options.getInteger('確率') ?? 100;
        channelSettings.set(channelId, { enabled: true, probability: prob });
        await interaction.reply(`よっしゃ！このチャンネルでメンションなしでも自動返信するぜ☆（反応確率: **${prob}%**）`);
    } 
    else if (commandName === '確率変えよー') {
        const prob = interaction.options.getInteger('確率');
        const current = channelSettings.get(channelId);
        if (!current || !current.enabled) {
            channelSettings.set(channelId, { enabled: true, probability: prob });
            await interaction.reply(`自動返信ONにして、このチャンネルの反応確率を **${prob}%** に設定したぜ☆`);
        } else {
            current.probability = prob;
            channelSettings.set(channelId, current);
            await interaction.reply(`このチャンネルの反応確率を **${prob}%** に変更したぜ☆`);
        }
    } 
    else if (commandName === '今どんなかんじ') {
        const activeChannels = [];
        for (const [id, setting] of channelSettings.entries()) {
            if (setting.enabled && guild.channels.cache.has(id)) {
                activeChannels.push(`・<#${id}> ： 反応確率 **${setting.probability}%**`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('しゅんAIBOTの現在の設定だぜ☆')
            .setDescription(
                activeChannels.length > 0
                    ? activeChannels.join('\n')
                    : '今はこのサーバーで自動返信するチャンネルはないよ！（メンションされたら話すぜ）'
            );

        await interaction.reply({ embeds: [embed] });
    }
});

// メッセージ受信時の自動返信処理
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const isMentioned = message.mentions.has(client.user);
    const setting = channelSettings.get(message.channel.id);

    let shouldReply = false;

    if (isMentioned) {
        // メンションされた場合は必ず返信
        shouldReply = true;
    } else if (setting && setting.enabled) {
        // 自動返信チャンネルの場合、設定された確率で抽選
        const roll = Math.random() * 100;
        if (roll < setting.probability) {
            shouldReply = true;
        }
    }

    if (shouldReply) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        await message.reply(randomMsg);
    }
});

// Renderの環境変数からトークンを読み込んでログイン
client.login(process.env.DISCORD_TOKEN);
