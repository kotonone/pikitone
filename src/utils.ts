declare global {
    interface Window {
        webkitAudioContext: AudioContext | undefined;
    }
}

/**
 * pancake-sound 内で利用されるコンテキスト
 */
export const context = new (window.AudioContext || window.webkitAudioContext)();

/**
 * 指定された音声データをデコードします。
 * @param audioData 音声データ
 */
export async function decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    return await context.decodeAudioData(audioData);
}

/**
 * 指定された時間待機します。
 * @param seconds 時間（秒）
 */
export async function wait(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
