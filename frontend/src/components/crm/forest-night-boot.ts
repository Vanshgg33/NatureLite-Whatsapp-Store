/**
 * Runs before first paint so the page never flashes light, and picks the motion mode:
 *   full     default
 *   lite     low-power device (<=4 cores, <=4 GB RAM or data-saver): no infinite/ambient effects
 *   reduced  OS 'reduce motion' setting, or chosen by the user in Settings
 * Put at src/components/crm/forest-night-boot.ts (NOT a client file).
 */
export const FN_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
if(/^\\/crm(\\/|$)/.test(location.pathname))d.setAttribute('data-theme','forest-night');
var m=null;try{m=localStorage.getItem('fn-motion')}catch(e){}
if(m!=='full'&&m!=='lite'&&m!=='reduced'){
  var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var n=navigator,c=n.connection;
  var low=(n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(n.deviceMemory&&n.deviceMemory<=4)||(c&&c.saveData);
  m=rm?'reduced':(low?'lite':'full');
}
d.setAttribute('data-motion',m);
}catch(e){}})();`

// src/app/layout.tsx  (server component):
//   import { FN_BOOT_SCRIPT } from '@/components/crm/forest-night-boot'
//   <html lang="en" suppressHydrationWarning>
//     <head><script dangerouslySetInnerHTML={{ __html: FN_BOOT_SCRIPT }} /></head>
