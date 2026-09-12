export interface Rect { x:number;y:number;width:number;height:number; }
export const finite = (n:number) => Number.isFinite(n) && n >= 0;
export const overlaps = (a:Rect,b:Rect) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
export const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
export const usable = (width:number,height:number,safe:{top:number;right:number;bottom:number;left:number}) => ({left:safe.left,top:safe.top,right:width-safe.right,bottom:height-safe.bottom,width:Math.max(0,width-safe.left-safe.right),height:Math.max(0,height-safe.top-safe.bottom)});
