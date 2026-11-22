/** Save locally generated or authenticated bytes using the browser or Electron download manager. */
export function downloadBlob(bytes:Blob,filename:string){
  const url=URL.createObjectURL(bytes),link=document.createElement('a')
  link.href=url;link.download=filename;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
