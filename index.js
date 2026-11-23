const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));

const ADMIN_PIN = '1472';

// 統計データ管理
let stats = {
    totalSentMessages: 0,
    totalReceivedMessages: 0,
    totalCommandsExecuted: 0,
    totalAuthCount: 0,
    startTime: Date.now()
};

const channelSettings = new Map();
let currentActivityText = 'Geminiとおしゃべり中☆';
let currentOnlineStatus = 'online';

// リアルタイムコンソールログ
const consoleLogs = [];
const originalLog = console.log;
const originalError = console.error;

function captureLog(type, args) {
    const time = new Date().toLocaleTimeString('ja-JP');
    const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    consoleLogs.unshift(`[${time}] [${type}] ${text}`);
    if (consoleLogs.length > 100) consoleLogs.pop();
}

console.log = (...args) => {
    originalLog(...args);
    captureLog('INFO', args);
};

console.error = (...args) => {
    originalError(...args);
    captureLog('ERROR', args);
};

// Google Gemini APIクライアント初期化
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// UptimeRobot用
app.get('/ping', (req, res) => {
    res.status(200).send('OK');
});

// 統計API
app.get('/api/stats', (req, res) => {
    if (req.query.pin !== ADMIN_PIN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const ping = client.ws ? client.ws.ping : 0;
    const guildCount = client.guilds ? client.guilds.cache.size : 0;
    const userCount = client.guilds
        ? client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0)
        : 0;

    const statusNameMap = {
        online: '🟢 オンライン',
        idle: '🌙 退席中',
        dnd: '⛔ 取り込み中',
        invisible: '⚫ オフライン表示'
    };

    res.json({
        onlineStatusLabel: statusNameMap[currentOnlineStatus] || '🟢 オンライン',
        activityText: currentActivityText,
        ping,
        uptimeText: `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`,
        totalSentMessages: stats.totalSentMessages,
        totalReceivedMessages: stats.totalReceivedMessages,
        totalCommandsExecuted: stats.totalCommandsExecuted,
        totalAuthCount: stats.totalAuthCount,
        commandCount: commands.length,
        guildCount,
        userCount,
        rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        activeChannelsCount: channelSettings.size,
        logs: consoleLogs.slice(0, 30).join('\n')
    });
});

// ログイン画面
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

// 管理パネル本体
app.post('/admin', (req, res) => {
    const { pin, newActivity, newOnlineStatus } = req.body;

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

    if (newActivity && newActivity.trim().length > 0) {
        currentActivityText = newActivity.trim();
    }
    if (newOnlineStatus && ['online', 'idle', 'dnd', 'invisible'].includes(newOnlineStatus)) {
        currentOnlineStatus = newOnlineStatus;
    }

    if (client.user) {
        client.user.setPresence({
            activities: [{ name: currentActivityText, type: ActivityType.Playing }],
            status: currentOnlineStatus
        });
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>しゅんAIBOT 管理パネル</title>
            <style>
                body { font-family: sans-serif; background: #1e1e1e; color: #fff; padding: 20px; max-width: 750px; margin: 0 auto; }
                .card { background: #2c2f33; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
                h1 { color: #00FF7F; font-size: 22px; display: flex; align-items: center; justify-content: space-between; }
                h3 { margin-top: 0; color: #00FF7F; border-bottom: 1px solid #444; padding-bottom: 8px; }
                .live-badge { font-size: 12px; background: #00FF7F; color: #000; padding: 4px 8px; border-radius: 12px; font-weight: bold; }
                .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
                .stat { font-size: 14px; background: #23272a; padding: 10px; border-radius: 6px; }
                .stat strong { color: #aaa; display: block; font-size: 12px; margin-bottom: 3px; }
                .stat span { font-size: 15px; font-weight: bold; color: #fff; }
                .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
                button { padding: 10px 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; flex: 1; }
                input[type="text"] { padding: 10px; border-radius: 6px; border: none; width: 65%; font-size: 14px; }
                .btn-normal { background: #00FF7F; color: #000; }
                .btn-maint { background: #FFD700; color: #000; }
                .btn-stop { background: #FF4500; color: #fff; }
                .btn-blue { background: #5865F2; color: #fff; }
                .console-box { background: #000; color: #00FF7F; font-family: monospace; padding: 12px; border-radius: 6px; height: 180px; overflow-y: scroll; font-size: 12px; white-space: pre-wrap; }
            </style>
        </head>
        <body>
            <h1>
                <span>🤖 しゅんAIBOT 管理パネル</span>
                <span class="live-badge">⚡ 1秒自動更新中</span>
            </h1>
            
            <div class="card">
                <h3>📊 基本ステータス</h3>
                <div class="grid">
                    <div class="stat"><strong>オンライン状態</strong><span id="onlineStatusLabel">読込中...</span></div>
                    <div class="stat"><strong>表示ステータス</strong><span id="activityText">読込中...</span></div>
                    <div class="stat"><strong>応答速度 (Ping)</strong><span><span id="ping">0</span> ms</span></div>
                    <div class="stat"><strong>連続稼働時間</strong><span id="uptimeText">読込中...</span></div>
                    <div class="stat"><strong>導入サーバー / 総ユーザー</strong><span><span id="guildCount">0</span> 鯖 / <span id="userCount">0</span> 人</span></div>
                    <div class="stat"><strong>総送信メッセージ数</strong><span><span id="totalSentMessages">0</span> 件</span></div>
                </div>
            </div>

            <div class="card">
                <h3>💻 リアルタイムコンソールログ</h3>
                <div id="logs" class="console-box">ログを読み込んでいます...</div>
            </div>

            <div class="card">
                <h3>🎮 ステータス・オンライン状態変更</h3>
                <form action="/admin" method="POST" style="display:flex; gap:8px; margin-bottom:12px;">
                    <input type="hidden" name="pin" value="${ADMIN_PIN}">
                    <input type="text" name="newActivity" placeholder="新しいステータス文字を入力" required>
                    <button type="submit" class="btn-blue">文字変更</button>
                </form>

                <div class="btn-group">
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newOnlineStatus" value="online">
                        <button type="submit" class="btn-normal">🟢 オンライン</button>
                    </form>
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newOnlineStatus" value="idle">
                        <button type="submit" class="btn-maint">🌙 退席中</button>
                    </form>
                    <form action="/admin" method="POST" style="flex:1;">
                        <input type="hidden" name="pin" value="${ADMIN_PIN}">
                        <input type="hidden" name="newOnlineStatus" value="dnd">
                        <button type="submit" class="btn-stop">⛔ 取り込み中</button>
                    </form>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="/" style="color: #aaa; font-size: 14px;">ログアウト（PIN入力画面へ）</a>
            </div>

            <script>
                async function updateStats() {
                    try {
                        const res = await fetch('/api/stats?pin=${ADMIN_PIN}');
                        if (!res.ok) return;
                        const data = await res.json();
                        
                        for (const key in data) {
                            const el = document.getElementById(key);
                            if (el && key !== 'logs') el.textContent = data[key];
                        }
                        const logBox = document.getElementById('logs');
                        if (logBox && data.logs) {
                            logBox.textContent = data.logs;
                        }
                    } catch (e) {
                        console.error('更新エラー:', e);
                    }
                }
                updateStats();
                setInterval(updateStats, 1000);
            </script>
        </body>
        </html>
    `);
});

app.listen(port, () => console.log(`Webサーバー起動 (Port: ${port})`));

// Discordクライアント設定
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

// スラッシュコマンド定義
const commands = [
    new SlashCommandBuilder()
        .setName('ここで話さない')
        .setDescription('このチャンネルを自動返信対象から外すんね'),
    new SlashCommandBuilder()
        .setName('ここで話す')
        .setDescription('指定したチャンネルで自動返信するぜ☆')
        .addBooleanOption(option =>
            option.setName('メンションなし')
                .setDescription('メンションしなくても自動返信するかどうか (true/false)')
                .setRequired(false)
        )
        .addChannelOption(option =>
            option.setName('チャンネル')
                .setDescription('対象のチャンネル（省略した場合は今のチャンネル）')
                .setRequired(false)
        )
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
        .setDescription('このサーバーの自動返信チャンネルや詳細なステータスを確認しよー！'),
    new SlashCommandBuilder()
        .setName('ステータス')
        .setDescription('Botのプロフィール表示（プレイ中やオンライン状態）を変更するぜ☆')
        .addStringOption(option =>
            option.setName('内容')
                .setDescription('表示したいステータスの文字')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('種類')
                .setDescription('ステータスの種類（省略時は「プレイ中」）')
                .setRequired(false)
                .addChoices(
                    { name: '〜をプレイ中', value: 'Playing' },
                    { name: '〜を視聴中', value: 'Watching' },
                    { name: '〜を再生中', value: 'Listening' },
                    { name: '〜に参戦中', value: 'Competing' },
                    { name: 'カスタムステータス', value: 'Custom' }
                )
        )
        .addStringOption(option =>
            option.setName('オンライン状態')
                .setDescription('オンラインマークの色（省略時は変更なし）')
                .setRequired(false)
                .addChoices(
                    { name: '🟢 オンライン', value: 'online' },
                    { name: '🌙 退席中', value: 'idle' },
                    { name: '⛔ 取り込み中', value: 'dnd' },
                    { name: '⚫ オフライン表示', value: 'invisible' }
                )
        )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`${client.user.tag} がスマホモードでログインしたぜ！`);

    client.user.setPresence({
        activities: [{ name: currentActivityText, type: ActivityType.Playing }],
        status: currentOnlineStatus
    });

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

client.on('guildCreate', guild => {
    stats.totalAuthCount++;
    console.log(`新しいサーバーに導入されました: ${guild.name}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    stats.totalCommandsExecuted++;
    const { commandName, channelId } = interaction;

    if (commandName === 'ここで話さない') {
        channelSettings.delete(channelId);
        await interaction.reply('了解！このチャンネルではもう勝手に話さないようにするんね〜');
    } 
    else if (commandName === 'ここで話す') {
        const targetChannel = interaction.options.getChannel('チャンネル') || interaction.channel;
        const noMention = interaction.options.getBoolean('メンションなし') ?? true;
        const prob = interaction.options.getInteger('確率') ?? 100;

        channelSettings.set(targetChannel.id, { 
            enabled: noMention, 
            probability: prob 
        });

        await interaction.reply(`よっしゃ！ <#${targetChannel.id}> で自動返信を設定したぜ☆（メンションなし反応: **${noMention ? 'ON' : 'OFF'}** / 反応確率: **${prob}%**）`);
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
        const uptimeSec = Math.floor((Date.now() - stats.startTime) / 1000);
        const hours = Math.floor(uptimeSec / 3600);
        const mins = Math.floor((uptimeSec % 3600) / 60);

        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);

        const embed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('📊 しゅんAIBOTのステータスだぜ☆')
            .addFields(
                { name: '📶 応答速度 (Ping)', value: `${client.ws.ping} ms`, inline: true },
                { name: '⏱️ 連続稼働時間', value: `${hours}時間 ${mins}分`, inline: true },
                { name: '🏰 導入サーバー数', value: `${guildCount} サーバー`, inline: true },
                { name: '👥 合計ユーザー数', value: `${userCount} 人`, inline: true },
                { name: '💬 総送信数', value: `${stats.totalSentMessages} 件`, inline: true },
                { name: '🤖 AIエンジン', value: 'Google Gemini API', inline: true },
                { name: '🎮 表示ステータス', value: `\`${currentActivityText}\``, inline: false }
            );

        await interaction.reply({ embeds: [embed] });
    }
    else if (commandName === 'ステータス') {
        const text = interaction.options.getString('内容');
        const typeStr = interaction.options.getString('種類') || 'Playing';
        const onlineOpt = interaction.options.getString('オンライン状態');

        const typeMap = {
            'Playing': ActivityType.Playing,
            'Watching': ActivityType.Watching,
            'Listening': ActivityType.Listening,
            'Competing': ActivityType.Competing,
            'Custom': ActivityType.Custom
        };

        currentActivityText = text;
        if (onlineOpt) {
            currentOnlineStatus = onlineOpt;
        }

        client.user.setPresence({
            activities: [{ name: text, type: typeMap[typeStr] }],
            status: currentOnlineStatus
        });

        await interaction.reply(`🎮 ステータスを **「${text}」** に変更したぜ☆`);
    }
});

// Gemini APIを使って返信を生成する関数（@google/generative-ai 対応）
async function getGeminiReply(userMessage) {
    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: 'あなたは「しゅんAIBOT」という名前の明るくフレンドリーなDiscordボットです。口調は「〜だぜ☆」「〜だよ！」など元気で親しみやすく、ちくわが大好きです。回答は短く簡潔に、Discordのチャットらしく返してください。'
        });

        const result = await model.generateContent(userMessage);
        const response = await result.response;
        return response.text() ? response.text().trim() : 'あれ、うまく言葉が出てこないや…！';
    } catch (error) {
        console.error('Gemini APIエラー:', error);
        return 'うーん、ちょっと頭がボーッとしちゃった☆（APIエラー）';
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    stats.totalReceivedMessages++;

    const isMentioned = message.mentions.has(client.user);

    let isReplyToBot = false;
    if (message.reference && message.reference.messageId) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            if (repliedMessage.author.id === client.user.id) {
                isReplyToBot = true;
            }
        } catch (err) {}
    }

    const setting = channelSettings.get(message.channel.id);
    let shouldReply = false;

    if (isMentioned || isReplyToBot) {
        shouldReply = true;
    } else if (setting && setting.enabled) {
        const roll = Math.random() * 100;
        if (roll < setting.probability) {
            shouldReply = true;
        }
    }

    if (shouldReply) {
        await message.channel.sendTyping();

        const cleanContent = message.content.replace(/<@!?\d+>/g, '').trim();
        const prompt = cleanContent.length > 0 ? cleanContent : 'やっほー！';

        const aiReply = await getGeminiReply(prompt);

        await message.reply(aiReply);
        stats.totalSentMessages++;
    }
});

client.login(process.env.DISCORD_TOKEN);
