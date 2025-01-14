export const ntfy = async (sig) => {
  fetch('https://ntfy.sh/wiredove', {
    method: 'POST', 
    body: 'https://wiredove.net/#' + sig
  })
}
