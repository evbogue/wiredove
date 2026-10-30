// Explicit opt-in storage. Importing widgets never opens a database.
export function createBrowserStore(name = 'wiredove-embed') {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  async function run(mode, action) {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('state', mode);
      const request = action(transaction.objectStore('state'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error || request.error);
    });
  }
  return {
    get: key => run('readonly', store => store.get(key)),
    set: (key, value) => run('readwrite', store => store.put(value, key)),
    delete: key => run('readwrite', store => store.delete(key)),
  };
}
