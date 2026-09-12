import type { SurfaceProfile } from '../types/surface';
export const surfaces: SurfaceProfile[] = [
 {id:'mobilePortrait',name:'Mobile Portrait',width:320,height:480,safeArea:{top:16,right:16,bottom:16,left:16},minTapTarget:44,minTextSize:16,viewingDistance:'near',touchOnly:true},
 {id:'mobileLandscape',name:'Mobile Landscape',width:480,height:320,safeArea:{top:14,right:16,bottom:14,left:16},minTapTarget:44,minTextSize:16,viewingDistance:'near',touchOnly:true},
 {id:'broadcastLowerThird',name:'Broadcast Lower Third',width:1920,height:250,safeArea:{top:16,right:48,bottom:16,left:48},minTapTarget:0,minTextSize:32,viewingDistance:'far',touchOnly:false},
 {id:'retailKiosk',name:'Retail Kiosk',width:1080,height:1080,safeArea:{top:32,right:32,bottom:32,left:32},minTapTarget:60,minTextSize:20,viewingDistance:'near',touchOnly:true},
 // Intentionally the tightest required surface: at full priority there is
 // not enough safe-area height for all five elements at the touch/text
 // minimums the other surfaces also use. This is the profile that proves
 // the priority-degradation pass actually runs — branding is dropped
 // cleanly while headline/CTA stay intact, per the assignment's own
 // "shrink until branding must be dropped" example.
 {id:'compactWidget',name:'Compact Widget',width:400,height:360,safeArea:{top:32,right:32,bottom:32,left:32},minTapTarget:60,minTextSize:20,viewingDistance:'near',touchOnly:true}
];
export const unknownSurface: SurfaceProfile = {id:'unknown-713x287',name:'Unknown 713 × 287',width:713,height:287,safeArea:{top:10,right:12,bottom:10,left:12},minTapTarget:44,minTextSize:17,viewingDistance:'near',touchOnly:true};