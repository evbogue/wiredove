import { bogbot } from 'bogbot'

export let ar = []

export const archive = {}

archive.get = async (hash) => {
  if (hash) {
    return ar.filter(entry => entry === hash)
  } else {
    const a = await bogbot.get('archive')

    if (a) { 
      ar = a 
      console.log(ar)
      return ar
    } else {return ar} 
  } 
}

archive.add = async (hash) => {
  ar.push(hash)
  await bogbot.put('archive', ar)
}

archive.rm = async (hash) => {
  ar = ar.filter(entry => entry != hash)
}
