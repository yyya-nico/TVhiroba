/* tslint:disable */
/* eslint-disable */

/** One thing to hand to Media Source Extensions. */
export type Fragment =
| {
    /**
     * An initialization segment, which comes before the media it describes.
     * Normally the only one; a stream that changes its frame size, its field
     * coding or its aspect ratio sends another, and the `SourceBuffer` takes
     * it in the same order as everything else.
     */
    kind: "init";
    data: Uint8Array;
    /** What to open the SourceBuffer with. */
    mimeCodec: string;
    width: number;
    height: number;
}
| {
    kind: "media";
    data: Uint8Array;
    /** Where this fragment starts on the presentation timeline, in seconds. */
    start: number;
    /** Whether a decoder can begin here, which is where eviction may stop. */
    randomAccess: boolean;
    videoSamples: number;
    audioSamples: number;
    /** Picture-accurate field changes, in presentation order. */
    scans: {
        start: number;
        interlaced: boolean;
        topFieldFirst: boolean;
    }[];
}
| {
    kind: "private-stream";
    /** PES stream_id: 0xbd (private_stream_1) or 0xbf (private_stream_2). */
    streamId: number;
    pid: number;
    data: Uint8Array;
    /** Absolute 90 kHz timestamp, or null when no media clock is available. */
    pts: number | null;
};

/**
 * How far a session got, for a caller converting the pictures itself.
 *
 * `jobs` is one opaque buffer per picture. Hand each to `PictureEncoder.encode`
 * -- here, or in as many workers as there are to spare -- and give the results
 * back to `Session.complete` in the same order. Until then the session produces
 * nothing further.
 */
export type Progress = {
    fragments: Fragment[];
    /** Empty when nothing is owed. */
    jobs: Uint8Array[];
};

/**
 * One sound stream a service offers, as its program map describes it.
 *
 * All of it comes from the map, so the choice can be offered before a byte of
 * any of these streams has been read.
 */
export type AudioStream = {
    /** Elementary stream PID, which is what `selectAudio` takes. */
    pid: number;
    /**
     * The ARIB stream identifier's component tag. A broadcast names its main
     * sound 0x10 and the ones beside it 0x11 upwards, which is all that
     * distinguishes them where the languages are the same.
     */
    componentTag: number | null;
    /**
     * Whether the stream's two channels are two separate services rather than a
     * stereo pair. Choosing between those is `selectDualMono`, not this: they
     * are one stream.
     */
    dualMono: boolean;
    /**
     * The languages the descriptors name, in the order they name them, as ISO
     * 639 codes. Dual mono carries the second service's language second.
     */
    languages: string[];
};



/**
 * Converts one picture at a time, and nothing else.
 *
 * This is what a picture worker holds. It knows nothing of the stream around
 * it -- everything a picture is coded against arrives with it -- so a pool of
 * these, each in its own worker and so its own WebAssembly instance, converts
 * a unit's pictures at the same time without sharing any memory.
 *
 * ```js
 * const encoder = new PictureEncoder();
 * self.onmessage = ({ data: job }) => {
 *   const output = encoder.encode(job);
 *   self.postMessage(output, [output.buffer]);
 * };
 * ```
 *
 * Keep one for as long as the worker lives: what it holds between pictures is
 * several megabytes of scratch at an HD macroblock count, and asking the
 * allocator for that per picture costs more than the coding does.
 */
export class PictureEncoder {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Convert one of the jobs a `Progress` handed out. The result is opaque
     * and goes straight back to `Session.complete`; a picture whose slices
     * will not decode comes back as a result saying so rather than as an
     * error, because that is a fact about the source and not a failure here.
     */
    encode(job: Uint8Array): Uint8Array;
    constructor();
}

/**
 * Streaming transcode of one transport stream.
 *
 * Feed it the file in slices and append what comes back:
 *
 * ```js
 * const session = new Session();
 * for (const fragment of session.push(chunk)) append(fragment);
 * for (const fragment of session.finish()) append(fragment);
 * ```
 *
 * A slice that completes no fragment returns an empty array, which is normal.
 *
 * Each fragment is a plain object, so there is nothing to free:
 *
 * - `kind` -- `"init"` for an initialization segment, which comes before the
 *   media it describes, or `"media"` for the media itself. There is normally
 *   one init fragment; a stream that changes what its sequence header says
 *   sends another, and it is appended in the order it arrives.
 * - `data` -- the bytes to append. Its `ArrayBuffer` is the worker's own, so
 *   it can be transferred to the page rather than copied again.
 * - `mimeCodec` -- what to open the `SourceBuffer` with. Init fragments only.
 * - `start` -- where the fragment sits on the presentation timeline, in
 *   seconds. Media fragments only.
 * - `randomAccess` -- whether a decoder can begin here. A player needs this,
 *   with `start`, to evict buffered media without cutting into what is about
 *   to play. Media fragments only.
 * - `videoSamples`, `audioSamples` -- how many of each the fragment carries.
 */
export class Session {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Hand back one converted picture per job, in the order they were given
     * out, and carry on.
     */
    complete(outputs: Uint8Array[]): Progress;
    /**
     * Flush everything held back, at end of input.
     */
    finish(): Fragment[];
    /**
     * [`Session::finish`], for the same caller. Call it until `jobs` is empty.
     */
    finishDeferred(): Progress;
    /**
     * Start a session. `oversample` is the quantiser search factor, and
     * `undefined` takes the default of 2.
     *
     * `originTicks` measures the timeline from a PES timestamp of the
     * caller's choosing rather than from wherever this input opens, which is
     * what makes a stream starting mid-file appendable at the time it really
     * holds. Pass the `originTicks` an earlier session reported.
     *
     * `serviceId` takes one named service out of a transport stream that
     * carries several. `undefined` takes the first that turns up with a
     * picture in it. See `serviceIds` for what a recording is offering.
     *
     * `splitFieldSamples` gives each field of a complementary pair its own MP4
     * sample, working around decoders that freeze on field pictures.
     * `undefined` leaves the pair in one sample, which is what more decoders
     * accept.
     *
     * `passthrough` carries the MPEG-2 video into the MP4 as it stands
     * instead of converting it, for a browser whose decoder takes MPEG-2.
     * Nothing is requantised, so the picture is the broadcast's own and the
     * conversion costs almost nothing -- but a browser that does not decode
     * MPEG-2 plays none of it. Ask `MediaSource.isTypeSupported` with the
     * `mimeCodec` the init fragment reports before relying on it.
     */
    constructor(oversample?: number | null, origin_ticks?: number | null, service_id?: number | null, recovery_interval?: number | null, split_field_samples?: boolean | null, passthrough?: boolean | null, open_gop_recovery?: string | null);
    /**
     * Feed the next slice of the transport stream.
     */
    push(chunk: Uint8Array): Fragment[];
    /**
     * [`Session::push`], for a caller that converts the pictures itself.
     *
     * Stops at the first unit whose video has to be coded and hands its
     * pictures back as `jobs`. Nothing more comes out of the session until
     * those are returned to `complete`.
     */
    pushDeferred(chunk: Uint8Array): Progress;
    /**
     * Take the sound from another of the service's streams from here on.
     *
     * Only from here on: the fragments already made carry the sound that was
     * chosen when they were made and have been appended, so nothing goes back
     * over them. Where the two streams are described differently -- a
     * commentary in stereo beside a programme in 5.1 -- the fragment the
     * change lands in carries an initialization segment of its own, exactly as
     * a programme boundary that changes the sound does.
     */
    selectAudio(pid: number): void;
    /**
     * Take the sound of a dual-mono stream from the second service rather than
     * the first, from here on.
     *
     * Both are rebuilt into the same two-channel configuration, so nothing is
     * described anew and the frames on either side of the change play one
     * after the other. A stream with one service in it is unaffected.
     */
    selectDualMono(sub: boolean): void;
    /**
     * Whether the sound being read carries two services in one stream rather
     * than a stereo pair, as the frames read so far had it.
     *
     * `audioStreams` says so too, from the program map, and says it before a
     * frame has arrived. This is the stream itself, which is what a broadcast
     * that turns dual mono on within a programme leaves the map disagreeing
     * with.
     */
    readonly audioIsDualMono: boolean;
    /**
     * Which of them the fragments are being made from, and `undefined` before
     * the program map has named one.
     */
    readonly audioPid: number | undefined;
    /**
     * Every sound stream the chosen service offers, in the order its program
     * map lists them. Empty until that map arrives.
     */
    readonly audioStreams: AudioStream[];
    readonly dropped: number;
    readonly errors: number;
    /**
     * The PES timestamp presentation time zero stands for, once the first
     * fragment has fixed it, and `undefined` until then.
     */
    readonly originTicks: number | undefined;
    readonly scrambled: number;
    /**
     * The service the fragments are being made from, once a program map has
     * named it, and `undefined` until then.
     */
    readonly serviceId: number | undefined;
    /**
     * Every service this transport stream has announced, in the order it
     * announced them. Empty until the program association table arrives.
     */
    readonly serviceIds: Uint16Array;
}

/**
 * The first presentation timestamp in a slice of transport stream, in 90 kHz
 * units, or `undefined` when it carries none.
 *
 * This is what time it is at the byte the slice was read from. A player
 * seeking in a file with no index asks this of a slice at the byte its
 * estimate points to, and asks again nearer the mark, which costs a hundred
 * kilobytes where transcoding to find out costs seconds of video.
 */
export function firstTimestamp(data: Uint8Array): number | undefined;

/**
 * The last presentation timestamp in a slice of transport stream, in 90 kHz
 * units, or `undefined` when it carries none.
 *
 * Handed the tail of a file, this is how long the file is: the distance from
 * the `originTicks` a [`Session`] reported to what comes back here is the
 * duration a player can put on its timeline.
 */
export function lastTimestamp(data: Uint8Array): number | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_pictureencoder_free: (a: number, b: number) => void;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly firstTimestamp: (a: number, b: number) => [number, number];
    readonly lastTimestamp: (a: number, b: number) => [number, number];
    readonly pictureencoder_encode: (a: number, b: number, c: number) => [number, number, number];
    readonly pictureencoder_new: () => number;
    readonly session_audioIsDualMono: (a: number) => number;
    readonly session_audioPid: (a: number) => number;
    readonly session_audioStreams: (a: number) => [number, number, number];
    readonly session_complete: (a: number, b: number, c: number) => [number, number, number];
    readonly session_dropped: (a: number) => number;
    readonly session_errors: (a: number) => number;
    readonly session_finish: (a: number) => [number, number, number];
    readonly session_finishDeferred: (a: number) => [number, number, number];
    readonly session_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly session_originTicks: (a: number) => [number, number];
    readonly session_push: (a: number, b: number, c: number) => [number, number, number];
    readonly session_pushDeferred: (a: number, b: number, c: number) => [number, number, number];
    readonly session_scrambled: (a: number) => number;
    readonly session_selectAudio: (a: number, b: number) => void;
    readonly session_selectDualMono: (a: number, b: number) => void;
    readonly session_serviceId: (a: number) => number;
    readonly session_serviceIds: (a: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
