// "Vasthouden om te bevestigen": een actie gaat pas af als je een knop
// ~0,6 s vasthoudt zonder te schuiven. Zo telt een schuivende broekzak of een
// losse tik niet. Zodra er twee of meer vingers/contactpunten tegelijk op het
// scherm zijn (hand, stof), worden alle lopende acties afgebroken.

const activePointers = new Set();
const activeHolds = new Set();

function cancelAll() {
  for (const cancel of [...activeHolds]) cancel();
}

document.addEventListener("pointerdown", (e) => {
  activePointers.add(e.pointerId);
  if (activePointers.size > 1) cancelAll();
}, true);

for (const type of ["pointerup", "pointercancel"]) {
  document.addEventListener(type, (e) => activePointers.delete(e.pointerId), true);
}

export function bindHold(el, { duration = 600, onHold, onTap, moveTolerance = 14 }) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let fired = false;

  el.style.setProperty("--hold-ms", `${duration}ms`);

  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    el.classList.remove("holding");
    activeHolds.delete(cancel);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    cancel();
    fired = false;
    if (activePointers.size > 1) return;
    startX = e.clientX;
    startY = e.clientY;
    el.classList.add("holding");
    activeHolds.add(cancel);
    timer = setTimeout(() => {
      fired = true;
      cancel();
      if ("vibrate" in navigator) navigator.vibrate(40);
      onHold?.();
    }, duration);
  });

  el.addEventListener("pointermove", (e) => {
    if (timer === null) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > moveTolerance) cancel();
  });

  el.addEventListener("pointerup", () => {
    const wasPending = timer !== null;
    cancel();
    if (wasPending && !fired) onTap?.();
  });

  el.addEventListener("pointerleave", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  // Toetsenbord/toegankelijkheid: Enter/spatie telt als vasthouden.
  el.addEventListener("click", (e) => {
    if (e.detail === 0) onHold?.();
  });
}
