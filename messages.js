const fs = require('fs');

const prefixes = ['おっ', 'おーい', 'おいおい', 'ねえねえ', 'ほうほう', 'ふむふむ', 'やっほー', 'お疲れ！', 'ちょっと聞いてよ、', 'それな！', 'すごいね', 'マジで？', 'たしかに', 'なるほど'];
const bodies = [
    'ちくわが美味しすぎて世界が輝いて見える',
    '今日の天気は最高にちくわ日和だな',
    'AIだってたまにはお腹が空くんだぜ',
    'Discordでみんなとおしゃべりするの楽しいな',
    'すんごい秘密を教えてあげようか…？',
    'プログラミングってパズルみたいで面白いよね',
    '夜食に食べた磯辺揚げが最高だった件について',
    'ボットの機能をもっともっと増やしていこうぜ',
    'エラーが出ても諦めずに直すのがエンジニアの魂だ！',
    '今日も一日、元気にがんばっていこー！',
    'テンション上げていこうぜー！',
    'お茶でも飲みながらのんびりやろうよ'
];
const suffixes = ['☆', '！', '…！', 'w', '（笑）', '♪', 'の巻', 'なのだ！', '✨', '👍', '！w', '…✨'];

const messages = [];

// 欲しいメッセージの数をここで指定（例: 200,000個）
const totalCount = 200000;

for (let i = 1; i <= totalCount; i++) {
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const b = bodies[Math.floor(Math.random() * bodies.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    messages.push(`${p}${b}${s} (${i})`);
}

const fileContent = `module.exports = ${JSON.stringify(messages, null, 2)};`;
fs.writeFileSync('messages.js', fileContent, 'utf-8');

console.log(`✨ ${totalCount.toLocaleString()}個のメッセージを messages.js に生成したよ！`);
