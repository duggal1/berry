const read=(k:string):string|null=>{try{return localStorage.getItem(k)}catch{return null}};
const write=(k:string,v:string|null)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch{}};
export type ShareRec={id:string;repo:string;at:number};
export const prefs={token:()=>read("re.token"),setToken:(t:string|null)=>write("re.token",t),lastUrl:()=>read("re.last"),setLastUrl:(u:string)=>write("re.last",u),shares():ShareRec[]{try{return JSON.parse(read("re.shares")??"[]")}catch{return []}},addShare(rec:ShareRec){write("re.shares",JSON.stringify([rec,...prefs.shares()].slice(0,50)))}};
