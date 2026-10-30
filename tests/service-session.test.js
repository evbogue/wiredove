import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServiceSession } from '../client/runtime/service-session.js'

test('concurrent leases start once, keep services alive until last release and restart without reopening storage', async () => {
  const events = []
  const session = createServiceSession({
    startStorage: async name => events.push('storage:' + name),
    startServices: async () => { events.push('start'); return async () => events.push('stop') },
    flushStorage: async () => events.push('flush'),
  })
  const [a,b] = await Promise.all([session.acquire('existing-db'), session.acquire('existing-db')])
  await assert.rejects(session.acquire('another-db'), /another database/)
  await a.release()
  assert.deepEqual(events, ['storage:existing-db','start'])
  let unblock
  const held = b.runExclusive(async () => { events.push('write'); await new Promise(resolve => { unblock = resolve }); events.push('persisted') })
  await new Promise(resolve => setImmediate(resolve))
  const stopped = b.release()
  await assert.rejects(b.runExclusive(async () => {}), /released/)
  assert.equal(events.includes('stop'), false)
  unblock()
  await held
  await stopped
  await b.release()
  assert.deepEqual(events, ['storage:existing-db','start','write','persisted','stop','flush'])
  const c = await session.acquire('existing-db')
  await c.release()
  assert.deepEqual(events.slice(-3), ['start','stop','flush'])
  assert.equal(events.filter(e => e.startsWith('storage:')).length, 1)
})

test('serialized signing preserves a shared author chain and recovers after failure', async () => {
  let previous = 'genesis'
  const session = createServiceSession({ startStorage: async () => {}, startServices: async () => {} })
  const [a,b] = await Promise.all([session.acquire('db'),session.acquire('db')])
  const publish = (lease,id) => lease.runExclusive(async () => {
    const parent = previous
    await new Promise(resolve => setImmediate(resolve))
    previous = id
    return {id, previous:parent}
  })
  assert.deepEqual(await Promise.all([publish(a,'first'),publish(b,'second')]), [
    {id:'first',previous:'genesis'},{id:'second',previous:'first'},
  ])
  await assert.rejects(a.runExclusive(async () => { throw Error('failed persistence') }), /persistence/)
  assert.deepEqual(await publish(b,'third'), {id:'third',previous:'second'})
  await Promise.all([a.release(),b.release()])
})

test('a partially failed storage startup is never repeated; service startup failure can retry', async () => {
  let starts = 0
  const broken = createServiceSession({startStorage:async()=>{starts++;throw Error('storage failed')},startServices:async()=>{throw Error('must not run')}})
  await assert.rejects(broken.acquire('db'), /storage failed/)
  await assert.rejects(broken.acquire('db'), /storage failed/)
  assert.equal(starts,1)
  let services = 0
  const session = createServiceSession({startStorage:async()=>{},startServices:async()=>{if(++services===1)throw Error('connection failed')}})
  await assert.rejects(session.acquire('db'), /connection failed/)
  await (await session.acquire('db')).release()
  assert.equal(services,2)
})

test('pausing network delivery preserves exact queued bytes for a later lease', async () => {
  const queue = await import('../network_queue.js?service-session-test')
  const delivered = []
  queue.registerNetworkSenders({sendWs: value => delivered.push(value), hasWs: () => true,
    sendGossip: value => delivered.push(value), hasGossip: () => true})
  queue.pauseQueue()
  const exact = 'signed fixture bytes with immutable previous reference'
  queue.queueSend(exact)
  await new Promise(resolve => setTimeout(resolve,20))
  assert.deepEqual(delivered,[])
  assert.equal(queue.getQueueSize(),1)
  queue.resumeQueue()
  await new Promise(resolve => setTimeout(resolve,20))
  assert.deepEqual(delivered,[exact,exact])
  assert.equal(queue.getQueueSize(),0)
  queue.clearQueue()
})

test('sync stop cancels an unfinished start and prevents stale ticks from sending', async () => {
  const { readFile } = await import('node:fs/promises')
  const { SourceTextModule, SyntheticModule, createContext } = await import('node:vm')
  const source = await readFile(new URL('../sync.js', import.meta.url),'utf8')
  const timers = new Map()
  let resolveKeys
  const keys = new Promise(resolve => { resolveKeys = resolve })
  const author = 'a'.repeat(44)
  const apds = {getPubkeys:()=>keys,getLatest:async()=>({opened:String(Date.now())+'content'})}
  const context = createContext({Date,console,setInterval:fn=>{timers.set(1,fn);return 1},clearInterval:id=>timers.delete(id)})
  const module = new SourceTextModule(source,{context})
  await module.link(name => new SyntheticModule(name==='apds'?['apds']:['isBlockedAuthor'],function(){
    this.setExport(name==='apds'?'apds':'isBlockedAuthor',name==='apds'?apds:async()=>false)
  },{context}))
  await module.evaluate()
  const sync = module.namespace
  const sent = []
  const pending = sync.startSync(value=>sent.push(value))
  sync.stopSync()
  resolveKeys([author])
  await pending
  assert.equal(timers.size,0)
  await sync.startSync(value=>sent.push(value))
  const tick = timers.get(1)
  await tick()
  assert.deepEqual(sent,[author])
  sync.stopSync()
  assert.equal(timers.size,0)
  await tick()
  assert.deepEqual(sent,[author])
})
