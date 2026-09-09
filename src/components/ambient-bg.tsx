/**
 * Der ruhige, langsam driftende Farbnebel hinter der ganzen Oberfläche.
 * Rein dekorativ: liegt fest im Hintergrund, nimmt keine Klicks entgegen
 * und rendert serverseitig ohne State.
 */
export function AmbientBg() {
  return (
    <div className="kt-bg" aria-hidden="true">
      {/* Die grosse Wolke traegt die Hausfarbe: aendert man sie in den
          Einstellungen, aendert sich die Stimmung des ganzen Hintergrunds. */}
      <div className="kt-blob animate-driftA"
        style={{ width: 640, height: 640, top: "-16%", left: "-12%",
                 background: "var(--akzent, #E7A96B)" }} />
      <div className="kt-blob animate-driftB"
        style={{ width: 560, height: 560, bottom: "-18%", right: "-8%", background: "#5FC2A6" }} />
      <div className="kt-blob animate-driftC"
        style={{ width: 480, height: 480, top: "30%", right: "18%", background: "#6FA3D8" }} />
      <div className="kt-blob animate-driftC"
        style={{
          width: 340, height: 340, bottom: "20%", left: "22%", background: "#A38EDD",
          animationDirection: "alternate-reverse",
        }} />
      <div className="kt-grain" />
      <div className="kt-vignette" />
    </div>
  );
}
