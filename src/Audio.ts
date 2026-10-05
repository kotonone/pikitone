import { getContext, wait } from "./utils";

/**
 * 指定時刻以降の変更を取り消して値を保持します。
 * @param param 取り消し対象
 * @param cancelTime 取り消し開始時刻
 */
function cancelAndHold(param: AudioParam, cancelTime: number): void {
    // NOTE: 厳密な仕様反映をしていないので、export したり新しく使用する際には注意

    const candidate = param as AudioParam & { cancelAndHoldAtTime?: unknown };
    if (typeof candidate.cancelAndHoldAtTime === "function") {
        (candidate.cancelAndHoldAtTime as (time: number) => void)(cancelTime);
        return;
    }

    // NOTE: cancelScheduledValues は補完を取り消すので、setValueAtTime で値を保持させる。この間でグリッチが発生する可能性が少しだけある
    param.cancelScheduledValues(cancelTime);
    param.setValueAtTime(param.value, cancelTime);
}

/** {@link Audio} のオプション */
export interface AudioOptions {
    /** この音源がループ再生されるかどうか */
    loop: boolean;
    /** ループの開始位置（秒） */
    loopStart: number;
    /** ループの終了位置（秒） */
    loopEnd: number;
    /** 再生開始位置（秒） */
    startAt: number;
}

/** {@link Audio} で発火するイベントマップ */
export type AudioEventMap = Pick<AudioScheduledSourceNodeEventMap, "ended">;

/** 音声表現クラス */
export class Audio extends EventTarget implements AudioOptions {
    public startAt: number;

    /** システムが調整する GainNode */
    private readonly masterGain: GainNode;
    /** ユーザーが調整できる GainNode */
    private readonly userGain: GainNode;
    /** この音源のバッファ */
    private readonly buffer: AudioBuffer;
    /** この音源のソースノード */
    private source: AudioBufferSourceNode;

    /** 過去にこのソースノードで再生が行われたかどうか */
    #isUsedSource: boolean;
    /** ソースノードが再生されているかどうか */
    #isPlaying: boolean;
    /** 一時停止された位置（秒） */
    #pausedAt: number | null;
    /** 最後に再生が行われた時のコンテキスト時間。最後の再生が一時停止からの再開だった場合、この値は連続して再生された場合の仮の値を示します。 */
    #startAtAsContextTime: number | null;
    /** 入力された設定 */
    #options: Partial<AudioOptions>;

    public constructor(buffer: AudioBuffer, options?: Partial<AudioOptions>) {
        super();
        this.startAt = 0;

        this.masterGain = getContext().createGain();
        this.userGain = getContext().createGain();
        this.buffer = buffer;
        this.source = this.#createSource();
        this.#isUsedSource = false;
        this.#isPlaying = false;
        this.#pausedAt = null;
        this.#startAtAsContextTime = null;
        this.#options = options ?? {};

        this.userGain.connect(this.masterGain);

        this.loop = options?.loop ?? false;
        this.loopStart = options?.loopStart ?? 0;
        this.loopEnd = options?.loopEnd ?? buffer.duration;
        this.startAt = options?.startAt ?? 0;
    }

    #createSource(): AudioBufferSourceNode {
        const source = getContext().createBufferSource();
        source.buffer = this.buffer;
        source.connect(this.userGain);
        return source;
    }
    async #changeVolume(from: number, to: number, duration: number, exponential: boolean): Promise<void> {
        // NOTE: 0 では指数関数が発散してしまう
        const _from = from === 0 ? 0.0001 : from;
        const _to = to === 0 ? 0.0001 : to;

        const endTime = getContext().currentTime + duration;

        cancelAndHold(this.masterGain.gain, getContext().currentTime);
        this.masterGain.gain.value = _from;
        if (exponential) {
            this.masterGain.gain.exponentialRampToValueAtTime(_to, endTime);
        } else {
            this.masterGain.gain.linearRampToValueAtTime(_to, endTime);
        }
        await wait(duration);

        this.masterGain.gain.value = to;
    }
    #onEnded(): void {
        this.#isPlaying = false;
        this.#pausedAt = null;
        this.dispatchEvent(new Event("ended"));
    }

    public get loop(): boolean {
        return this.source.loop;
    }
    public set loop(value: boolean) {
        this.source.loop = value;
    }
    public get loopStart(): number {
        return this.source.loopStart;
    }
    public set loopStart(value: number) {
        this.source.loopStart = value;
    }
    public get loopEnd(): number {
        return this.source.loopEnd;
    }
    public set loopEnd(value: number) {
        this.source.loopEnd = value;
    }

    /** この音源の離調 */
    public get detune(): AudioParam {
        return this.source.detune;
    }
    /** この音源の音量 */
    public get volume(): AudioParam {
        return this.userGain.gain;
    }
    /** この音源の長さ（秒） */
    public get duration(): number {
        return this.buffer.duration;
    }

    /** この音源が現在再生中かどうか */
    public get isPlaying(): boolean {
        return this.#isPlaying;
    }

    /** この音源の現在位置 */
    public get currentTime(): number {
        return getContext().currentTime - (this.#startAtAsContextTime ?? getContext().currentTime);
    }

    /**
     * この音源の出力先を設定します。
     * @param destination 音源の出力先として指定する {@link AudioNode}
     */
    public setDestination(destination: AudioNode): this {
        this.masterGain.connect(destination);
        return this;
    }

    /**
     * この音源を再生します。
     * この関数は、フェードインを待機します。
     * @param animationDuration フェードイン時間（秒）
     * @param exponential フェードインに指数関数を使用するかどうか
     */
    public play(): void;
    public play(animationDuration: 0, exponential?: boolean): void;
    public play(animationDuration: number, exponential?: boolean): Promise<void>;
    public play(animationDuration?: number, exponential?: boolean): void | Promise<void> {
        if (this.#isPlaying) return;
        if (this.#isUsedSource) this.source = this.#createSource();

        // NOTE: 開始位置の計算や記録
        const startAt = this.#pausedAt ?? this.startAt;
        this.#startAtAsContextTime = getContext().currentTime - startAt;

        // NOTE: 再生
        this.source.onended = () => this.#onEnded();
        this.source.start(getContext().currentTime, startAt);
        this.#isUsedSource = true;

        // NOTE: フェードイン
        const promiseOrVoid = this.#changeVolume(0, 1, animationDuration ?? 0, exponential ?? false);

        this.#isPlaying = true;

        return promiseOrVoid;
    }

    /**
     * この音源の再生を一時停止します。
     * 一時停止された音源の再開には {@link play} メソッドを使用してください。
     * この関数は、フェードアウトを待機します。
     * @param duration フェードアウト時間（秒）
     * @param exponential フェードアウトに指数関数を使用するかどうか
     */
    public pause(): void;
    public pause(animationDuration: 0): void;
    public pause(animationDuration: number, exponential?: boolean): Promise<void>;
    public pause(animationDuration?: number, exponential?: boolean): void | Promise<void> {
        if (!this.#isPlaying) return;

        // NOTE: 一時停止位置を記録
        this.#pausedAt = getContext().currentTime - (this.#startAtAsContextTime ?? 0);

        // NOTE: フェードアウト
        const promiseOrVoid = this.#changeVolume(1, 0, animationDuration ?? 0, exponential ?? false);

        if (promiseOrVoid instanceof Promise) {
            promiseOrVoid.finally(() => {
                this.source.stop();
                this.source.disconnect();
                this.source.onended = null;
                this.#isPlaying = false;
            });
        } else {
            this.source.stop();
            this.source.disconnect();
            this.source.onended = null;
            this.#isPlaying = false;
        }

        return promiseOrVoid;
    }

    /**
     * 指定した秒数まで音源をシークします。
     * @param time シーク場所（秒）
     */
    public seek(time: number): this {
        const isRecentlyPlayed = this.#isPlaying;
        this.pause();
        this.#pausedAt = time;
        if (isRecentlyPlayed) this.play();

        return this;
    }

    /**
     * この音源の再生を停止し、再生開始位置（オプションで指定されていない場合は先頭）を戻します。
     * 一時停止したい場合、{@link pause} メソッドを利用することを検討してください。
     * この関数は、フェードアウトを待機します。
     * @param duration フェードアウト時間（秒）
     * @param exponential フェードアウトに指数関数を使用するかどうか
     */
    public stop(): void;
    public stop(animationDuration: 0, exponential?: boolean): void;
    public stop(animationDuration: number, exponential?: boolean): Promise<void>;
    public stop(animationDuration?: number, exponential?: boolean): void | Promise<void> {
        const promiseOrVoid = this.pause(animationDuration as number, exponential);
        this.#pausedAt = null;
        return promiseOrVoid;
    }

    /**
     * この音源をメモリ上から破棄できるように準備します。
     */
    public destroy(): void {
        this.pause();
        this.userGain.disconnect();
        this.masterGain.disconnect();
    }

    /**
     * この音源の複製を作成します。バッファは共有されます。
     */
    public clone(): Audio {
        return new Audio(this.buffer, this.#options);
    }
}
export interface Audio {
    addEventListener<K extends keyof AudioEventMap>(
        type: K,
        listener: (this: Audio, ev: AudioEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof AudioEventMap>(
        type: K,
        listener: (this: Audio, ev: AudioEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
}
