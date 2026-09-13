/**
 * ポケモンダレダ！？ - アプリケーションロジック
 */

(() => {
  'use strict';

  // --- 世代ラベルマッピング ---
  const GEN_NAMES = {
    1: '第1世代: カントー',
    2: '第2世代: ジョウト',
    3: '第3世代: ホウエン',
    4: '第4世代: シンオウ',
    5: '第5世代: イッシュ',
    6: '第6世代: カロス',
    7: '第7世代: アローラ',
    8: '第8世代: ガラル・ヒスイ',
    9: '第9世代: パルデア'
  };

  // --- DOM要素キャッシュ ---
  const el = {
    sensorLight: document.getElementById('sensorLight'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    streakCount: document.getElementById('streakCount'),
    modeNormalBtn: document.getElementById('modeNormalBtn'),
    modeHardBtn: document.getElementById('modeHardBtn'),
    genSelect: document.getElementById('genSelect'),
    currentGenBadge: document.getElementById('currentGenBadge'),
    currentLengthBadge: document.getElementById('currentLengthBadge'),
    currentModeTag: document.getElementById('currentModeTag'),
    instructionText: document.getElementById('instructionText'),
    cardsContainer: document.getElementById('cardsContainer'),
    shuffleAlert: document.getElementById('shuffleAlert'),
    answerForm: document.getElementById('answerForm'),
    answerInput: document.getElementById('answerInput'),
    clearInputBtn: document.getElementById('clearInputBtn'),
    submitBtn: document.getElementById('submitBtn'),
    feedbackMsg: document.getElementById('feedbackMsg'),
    skipBtn: document.getElementById('skipBtn'),
    giveupBtn: document.getElementById('giveupBtn'),
    // モーダル
    resultModal: document.getElementById('resultModal'),
    modalBanner: document.getElementById('modalBanner'),
    modalIcon: document.getElementById('modalIcon'),
    modalTitle: document.getElementById('modalTitle'),
    modalPokemonImg: document.getElementById('modalPokemonImg'),
    artworkLoader: document.getElementById('artworkLoader'),
    modalDexNo: document.getElementById('modalDexNo'),
    modalPokemonName: document.getElementById('modalPokemonName'),
    modalPokemonGen: document.getElementById('modalPokemonGen'),
    modalPokemonLength: document.getElementById('modalPokemonLength'),
    modalStreakVal: document.getElementById('modalStreakVal'),
    modalModeVal: document.getElementById('modalModeVal'),
    nextPokemonBtn: document.getElementById('nextPokemonBtn')
  };

  // --- アプリケーション状態 ---
  const state = {
    currentMode: 'normal', // 'normal' | 'hard'
    currentGen: 'all',    // 'all' | 1..9
    currentPokemon: null,
    cardData: [],          // [{ char, originalIdx, isFlipped, timer }]
    streak: 0,
    soundEnabled: true,
    audioCtx: null
  };

  // --- Web Audio API 効果音システム ---
  function initAudio() {
    if (!state.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        state.audioCtx = new AudioContext();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, startTimeOffset = 0, gainLevel = 0.15) {
    if (!state.soundEnabled) return;
    initAudio();
    if (!state.audioCtx) return;

    try {
      const ctx = state.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);

      gain.gain.setValueAtTime(gainLevel, ctx.currentTime + startTimeOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimeOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startTimeOffset);
      osc.stop(ctx.currentTime + startTimeOffset + duration);
    } catch (e) {
      console.warn('Audio playback error', e);
    }
  }

  const sound = {
    tap: () => playTone(600, 'sine', 0.08, 0, 0.1),
    flip: () => {
      playTone(480, 'triangle', 0.06, 0, 0.15);
      playTone(720, 'sine', 0.1, 0.04, 0.12);
    },
    unflip: () => playTone(320, 'sine', 0.08, 0, 0.08),
    correct: () => {
      // 捕獲・正解ファンファーレ
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        playTone(freq, 'triangle', 0.15, idx * 0.09, 0.18);
      });
      playTone(1318.51, 'sine', 0.35, 0.38, 0.22); // E6
    },
    wrong: () => {
      playTone(220, 'sawtooth', 0.15, 0, 0.15);
      playTone(185, 'sawtooth', 0.22, 0.12, 0.15);
    }
  };

  // --- ひらがな・カタカナ正規化ユーティリティ ---
  function normalizeToKatakana(str) {
    if (!str) return '';
    return str
      .trim()
      // 全角英数を半角化、スペース除去
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[\s　]/g, '')
      // ひらがなをカタカナに変換
      .replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .toLowerCase();
  }

  // --- シャッフルアルゴリズム ---
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // --- ポケモン出題プール取得 ---
  function getFilteredPokemonPool() {
    if (state.currentGen === 'all') {
      return POKEMON_DATA;
    }
    const targetGen = parseInt(state.currentGen, 10);
    return POKEMON_DATA.filter(p => p.gen === targetGen);
  }

  // --- 新しい問題を出題 ---
  function nextQuestion() {
    clearFeedback();
    el.answerInput.value = '';
    el.clearInputBtn.classList.add('hidden');

    const pool = getFilteredPokemonPool();
    if (!pool || pool.length === 0) {
      alert('該当する世代のポケモンが見つかりませんでした。');
      return;
    }

    // 前回のポケモンと重複しないようにランダム選択
    let nextPoke;
    if (pool.length === 1) {
      nextPoke = pool[0];
    } else {
      do {
        const randIdx = Math.floor(Math.random() * pool.length);
        nextPoke = pool[randIdx];
      } while (state.currentPokemon && nextPoke.id === state.currentPokemon.id && pool.length > 1);
    }

    state.currentPokemon = nextPoke;
    setupQuestionUI(nextPoke);
  }

  // --- UI構築 ---
  function setupQuestionUI(pokemon) {
    // メタ情報更新
    el.currentGenBadge.textContent = GEN_NAMES[pokemon.gen] ? GEN_NAMES[pokemon.gen].split(':')[0] : '第' + pokemon.gen + '世代';
    el.currentLengthBadge.textContent = `${pokemon.name.length}文字`;

    if (state.currentMode === 'normal') {
      el.currentModeTag.textContent = '🎯 ならび順そのまま';
      el.shuffleAlert.classList.add('hidden');
      el.instructionText.textContent = 'パネルをタップすると3秒間だけ文字が見えるぞ！';
    } else {
      el.currentModeTag.textContent = '🌀 ぐちゃぐちゃ並び替え';
      el.shuffleAlert.classList.remove('hidden');
      el.instructionText.textContent = '文字の順序がバラバラ！めくって推理しよう！';
    }

    // 文字列の分解
    const chars = Array.from(pokemon.name);

    if (state.currentMode === 'normal') {
      state.cardData = chars.map((ch, idx) => ({
        char: ch,
        originalIdx: idx,
        displayIdx: idx + 1,
        isFlipped: false,
        timer: null
      }));
    } else {
      // ハードモード：シャッフル（文字数が2以上なら必ず元の並びと異なるようにする）
      let shuffled = chars.map((ch, idx) => ({ char: ch, originalIdx: idx }));
      if (shuffled.length > 1) {
        let attempts = 0;
        let isSameOrder = true;
        while (isSameOrder && attempts < 20) {
          shuffled = shuffleArray(shuffled);
          attempts++;
          isSameOrder = shuffled.every((item, i) => item.char === chars[i]);
        }
      }
      state.cardData = shuffled.map((item, idx) => ({
        char: item.char,
        originalIdx: item.originalIdx,
        displayIdx: idx + 1,
        isFlipped: false,
        timer: null
      }));
    }

    renderCards();
  }

  // --- カード描画 ---
  function renderCards() {
    el.cardsContainer.innerHTML = '';

    state.cardData.forEach((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'poke-card';
      cardEl.dataset.index = index;

      cardEl.innerHTML = `
        <div class="card-face card-front">
          <span class="card-front-idx">${card.displayIdx}</span>
        </div>
        <div class="card-face card-back">
          <div class="card-char">${card.char}</div>
          <div class="card-timer-bar">
            <div class="card-timer-fill"></div>
          </div>
        </div>
      `;

      cardEl.addEventListener('click', () => handleCardClick(index, cardEl));
      el.cardsContainer.appendChild(cardEl);
    });
  }

  // --- カードタップ処理（3秒タイマー & 3Dフリップ） ---
  function handleCardClick(index, cardEl) {
    const card = state.cardData[index];
    if (!card) return;

    sound.flip();

    // 既存タイマーがあればクリアして延長
    if (card.timer) {
      clearTimeout(card.timer);
      card.timer = null;
    }

    const timerFill = cardEl.querySelector('.card-timer-fill');

    // めくり状態にする
    card.isFlipped = true;
    cardEl.classList.add('flipped');

    // タイマーアニメーションの再トリガー
    if (timerFill) {
      timerFill.classList.remove('animating');
      // reflow
      void timerFill.offsetWidth;
      timerFill.classList.add('animating');
    }

    // 3秒後に元に戻す
    card.timer = setTimeout(() => {
      card.isFlipped = false;
      cardEl.classList.remove('flipped');
      if (timerFill) {
        timerFill.classList.remove('animating');
      }
      card.timer = null;
      sound.unflip();
    }, 3000);
  }

  // --- 回答チェック処理 ---
  function checkAnswer() {
    const userVal = el.answerInput.value.trim();
    if (!userVal) {
      showFeedback('なまえを入力してね！', 'wrong');
      el.answerInput.focus();
      return;
    }

    const targetName = state.currentPokemon.name;
    const normUser = normalizeToKatakana(userVal);
    const normTarget = normalizeToKatakana(targetName);

    // 記号（♂, ♀, 2, Z, ・, ：など）を省略した柔軟マッチングも許可
    const stripSymbols = (s) => s.replace(/[♂♀２２ｚz・：:]/g, '');
    const isCorrect = (normUser === normTarget) || (stripSymbols(normUser) === stripSymbols(normTarget));

    if (isCorrect) {
      // 正解処理
      sound.correct();
      triggerSensorFlash();
      state.streak += 1;
      updateStreakUI();
      openResultModal(true);
    } else {
      // 不正解処理
      sound.wrong();
      state.streak = 0;
      updateStreakUI();
      showFeedback('ちがうみたい… もう一度考えてみよう！', 'wrong');
      el.answerInput.select();
    }
  }

  // --- センサーランプ点滅演出 ---
  function triggerSensorFlash() {
    el.sensorLight.classList.add('active');
    setTimeout(() => {
      el.sensorLight.classList.remove('active');
    }, 1200);
  }

  // --- フィードバックメッセージ表示 ---
  function showFeedback(text, type = '') {
    el.feedbackMsg.textContent = text;
    el.feedbackMsg.className = `feedback-msg ${type}`;
  }

  function clearFeedback() {
    el.feedbackMsg.textContent = '';
    el.feedbackMsg.className = 'feedback-msg';
  }

  // --- 連勝UI更新 ---
  function updateStreakUI() {
    el.streakCount.textContent = state.streak;
  }

  // --- ポケモン画像URL生成 (PokeAPI公式スプライト) ---
  function getPokemonImageUrl(id) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  }

  // --- モーダル表示 ---
  function openResultModal(isSuccess) {
    const pokemon = state.currentPokemon;
    if (!pokemon) return;

    if (isSuccess) {
      el.modalBanner.className = 'modal-header-banner';
      el.modalIcon.textContent = '🎉';
      el.modalTitle.textContent = 'つかまえた！（せいかい！）';
    } else {
      el.modalBanner.className = 'modal-header-banner giveup';
      el.modalIcon.textContent = '💡';
      el.modalTitle.textContent = 'こたえはこちら！';
    }

    // 番号フォーマット
    const formattedNo = 'No.' + String(pokemon.id).padStart(4, '0');
    el.modalDexNo.textContent = formattedNo;
    el.modalPokemonName.textContent = pokemon.name;
    el.modalPokemonGen.textContent = GEN_NAMES[pokemon.gen] || `第${pokemon.gen}世代`;
    el.modalPokemonLength.textContent = `${pokemon.name.length}文字`;
    el.modalStreakVal.textContent = state.streak;
    el.modalModeVal.textContent = state.currentMode === 'normal' ? 'ノーマル' : 'ハード (シャッフル)';

    // アートワーク画像読み込み
    el.modalPokemonImg.src = getPokemonImageUrl(pokemon.id);
    el.modalPokemonImg.alt = pokemon.name;

    // 画像フォールバック（読み込めない場合はピクセル風スプライトまたは非表示）
    el.modalPokemonImg.onerror = () => {
      el.modalPokemonImg.onerror = null;
      // ピクセル通常スプライトにフォールバック
      el.modalPokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`;
    };

    el.resultModal.classList.remove('hidden');
    el.nextPokemonBtn.focus();
  }

  function closeResultModal() {
    el.resultModal.classList.add('hidden');
    nextQuestion();
  }

  // --- ギブアップ（答えを見る） ---
  function giveUp() {
    sound.tap();
    state.streak = 0;
    updateStreakUI();
    openResultModal(false);
  }

  // --- モード切り替え ---
  function setMode(newMode) {
    if (state.currentMode === newMode) return;
    state.currentMode = newMode;
    sound.tap();

    if (newMode === 'normal') {
      el.modeNormalBtn.classList.add('active');
      el.modeHardBtn.classList.remove('active');
    } else {
      el.modeHardBtn.classList.add('active');
      el.modeNormalBtn.classList.remove('active');
    }

    // 新しいモードで出題
    nextQuestion();
  }

  // --- イベントリスナー登録 ---
  function initEvents() {
    // 音量ボタン
    el.soundToggleBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      el.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
      if (state.soundEnabled) sound.tap();
    });

    // センサーランプタップでも効果音
    el.sensorLight.addEventListener('click', () => {
      triggerSensorFlash();
      sound.tap();
    });

    // モード切り替え
    el.modeNormalBtn.addEventListener('click', () => setMode('normal'));
    el.modeHardBtn.addEventListener('click', () => setMode('hard'));

    // 世代セレクト
    el.genSelect.addEventListener('change', (e) => {
      state.currentGen = e.target.value;
      sound.tap();
      nextQuestion();
    });

    // 回答送信フォーム
    el.answerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      checkAnswer();
    });

    // 入力クリアボタン
    el.answerInput.addEventListener('input', () => {
      if (el.answerInput.value.length > 0) {
        el.clearInputBtn.classList.remove('hidden');
      } else {
        el.clearInputBtn.classList.add('hidden');
      }
    });

    el.clearInputBtn.addEventListener('click', () => {
      el.answerInput.value = '';
      el.clearInputBtn.classList.add('hidden');
      el.answerInput.focus();
    });

    // スキップボタン
    el.skipBtn.addEventListener('click', () => {
      sound.tap();
      nextQuestion();
    });

    // 答えを見るボタン
    el.giveupBtn.addEventListener('click', giveUp);

    // 次のポケモンへ進むボタン（モーダル内）
    el.nextPokemonBtn.addEventListener('click', () => {
      sound.tap();
      closeResultModal();
    });

    // モーダル外側クリックで閉じる
    el.resultModal.addEventListener('click', (e) => {
      if (e.target === el.resultModal) {
        closeResultModal();
      }
    });

    // キーボード操作補助（Escapeでモーダル閉じなど）
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.resultModal.classList.contains('hidden')) {
        closeResultModal();
      }
    });
  }

  // --- アプリケーション起動 ---
  function init() {
    initEvents();
    nextQuestion();
    console.log('ポケモンダレダ！？ initialized successfully. Total Pokémon:', POKEMON_DATA.length);
  }

  // DOMContentLoadedを待って起動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
