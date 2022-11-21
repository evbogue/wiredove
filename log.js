import { cachekv } from './lib/cachekv.js'

let log = []

cachekv.get('log').then(file => {
  if (file) {
    log = JSON.parse(file)
  }
})

function save () {
  cachekv.put('log', JSON.stringify(log))
}

export const logs = function (query) {
  return {
    getLog: async function () {
      return log
    },
    add: function (msg) {
      if (!log.includes(msg)) {
        log.push(msg)
        save()
      }
    }
  }
}()
