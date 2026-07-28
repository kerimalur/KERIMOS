import type { WeatherIconName } from "@/lib/weather";

/**
 * Wettersymbole als Strichzeichnung — dieselbe Linienstärke wie die übrige
 * Oberfläche, keine Emoji. Farben kommen aus dem Aufrufer (currentColor),
 * Sonne und Mond setzen sich bewusst warm bzw. kühl ab.
 */
export function WeatherIcon({
  name, className = "h-8 w-8",
}: {
  name: WeatherIconName;
  className?: string;
}) {
  const stroke = {
    fill: "none" as const,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const sonne = (cx: number, cy: number, r: number) => (
    <g stroke="#C68D6B" {...stroke}>
      <circle cx={cx} cy={cy} r={r} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={cx + Math.cos(rad) * (r + 2.5)} y1={cy + Math.sin(rad) * (r + 2.5)}
            x2={cx + Math.cos(rad) * (r + 5)} y2={cy + Math.sin(rad) * (r + 5)} />
        );
      })}
    </g>
  );

  const mond = (cx: number, cy: number, r: number) => (
    <path
      d={`M ${cx + r * 0.55} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.75} ${r * 1.5}
          a ${r * 0.85} ${r * 0.85} 0 1 1 ${-r * 0.75} ${-r * 1.5} z`}
      stroke="#8FA6B8" {...stroke} />
  );

  const wolke = (dx = 0, dy = 0, farbe = "#8A8478") => (
    <path
      d={`M ${8 + dx} ${26 + dy} h ${13} a 5.5 5.5 0 0 0 0.6 -10.9
          a 7.5 7.5 0 0 0 -14 -2.4 a 5.8 5.8 0 0 0 0.4 13.3 z`}
      stroke={farbe} {...stroke} />
  );

  const tropfen = (xs: number[]) => (
    <g stroke="#8FA6B8" {...stroke}>
      {xs.map((x) => <line key={x} x1={x} y1={29} x2={x - 2} y2={34} />)}
    </g>
  );

  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      {name === "sonne" && sonne(20, 20, 7)}
      {name === "mond" && mond(20, 20, 8)}
      {name === "wolke" && wolke(4, 0)}
      {name === "wolke-sonne" && (<>{sonne(27, 13, 5)}{wolke(2, 2)}</>)}
      {name === "wolke-mond" && (<>{mond(27, 13, 5.5)}{wolke(2, 2)}</>)}
      {name === "regen" && (<>{wolke(4, -3)}{tropfen([15, 22, 29])}</>)}
      {name === "schnee" && (
        <>
          {wolke(4, -3)}
          <g stroke="#8FA6B8" {...stroke}>
            {[15, 22, 29].map((x) => (
              <g key={x}>
                <line x1={x - 2} y1={31} x2={x + 2} y2={31} />
                <line x1={x} y1={29} x2={x} y2={33} />
              </g>
            ))}
          </g>
        </>
      )}
      {name === "gewitter" && (
        <>
          {wolke(4, -3)}
          <path d="M 21 28 l -4 6 h 4 l -2 5" stroke="#C68D6B" {...stroke} />
        </>
      )}
      {name === "nebel" && (
        <g stroke="#A8A093" {...stroke}>
          {[14, 20, 26].map((y) => <line key={y} x1={9} y1={y} x2={31} y2={y} />)}
          <line x1={13} y1={32} x2={27} y2={32} />
        </g>
      )}
    </svg>
  );
}
