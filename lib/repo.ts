export function parseRepo(input:string):string|null { const s=input.trim().replace(/\.git$/i,"").replace(/\/$/,""); const m=s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)\/([\w.-]+)(?:\/.*)?$/i) ?? s.match(/^([\w-]+)\/([\w.-]+)$/); return m ? `https://github.com/${m[1]}/${m[2]}` : null; }
export const slug=(repo:string)=>repo.replace(/[^\w.-]+/g,"-");
