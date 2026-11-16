/**
 * Slow pools of coloured light behind every page, public and editorial alike.
 *
 * One fixed layer mounted once in the root layout, painted under the document
 * and never interactive. The animation lives entirely in CSS, with no
 * JavaScript timers, and stays mounted through client-side navigation. Each
 * light is a static radial gradient moved with `transform`. Above the colour sits a
 * milky white wash and a fine grain, so the paper still reads as paper and
 * foreground contrast never depends on whatever hue happens to drift underneath.
 */
export function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <div className="ambient-light ambient-light-rose" />
      <div className="ambient-light ambient-light-amber" />
      <div className="ambient-light ambient-light-mint" />
      <div className="ambient-light ambient-light-sky" />
      <div className="ambient-light ambient-light-lavender" />
      <div className="ambient-light ambient-light-peach" />
      <div className="ambient-light ambient-light-aqua" />
      <div className="ambient-wash" />
      <div className="ambient-grain" />
      <div className="ambient-grain ambient-grain-fine" />
    </div>
  );
}
