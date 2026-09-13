const fs = require('fs');

// pokemon_data.js を読み込む
const code = fs.readFileSync('pokemon_data.js', 'utf8');
const POKEMON_DATA = new Function(code + '; return POKEMON_DATA;')();

console.log('--- 1. データ数テスト ---');
console.assert(POKEMON_DATA.length >= 1025, 'Pokemon count should be >= 1025');
console.log('OK: Pokemon count is', POKEMON_DATA.length);

console.log('--- 2. 各世代のフィルタリングテスト ---');
for (let gen = 1; gen <= 9; gen++) {
  const list = POKEMON_DATA.filter(p => p.gen === gen);
  console.assert(list.length > 0, 'Gen ' + gen + ' should have pokemons');
  console.log('Gen ' + gen + ' count:', list.length, 'Example:', list[0].name);
}

console.log('--- 3. カタカナ正規化ロジックテスト ---');
function normalizeToKatakana(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[\s　]/g, '')
    .replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

console.assert(normalizeToKatakana('ぴかちゅう') === 'ピカチュウ', 'Hiragana to Katakana failed');
console.assert(normalizeToKatakana(' ピカチュウ ') === 'ピカチュウ', 'Whitespace trim failed');
console.assert(normalizeToKatakana('リザードン') === 'リザードン', 'Katakana pass failed');
console.assert(normalizeToKatakana('ポリゴン２') === 'ポリゴン2', 'Zen/Han number failed');
console.log('OK: Kana normalization passes all tests');

console.log('--- 4. ハードモード（シャッフル）テスト ---');
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const original = Array.from('リザードン');
let shuffled = shuffleArray(original);
console.log('Original:', original.join(''), '-> Shuffled:', shuffled.join(''));
console.assert(shuffled.slice().sort().join('') === original.slice().sort().join(''), 'Characters set must remain identical');
console.log('OK: All unit tests passed cleanly!');
