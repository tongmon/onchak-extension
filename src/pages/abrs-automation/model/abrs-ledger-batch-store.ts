const DATABASE_NAME = 'onchak-abrs-ledger-files';
const STORE_NAME = 'batches';
const batchOperations = new Map<string, Promise<unknown>>();

/** Keep each batch's read/modify/write sequence together across extension windows. */
export function serializeAbrsLedgerBatchOperation<T>(storageKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = batchOperations.get(storageKey) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  batchOperations.set(storageKey, current);
  const release = () => {
    if (batchOperations.get(storageKey) === current) batchOperations.delete(storageKey);
  };
  void current.then(release, release);
  return current;
}

function openBatchDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('장부 파일 저장소를 사용할 수 없습니다. 확장 프로그램을 다시 열어주세요.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('장부 파일 저장소를 열지 못했습니다.'));
    request.onblocked = () => reject(new Error('장부 파일 저장소 업데이트가 대기 중입니다. 확장 프로그램 창을 닫고 다시 열어주세요.'));
  });
}

async function accessBatchValue<T>(storageKey: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openBatchDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('장부 파일 저장 작업이 취소되었습니다.')); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? request.error ?? new Error('장부 파일 저장에 실패했습니다.')); };
    void storageKey;
  });
}

export function getAbrsLedgerBatchValue(storageKey: string): Promise<unknown> {
  return accessBatchValue(storageKey, 'readonly', (store) => store.get(storageKey));
}
export async function setAbrsLedgerBatchValue(storageKey: string, batch: unknown): Promise<void> {
  await accessBatchValue(storageKey, 'readwrite', (store) => store.put(batch, storageKey));
}
export async function removeAbrsLedgerBatchValue(storageKey: string): Promise<void> {
  await accessBatchValue(storageKey, 'readwrite', (store) => store.delete(storageKey));
}
