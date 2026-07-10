/** Animated stage spotlights for Royal Reception Night. */
export default function ReceptionStageLights() {
  return (
    <div className="layout-reception-stage-lights pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div className="layout-reception-spotlight layout-reception-spotlight-left" />
      <div className="layout-reception-spotlight layout-reception-spotlight-center" />
      <div className="layout-reception-spotlight layout-reception-spotlight-right" />
      <div className="layout-reception-stage-floor" />
    </div>
  );
}
