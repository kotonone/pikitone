import { context } from "./utils";
import { Audio } from "./Audio";

/** {@link AudioListener} のオプション */
export interface AudioListenerOptions {
    /** この AudioListener がサポートする音源のカテゴリ */
    categories: string[];
    /** 同一音源の最大同時再生数 */
    maxPolyphony: number;
}

/** {@link Audio} を管理し、再生するクラス */
export class AudioListener<M extends Record<string, Audio>> {
    /** この AudioListener が持っている {@link Audio} */
    public audios: Readonly<M>;

    /** この AudioListener に指定されたオプション */
    private readonly options: AudioListenerOptions;

    /** この AudioListener が使用するルートノード */
    private readonly rootNode: GainNode;

    /** 各カテゴリの GainNode */
    private readonly categories: ReadonlyMap<string, GainNode>;

    /** 現在再生中の BGM 音源 */
    #bgm: Audio | null;
    /** 再生中の SE スレッド（クローンを含む） */
    #threads: Set<Audio>;

    public constructor(audios: M, options?: Partial<AudioListenerOptions>) {
        const categories = new Map<string, GainNode>();

        this.audios = audios;
        this.options = {
            categories: ["bgm", "bgs", "player", "npc", "enemy"],
            maxPolyphony: 4,
            ...options,
        };
        this.rootNode = context.createGain();
        this.categories = categories;
        this.#bgm = null;
        this.#threads = new Set();

        this.rootNode.connect(context.destination);

        // NOTE: カテゴリ用の GainNode を作成
        for (const category of this.options.categories) {
            const gainNode = context.createGain();
            categories.set(category, gainNode);
            gainNode.connect(this.rootNode);
        }
    }

    /** マスターボリューム（パラメータ） */
    public get volumeParam(): AudioParam {
        return this.rootNode.gain;
    }
    /** マスターボリューム */
    public get volume(): number {
        return this.volumeParam.value;
    }
    public set volume(value: number) {
        this.volumeParam.value = value;
    }

    /**
     * 指定された音源を再生します。
     * この関数は、再生が終了または一時停止されるまで待機します。
     * @param audio 再生する音源
     * @param category 再生先のカテゴリ
     * @param animationDuration フェードイン時間（秒）
     * @param exponential フェードインに指数関数を使用するかどうか
     */
    public play(audio: Extract<keyof M, string> | Audio, category?: string): Promise<void>;
    public play(
        audio: Extract<keyof M, string> | Audio,
        category: string | undefined,
        animationDuration: 0,
        exponential?: boolean,
    ): Promise<void>;
    public play(
        audio: Extract<keyof M, string> | Audio,
        category: string | undefined,
        animationDuration: number,
        exponential?: boolean,
    ): Promise<void>;
    public async play(
        audio: Extract<keyof M, string> | Audio,
        category?: string,
        animationDuration?: number,
        exponential?: boolean,
    ): Promise<void> {
        const audioObject = audio instanceof Audio ? audio : this.audios[audio];
        if (!audioObject) throw new Error(`Audio not found: ${audio}`);

        const categoryNode = category ? this.categories.get(category) : this.rootNode;
        if (!categoryNode) throw new Error("Category not found");

        // NOTE: 再生中であればクローンを新規スレッドとして使用
        const thread = audioObject.isPlaying ? audioObject.clone() : audioObject;
        const isClone = thread !== audioObject;
        if (this.#threads.size >= this.options.maxPolyphony) {
            // NOTE: maxPolyphony を超えた場合は最古のスレッドを停止
            const oldest = this.#threads.values().next().value!;
            oldest.stop();
            this.#threads.delete(oldest);
            if (oldest !== audioObject) oldest.destroy();
        }

        this.#threads.add(thread);
        thread.setDestination(categoryNode);
        thread.play(animationDuration as number, exponential);

        await new Promise<void>((resolve) => {
            thread.addEventListener(
                "ended",
                () => {
                    this.#threads.delete(thread);
                    if (isClone) thread.destroy();
                    resolve();
                },
                { once: true },
            );
        });
    }

    /** 現在再生中の BGM を取得します。 */
    public getBgm(): Audio | null {
        return this.#bgm;
    }

    /**
     * BGM を変更します。
     * この関数は、切り替えが終了されるまで待機します。
     * @param audio 変更先の BGM
     * @param animationDuration フェード時間（秒）。デフォルトは 0.25 秒です。
     * @param crossfade クロスフェードを行うかどうか。`false` の場合、一度フェードアウト後、次の BGM がフェードインします。
     */
    public async setBgm(
        audio: Extract<keyof M, string> | Audio,
        animationDuration: number = 0.25,
        crossfade?: boolean,
    ) {
        const pausePromise = this.#bgm?.pause(animationDuration);
        if (!crossfade) await pausePromise;

        const audioObject = audio instanceof Audio ? audio : this.audios[audio];
        if (!audioObject) throw new Error(`Audio not found: ${audio}`);
        audioObject.loop = true;
        if (crossfade) audioObject.seek(this.#bgm?.currentTime ?? 0);

        this.#bgm = audioObject;
        await audioObject.setDestination(this.rootNode).play(animationDuration);
    }

    /**
     * この AudioListener を破棄します。
     */
    public destroy(): void {
        this.rootNode.disconnect();
        for (const gainNode of this.categories.values()) gainNode.disconnect();
        for (const audio of Object.values(this.audios) as Audio[]) audio.destroy();
        for (const thread of this.#threads) thread.destroy();
        this.#threads.clear();
    }
}
