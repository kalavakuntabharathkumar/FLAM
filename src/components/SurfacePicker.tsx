import type { SurfaceProfile } from '../types/surface';
export function SurfacePicker({surfaces,selected,onSelect}:{surfaces:SurfaceProfile[];selected:string;onSelect:(id:string)=>void}){return <div className="surface-picker">{surfaces.map(s=><button key={s.id} className={s.id===selected?'active':''} onClick={()=>onSelect(s.id)}>{s.name}<small>{s.width} × {s.height}</small></button>)}</div>}
