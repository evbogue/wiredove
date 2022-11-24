const sockets = new Set()

export function send (m) {
  console.log(m)
  sockets.forEach(s => {
    s.send(m)
  })
}

export function addSocket (s) {
  sockets.add(s)
}

export function rmSocket (s) {
  sockets.delete(s)
}

