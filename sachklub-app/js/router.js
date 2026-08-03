/* =========================================================
   router.js — hash router (bez cyklických importov)
   ========================================================= */

const bus = new EventTarget();

export const go = (hash) => {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target) refresh();
  else location.hash = target;
};

export const back = () => history.back();

export const refresh = () => bus.dispatchEvent(new Event('refresh'));

export const onRefresh = (fn) => bus.addEventListener('refresh', fn);

/** '#/ziaci/stu_123' -> { path: 'ziaci', param: 'stu_123' } */
export function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path = '', param = '', param2 = ''] = raw.split('/');
  return { path, param, param2, raw };
}
