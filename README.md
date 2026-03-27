# Pikitone

BGM や効果音を柔軟に再生することを目的として作成された、Web Audio API のラッパーライブラリです。

## できること

- **基本再生**
    - 同じ音源の多重再生
        - 最大同時再生数の指定が可能
    - ループ再生
        - ループ開始・終了位置の指定可能
    - フェードイン・フェードアウト
        - 線形・指数関数対応
        - クロスフェードによる BGM 切り替え
- **音源の調整**
    - カテゴリごとの音量調整
    - 音量・ピッチの調整
    - 再生位置のシーク

## 使い方

### 音源の作成

```typescript
import { Audio, AudioListener, decodeAudioData } from "@kotonone/pikitone";

const response = await fetch("path/to/audio.mp3");
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await decodeAudioData(arrayBuffer);

const bgmAudio = new Audio(audioBuffer, { loop: true });
const seAudio = new Audio(audioBuffer2);
```

### 再生の管理

```typescript
const listener = new AudioListener({
    bgm_01: bgmAudio,
    se_01: seAudio,
});

// NOTE: BGM の再生（ループ再生）
await listener.setBgm("bgm_01");

// NOTE: 効果音の再生
await listener.play("se_01");

// NOTE: カテゴリ付きでの再生
await listener.play("se_02", "player");

// NOTE: 音量調整
listener.volume = 0.5;
// もしくは
listener.volumeParam.value = 0.5;

// NOTE: カテゴリごとの音量調整
listener.categories.bgm.value = 0.5;
listener.categories.player.value = 0.5;
```

### フェード効果

```typescript
// NOTE: 1秒でフェードイン
await audio.play(1.0);

// NOTE: 0.5秒でフェードアウト
await audio.pause(0.5);

// NOTE: 1秒のクロスフェードで BGM 切り替え
await listener.setBgm("bgm_02", 1.0, true);
```

### 再生位置のシーク

```typescript
// NOTE: 30秒目にシーク
audio.seek(30);
```
