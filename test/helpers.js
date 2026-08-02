import {webcrypto} from 'node:crypto';

export class MemoryStorage {
  #items = new Map();

  getItem(key) {
    return this.#items.has(key) ? this.#items.get(key) : null;
  }

  setItem(key, value) {
    this.#items.set(String(key), String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}

export class MemoryLockManager {
  #tails = new Map();
  active = 0;
  maxActive = 0;

  async request(name, options, callback) {
    if (options?.mode !== 'exclusive') throw new Error('Only exclusive test locks are supported.');
    const previous = this.#tails.get(name) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    const tail = previous.then(() => current);
    this.#tails.set(name, tail);
    await previous;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      return await callback({name, mode:'exclusive'});
    } finally {
      this.active -= 1;
      release();
      if (this.#tails.get(name) === tail) this.#tails.delete(name);
    }
  }
}

export function installBrowserGlobals() {
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
  if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
  globalThis.localStorage = new MemoryStorage();
  const locks = new MemoryLockManager();
  Object.defineProperty(globalThis, 'navigator', {
    configurable:true,
    value:{locks}
  });
  return globalThis.localStorage;
}

export function legacyV1State() {
  return {
    schemaVersion:1,
    app:{name:'Aleena’s Money Moves', version:'1.0.0'},
    preferences:{monthlyIncome:4200},
    monthly:{selectedMonth:'2026-07', activeMonth:'2026-07'},
    categories:[
      {id:'groceries', name:'Groceries', group:'Needs', target:300, actual:125.5},
      {id:'travel', name:'Travel', group:'Goals', target:150, actual:40}
    ],
    providerSnapshot:{asOf:'2026-07-28', cashTotal:500, creditDebtTotal:100, netWorth:400},
    travel:{visited:[{id:'visited-1', city:'Richmond', state:'VA'}], destinations:[]},
    review:{buckets:[], transactions:[], merchantRules:[], importSettings:{}},
    scriptures:[]
  };
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

export async function createLegacyV1Envelope(state, passphrase, deriveKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, 600000);
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    {name:'AES-GCM', iv, additionalData:encoder.encode('Verdant Vault v1')},
    key,
    encoder.encode(JSON.stringify(state))
  );
  return JSON.stringify({
    version:1,
    product:'Aleena’s Money Moves',
    createdAt:'2026-07-30T00:00:00.000Z',
    updatedAt:'2026-07-30T00:00:00.000Z',
    kdf:{name:'PBKDF2', hash:'SHA-256', iterations:600000, salt:toBase64(salt)},
    cipher:{name:'AES-GCM', iv:toBase64(iv), aad:'Verdant Vault v1', ciphertext:toBase64(new Uint8Array(ciphertext))}
  });
}
