'use client'
import { useEffect } from 'react'
export default function PwaRegister() {
 useEffect(()=>{
  if('serviceWorker' in navigator) {
   navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>reg.update()).catch(error=>console.error('SW register failed:',error))
  }
 },[])
 return null
}
