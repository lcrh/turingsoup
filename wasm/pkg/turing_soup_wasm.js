let wasm;

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
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

let WASM_VECTOR_LEN = 0;

const ExecutionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_executionresult_free(ptr >>> 0, 1));

/**
 * Execution result returned to JavaScript
 */
export class ExecutionResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ExecutionResult.prototype);
        obj.__wbg_ptr = ptr;
        ExecutionResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ExecutionResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_executionresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get steps() {
        const ret = wasm.__wbg_get_executionresult_steps(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set steps(arg0) {
        wasm.__wbg_set_executionresult_steps(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get head0_count() {
        const ret = wasm.__wbg_get_executionresult_head0_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set head0_count(arg0) {
        wasm.__wbg_set_executionresult_head0_count(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get head1_count() {
        const ret = wasm.__wbg_get_executionresult_head1_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set head1_count(arg0) {
        wasm.__wbg_set_executionresult_head1_count(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get math_count() {
        const ret = wasm.__wbg_get_executionresult_math_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set math_count(arg0) {
        wasm.__wbg_set_executionresult_math_count(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get copy_count() {
        const ret = wasm.__wbg_get_executionresult_copy_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set copy_count(arg0) {
        wasm.__wbg_set_executionresult_copy_count(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get loop_count() {
        const ret = wasm.__wbg_get_executionresult_loop_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set loop_count(arg0) {
        wasm.__wbg_set_executionresult_loop_count(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get halt_reason() {
        const ret = wasm.__wbg_get_executionresult_halt_reason(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set halt_reason(arg0) {
        wasm.__wbg_set_executionresult_halt_reason(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) ExecutionResult.prototype[Symbol.dispose] = ExecutionResult.prototype.free;

/**
 * Run a batch of pair executions
 *
 * Input format: pairs as [slot_a_lo, slot_a_hi, slot_a_extra1, slot_a_extra2, slot_b_lo, slot_b_hi, slot_b_extra1, slot_b_extra2, ...]
 * (8 bytes per pair: 4 for slot_a as u32, 4 for slot_b as u32)
 *
 * Returns concatenated results for each pair
 * @param {Uint8Array} soup
 * @param {Uint8Array} pairs
 * @param {number} region_size
 * @param {number} head1_offset
 * @param {number} max_steps
 * @returns {Uint8Array}
 */
export function execute_batch(soup, pairs, region_size, head1_offset, max_steps) {
    const ptr0 = passArray8ToWasm0(soup, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(pairs, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.execute_batch(ptr0, len0, ptr1, len1, region_size, head1_offset, max_steps);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * Execute a pair of regions from the soup
 *
 * Extracts two regions, combines them, executes BFF, and returns results.
 * Does NOT write back - that's handled in JS with compression cost comparison.
 *
 * Returns: [steps, head0_count, head1_count, math_count, copy_count, loop_count, halt_reason, ...modified_tape_data]
 * @param {Uint8Array} soup
 * @param {number} slot_a
 * @param {number} slot_b
 * @param {number} region_size
 * @param {number} head1_offset
 * @param {number} max_steps
 * @returns {Uint8Array}
 */
export function execute_pair(soup, slot_a, slot_b, region_size, head1_offset, max_steps) {
    const ptr0 = passArray8ToWasm0(soup, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.execute_pair(ptr0, len0, slot_a, slot_b, region_size, head1_offset, max_steps);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Execute BFF program on a tape
 *
 * Takes a mutable slice of the tape data and executes the BFF interpreter.
 * Returns execution statistics.
 * @param {Uint8Array} tape
 * @returns {ExecutionResult}
 */
export function execute_tape(tape) {
    var ptr0 = passArray8ToWasm0(tape, wasm.__wbindgen_malloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.execute_tape(ptr0, len0, tape);
    return ExecutionResult.__wrap(ret);
}

/**
 * Check if a region contains any BFF instructions
 * @param {Uint8Array} data
 * @returns {boolean}
 */
export function has_instructions(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.has_instructions(ptr0, len0);
    return ret !== 0;
}

/**
 * Estimate Kolmogorov complexity using deflate compression (bits per byte)
 * @param {Uint8Array} data
 * @returns {number}
 */
export function kolmogorov_estimate(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.kolmogorov_estimate(ptr0, len0);
    return ret;
}

/**
 * Calculate Shannon entropy of data (bits per byte)
 * @param {Uint8Array} data
 * @returns {number}
 */
export function shannon_entropy(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.shannon_entropy(ptr0, len0);
    return ret;
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
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
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_copy_to_typed_array_db832bc4df7216c1 = function(arg0, arg1, arg2) {
        new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
    };
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
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


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('turing_soup_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
