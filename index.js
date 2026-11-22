const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const express = require('express');
const messages = require('./messages');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

const ADMIN_PIN = '1472';

let stats = {
    totalSentMessages: 0,
    startTime: Date.now()
};

const channelSettings = new Map();
let botStatusMode = 'normal'; // 'normal' (通常), 'maintenance' (点検中), 'stopped' (停止中)

// UptimeRobotなどの監視ツール用
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

// Web管理パネル：ログイン画面（PIN入力）
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>しゅんAIBOT 管理パネルログイン</title>
            <style>
                body { font-family: sans-serif; background: #1e1e1e; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .box { background: #2c2f33; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.5); width: 300px; }
                input { padding: 12px; font-size: 18px; width: 80%; border-radius: 6px; border: none; text-align: center; margin-bottom: 15px; letter-spacing: 5px; }
                button { padding: 12px 24px; font-size: 16px; background: #00FF7F; color: #000; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; width: 90%; }
                button:hover { background: #00cc66; }
            </style>
        </head>
        <body>
            <div class="box">
                <h2>🔒 しゅんAIBOT<br>管理パネル</h2>
                <p style="font-size: 14px; color: #bbb;">4桁のPINコードを入力してね</p>
                <form action="/admin" method="POST">
                    <input type="password" name="pin" maxlength="4" placeholder="••••" required autofocus><br>
                    <button type="submit">ログイン</button>
                </form>
            </div>
        </body>
        </html>
    `);
});

// Web管理パネル本体
app.post('/admin', (req, res) => {
    const { pin, newMode } = req.body;

    if (pin !== ADMIN_PIN) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head><meta charset="UTF-8"><title>エラー</title></head>
            <body style="font-family: sans-serif; background: #1e1e1e; color: #ff5555; text-align: center; padding-top: 100px;">
                <h1>❌ PINコードが違います！</h1>
                <a href="/" style="color: #00FF7F; font-size: 18px;">ログイン画面に戻る</a>
            </body>
            </html>
        `);
    }

    if (newMode && ['normal', 'maintenance', 'stopped'].includes(newMode)) {
        botStatusMode = newMode;
    }

    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    const ping = client.ws ? client.ws.ping : 0;

    let modeLabel = '🟢 通常稼働中 (normal)';
    if (botStatusMode === 'maintenance') modeLabel = '🟡 点検中 (maintenance)';
    if (botStatusMode === 'stopped') modeLabel = '🔴 完全停止中 (stopped)';

    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>しゅんAIBOT 管理パネル</title>
            <style>
                body { font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 20px; max-width: 600px; margin: 0 auto; }
                .card { background: #2c2f33; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
                h1 { color: #00FF7F; font-size: 24px; }
                .stat { font-size: 16px; margin: 10px 0; border-bottom: 1px solid #444; padding-bottom: 8px; }
                .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
                button { padding: 10px 15px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; flex: 1; }
                .btn-normal { background: #00FF7F; color: #000; }
                .btn-maint { background: #FFD700; color: #000; }
                .btn-stop { background: #FF4500; color: #fff; }
                .btn-reload { background: #5865F2; color: #fff; width: 100%; margin-top: 10px; }
            </style>
        </head>
        <body>
            <h1>🤖 しゅんAIBOT 管理パネル</h1>
            
            <div class="card">
                <h3>📊 現在のステータス</h3>
                <div class="stat"><strong>現在のモード:</strong> ${modeLabel}</div>
                <div class="stat"><strong>応答速度 (Ping):</strong> ${ping} ms</div>
                <div class="stat"><strong>稼働時間:</strong> ${Math.floor(uptimeSeconds / 60)} 分 (${uptimeSeconds} 秒)</div>
                <div class="stat"><strong>総送信メッセージ数:</strong> ${stats.totalSentMessages} 件</div>
                <div class="stat"><strong>RAM使用量 (RSS):</strong> ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB</div>
                <div class="stat"><strong>ヒープ使用量:</strong> ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB</div>
                <div class="stat"><strong>自動返信ONのチャンネル数:</strong> ${channelSettings.size} 個</div>
                
                <form action="/admin" method="POST">
                    <input type="hidden" name="pin" value="${ADMIN_PIN}">
                    <button type="submit" class="btn-reload">🔄 ステータスを最新に更新</button>
                </form>
            </div>

            <div class="card">
                <h3>⚙️ Botモード遠隔切り替え</h3>
                <p style="font-size: 13px; color: #ccc;">ここから直接Botの状態を切り替えられます</p>
                <div class="btn-group">
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newMode" value="normal">
                        <button type="submit" class="btn-normal">🟢 通常にする</button>
                    </form>
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newMode" value="maintenance">
                        <button type="submit" class="btn-maint">🟡 点検中にする</button>
                    </form>
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newMode" value="stopped">
                        <button type="submit" class="btn-stop">🔴 停止にする</button>
                    </form>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="/" style="color: #aaa; font-size: 14px;">ログアウト（PIN入力画面へ）</a>
            </div>
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
        const memory = process.memoryUsage();
        const ramUsageMB = (memory.rss / 1024 / 1024).toFixed(2);
        const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(2);
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

    // 停止中の場合はすべて無視
    if (botStatusMode === 'stopped') return;

    // メンションされたか判定
    const isMentioned = message.mentions.has(client.user);

    // Botのメッセージに対する「返信（リプライ）」か判定
    let isReplyToBot = false;
    if (message.reference && message.reference.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                isReplyToBot = true;
            }
        } catch (err) {
            // 元メッセージが削除されている場合などは無視
        }
    }

    // 点検中の場合は、メンションかBotへの返信のみ応答
    if (botStatusMode === 'maintenance' && !isMentioned && !isReplyToBot) return;

    const setting = channelSettings.get(message.channel.id);
    let shouldReply = false;

    if (isMentioned || isReplyToBot) {
        // メンションされた場合、またはBotに返信した場合は必ず応答
        shouldReply = true;
    } else if (setting && setting.enabled) {
        // 自動返信チャンネルの場合、確率で抽選
        const roll = Math.random() * 100;
        if (roll < setting.probability) {
            shouldReply = true;
        }
    }

    if (shouldReply) {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        await message.reply(randomMsg);
        stats.totalSentMessages++;
    }
});

client.login(process.env.DISCORD_TOKEN);
