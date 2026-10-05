declare global {
    interface Window {
        webkitAudioContext: AudioContext | undefined;
    }
}

let sharedContext: AudioContext | null = null;

/**
 * 共有 AudioContext を取得します。初回呼び出し時に生成します。
 */
export function getContext(): AudioContext {
    sharedContext ??= new (window.AudioContext || window.webkitAudioContext)();
    return sharedContext;
}

/**
 * 指定された音声データをデコードします。
 * @param audioData 音声データ
 */
export async function decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    return await getContext().decodeAudioData(audioData);
}

/**
 * 指定された時間待機します。
 * @param seconds 時間（秒）
 */
export async function wait(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
