/* @ts-self-types="./mpeg2toh264_wasm.d.ts" */

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
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PictureEncoderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pictureencoder_free(ptr, 0);
    }
    /**
     * Convert one of the jobs a `Progress` handed out. The result is opaque
     * and goes straight back to `Session.complete`; a picture whose slices
     * will not decode comes back as a result saying so rather than as an
     * error, because that is a fact about the source and not a failure here.
     * @param {Uint8Array} job
     * @returns {Uint8Array}
     */
    encode(job) {
        const ptr0 = passArray8ToWasm0(job, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.pictureencoder_encode(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    constructor() {
        const ret = wasm.pictureencoder_new();
        this.__wbg_ptr = ret;
        PictureEncoderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) PictureEncoder.prototype[Symbol.dispose] = PictureEncoder.prototype.free;

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
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_session_free(ptr, 0);
    }
    /**
     * Whether the sound being read carries two services in one stream rather
     * than a stereo pair, as the frames read so far had it.
     *
     * `audioStreams` says so too, from the program map, and says it before a
     * frame has arrived. This is the stream itself, which is what a broadcast
     * that turns dual mono on within a programme leaves the map disagreeing
     * with.
     * @returns {boolean}
     */
    get audioIsDualMono() {
        const ret = wasm.session_audioIsDualMono(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Which of them the fragments are being made from, and `undefined` before
     * the program map has named one.
     * @returns {number | undefined}
     */
    get audioPid() {
        const ret = wasm.session_audioPid(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * Every sound stream the chosen service offers, in the order its program
     * map lists them. Empty until that map arrives.
     * @returns {AudioStream[]}
     */
    get audioStreams() {
        const ret = wasm.session_audioStreams(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Hand back one converted picture per job, in the order they were given
     * out, and carry on.
     * @param {Uint8Array[]} outputs
     * @returns {Progress}
     */
    complete(outputs) {
        const ptr0 = passArrayJsValueToWasm0(outputs, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_complete(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {number}
     */
    get dropped() {
        const ret = wasm.session_dropped(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get errors() {
        const ret = wasm.session_errors(this.__wbg_ptr);
        return ret;
    }
    /**
     * Flush everything held back, at end of input.
     * @returns {Fragment[]}
     */
    finish() {
        const ret = wasm.session_finish(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * [`Session::finish`], for the same caller. Call it until `jobs` is empty.
     * @returns {Progress}
     */
    finishDeferred() {
        const ret = wasm.session_finishDeferred(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
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
     * @param {number | null} [oversample]
     * @param {number | null} [origin_ticks]
     * @param {number | null} [service_id]
     * @param {number | null} [recovery_interval]
     * @param {boolean | null} [split_field_samples]
     * @param {boolean | null} [passthrough]
     * @param {string | null} [open_gop_recovery]
     */
    constructor(oversample, origin_ticks, service_id, recovery_interval, split_field_samples, passthrough, open_gop_recovery) {
        var ptr0 = isLikeNone(open_gop_recovery) ? 0 : passStringToWasm0(open_gop_recovery, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_new(!isLikeNone(oversample), isLikeNone(oversample) ? 0 : oversample, !isLikeNone(origin_ticks), isLikeNone(origin_ticks) ? 0 : origin_ticks, isLikeNone(service_id) ? 0xFFFFFF : service_id, isLikeNone(recovery_interval) ? Number.MAX_SAFE_INTEGER : (recovery_interval) >>> 0, isLikeNone(split_field_samples) ? 0xFFFFFF : split_field_samples ? 1 : 0, isLikeNone(passthrough) ? 0xFFFFFF : passthrough ? 1 : 0, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        SessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * The PES timestamp presentation time zero stands for, once the first
     * fragment has fixed it, and `undefined` until then.
     * @returns {number | undefined}
     */
    get originTicks() {
        const ret = wasm.session_originTicks(this.__wbg_ptr);
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * Feed the next slice of the transport stream.
     * @param {Uint8Array} chunk
     * @returns {Fragment[]}
     */
    push(chunk) {
        const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_push(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * [`Session::push`], for a caller that converts the pictures itself.
     *
     * Stops at the first unit whose video has to be coded and hands its
     * pictures back as `jobs`. Nothing more comes out of the session until
     * those are returned to `complete`.
     * @param {Uint8Array} chunk
     * @returns {Progress}
     */
    pushDeferred(chunk) {
        const ptr0 = passArray8ToWasm0(chunk, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.session_pushDeferred(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @returns {number}
     */
    get scrambled() {
        const ret = wasm.session_scrambled(this.__wbg_ptr);
        return ret;
    }
    /**
     * Take the sound from another of the service's streams from here on.
     *
     * Only from here on: the fragments already made carry the sound that was
     * chosen when they were made and have been appended, so nothing goes back
     * over them. Where the two streams are described differently -- a
     * commentary in stereo beside a programme in 5.1 -- the fragment the
     * change lands in carries an initialization segment of its own, exactly as
     * a programme boundary that changes the sound does.
     * @param {number} pid
     */
    selectAudio(pid) {
        wasm.session_selectAudio(this.__wbg_ptr, pid);
    }
    /**
     * Take the sound of a dual-mono stream from the second service rather than
     * the first, from here on.
     *
     * Both are rebuilt into the same two-channel configuration, so nothing is
     * described anew and the frames on either side of the change play one
     * after the other. A stream with one service in it is unaffected.
     * @param {boolean} sub
     */
    selectDualMono(sub) {
        wasm.session_selectDualMono(this.__wbg_ptr, sub);
    }
    /**
     * The service the fragments are being made from, once a program map has
     * named it, and `undefined` until then.
     * @returns {number | undefined}
     */
    get serviceId() {
        const ret = wasm.session_serviceId(this.__wbg_ptr);
        return ret === 0xFFFFFF ? undefined : ret;
    }
    /**
     * Every service this transport stream has announced, in the order it
     * announced them. Empty until the program association table arrives.
     * @returns {Uint16Array}
     */
    get serviceIds() {
        const ret = wasm.session_serviceIds(this.__wbg_ptr);
        var v1 = getArrayU16FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 2, 2);
        return v1;
    }
}
if (Symbol.dispose) Session.prototype[Symbol.dispose] = Session.prototype.free;

/**
 * The first presentation timestamp in a slice of transport stream, in 90 kHz
 * units, or `undefined` when it carries none.
 *
 * This is what time it is at the byte the slice was read from. A player
 * seeking in a file with no index asks this of a slice at the byte its
 * estimate points to, and asks again nearer the mark, which costs a hundred
 * kilobytes where transcoding to find out costs seconds of video.
 * @param {Uint8Array} data
 * @returns {number | undefined}
 */
export function firstTimestamp(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.firstTimestamp(ptr0, len0);
    return ret[0] === 0 ? undefined : ret[1];
}

/**
 * The last presentation timestamp in a slice of transport stream, in 90 kHz
 * units, or `undefined` when it carries none.
 *
 * Handed the tail of a file, this is how long the file is: the distance from
 * the `originTicks` a [`Session`] reported to what comes back here is the
 * duration a player can put on its timeline.
 * @param {Uint8Array} data
 * @returns {number | undefined}
 */
export function lastTimestamp(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lastTimestamp(ptr0, len0);
    return ret[0] === 0 ? undefined : ret[1];
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_length_1f0964f4a5e2c6d8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_32b398fb48b6d94a: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_da52cf8fe3429cb2: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_77cdfb7977362f3c: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_with_length_f8cbc3a5b9ff9368: function(arg0) {
            const ret = new Array(arg0 >>> 0);
            return ret;
        },
        __wbg_prototypesetcall_4770620bbe4688a0: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_d2ae3af0c1217ae6: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_set_8535240470bf2500: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_8a16b38e4805b298: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./mpeg2toh264_wasm_bg.js": import0,
    };
}

const PictureEncoderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pictureencoder_free(ptr, 1));
const SessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_session_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('mpeg2toh264_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
