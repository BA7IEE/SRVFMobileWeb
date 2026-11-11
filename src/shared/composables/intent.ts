import { fail } from '../errors';
export type RetryPolicy = 'safe-read' | 'operation-key' | 'event-key' | 'version-only' | 'none';
export type IntentContext = { actor: string; epoch: number; operation: string; resource: string };
type IntentEntry = {
  body: string;
  result?: unknown;
  task?: Promise<unknown>;
  phase: 'submitting' | 'succeeded';
  context?: IntentContext;
  digest: string;
};
function digest(value: string) {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16).padStart(8, '0');
}
export class IntentRegistry {
  private entries = new Map<string, IntentEntry>();
  private files = new WeakMap<File, number>();
  private fileSerial = 0;
  private normalize(value: unknown): unknown {
    if (value instanceof File) {
      let id = this.files.get(value);
      if (!id) {
        id = ++this.fileSerial;
        this.files.set(value, id);
      }
      return { localFileIdentity: id };
    }
    if (Array.isArray(value)) return value.map((v) => this.normalize(v));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, this.normalize(v)]),
      );
    return value;
  }
  async execute<T>(
    key: string,
    body: unknown,
    fn: () => Promise<T>,
    context?: IntentContext,
  ): Promise<T> {
    const canonical = JSON.stringify(this.normalize(body));
    const old = this.entries.get(key);
    if (old) {
      if (
        context &&
        old.context &&
        (context.actor !== old.context.actor || context.epoch !== old.context.epoch)
      )
        throw fail('conflict', '该意图属于之前的身份会话，请重新核对');
      if (old.body !== canonical) throw fail('conflict', '同一操作不能改变原始内容');
      if (old.task) return old.task as Promise<T>;
      return old.result as T;
    }
    const entry: IntentEntry = {
      body: canonical,
      phase: 'submitting',
      context,
      digest: digest(canonical),
    };
    this.entries.set(key, entry);
    entry.task = fn()
      .then((result) => {
        entry.result = result;
        entry.phase = 'succeeded';
        entry.task = undefined;
        return result;
      })
      .catch((e) => {
        this.entries.delete(key);
        throw e;
      });
    return entry.task as Promise<T>;
  }
  clear() {
    this.entries.clear();
  }
}
