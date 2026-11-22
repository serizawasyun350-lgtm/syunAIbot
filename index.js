const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const messages = require('./messages');

// Renderのスリープ防止・ポート監視用Webサーバー 兼 ステータス確認用ページ
const app = express();
const port = process.env.PORT || 3000;

// Bot全体の統計データを保持する変数
let stats = {
    totalSentMessages: 0,
    startTime: Date.now()
};

app.get('/', (req, res) => {
    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    
    res.send(`
        <html>
            <head><title>しゅんAIBOTステータス</title></head>
            <body style="font-family: sans-serif; padding: 20px; background: #1e1e1e; color: #fff;">
                <h1>🤖 しゅんAIBOT 稼働中だぜ☆</h1>
                <p><strong>稼働時間:</strong> ${Math.floor(uptimeSeconds / 60)} 分 (${uptimeSeconds} 秒)</p>
                <p><strong>総送信メッセージ数:</strong> ${stats.totalSentMessages} 件</p>
                <p><strong>RAM使用量 (RSS):</strong> ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>ヒープ使用量:</strong> ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB</p>
            </body>
        </html>
    `);
});

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

// チャンネルごとの設定 & Bot全体の設定（メンテナンスモードなど）
const channelSettings = new Map();
let botStatusMode = 'normal'; // 'normal' (通常), 'maintenance' (点検中), 'stopped' (停止中)

// スラッシュコマンドの定義（追加機能含む）
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
        .setDescription('このサーバーの自動返信チャンネルやPing、RAM使用量を確認しよー！'),
    new SlashCommandBuilder()
        .setName('botモード')
        .setDescription('Botの状態（通常・点検中・停止）を切り替えるぜ☆（管理者向け）')
        .addStringOption(option =>
            option.setName('モード')
                .setDescription('切り替えるモード')
                .setRequired(true)
                .addChoices(
                    { name: '通常 (normal)', value: 'normal' },
                    { name: '点検中 (maintenance)', value: 'maintenance' },
                    { name: '停止 (stopped)', value: 'stopped' }
                )
        )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`${client.user.tag} がスマホモードでログインしたぜ！`);
    console.log(`登録メッセージ総数: ${messages.length}個`);

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
        // RAM使用量計算 (MB)
        const memory = process.memoryUsage();
        const ramUsageMB = (memory.rss / 1024 / 1024).toFixed(2);
        const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(2);
        
        // 稼働時間計算
        const uptimeMin = Math.floor((Date.now() - stats.startTime) / 60000);

        const activeChannels = [];
        for (const [id, setting] of channelSettings.entries()) {
            if (setting.enabled && guild.channels.cache.has(id)) {
                activeChannels.push(`・<#${id}> （${setting.probability}%）`);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('📊 しゅんAIBOTのステータスだぜ☆')
            .addFields(
                { name: '🌐 Botモード', value: `\`${botStatusMode}\``, inline: true },
                { name: '📶 応答速度 (Ping)', value: `${client.ws.ping} ms`, inline: true },
                { name: '⏱️ 稼働時間', value: `${uptimeMin} 分`, inline: true },
                { name: '💻 RAM使用量 (RSS)', value: `${ramUsageMB} MB (Heap: ${heapMB}MB)`, inline: true },
                { name: '💬 総送信メッセージ数', value: `${stats.totalSentMessages} 件`, inline: true },
                { name: '📂 自動返信チャンネル数', value: `${activeChannels.length} 個`, inline: true },
                { name: '⚙️ 有効なチャンネル一覧', value: activeChannels.length > 0 ? activeChannels.join('\n') : 'なし（メンションで反応するよ）' }
            );

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'botモード') {
        const newMode = interaction.options.getString('モード');
        botStatusMode = newMode;
        
        let modeText = '通常モード';
        if (newMode === 'maintenance') modeText = '点検中モード（自動返信停止中）';
        if (newMode === 'stopped') modeText = '完全停止モード（すべて無視）';

        await interaction.reply(`⚙️ Botのモードを **${modeText}** に切り替えたぜ！`);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // 停止中または点検中の場合はメッセージに反応しない
    if (botStatusMode === 'stopped') return;
    if (botStatusMode === 'maintenance' && !message.mentions.has(client.user)) return;

    const isMentioned = message.mentions.has(client.user);
    const setting = channelSettings.get(message.channel.id);

    let shouldReply = false;

    if (isMentioned) {
        shouldReply = true;
    } else if (setting && setting.enabled) {
        const roll = Math.random() * 100;
        if (roll < setting.probability) {
            shouldReply = true;
        }
    }

    if (shouldReply) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        await message.reply(randomMsg);
        
        // 統計データのカウントアップ
        stats.totalSentMessages++;
    }
});

client.login(process.env.DISCORD_TOKEN);
