import type { CSSProperties, ReactNode, SVGProps } from 'react';
import { DEFS, FACTIONS, type Faction, type UnitKind } from '../game/units';

/* Flat 2D unit glyphs on a 24px grid. Solid shapes use the current colour; details are cut out in the card colour. */
const CUT = '#141d15';
const F = { fill: 'currentColor', stroke: 'none' };
const D = { fill: CUT, stroke: 'none' };

const GLYPHS: Record<string, ReactNode> = {
  spear: <><path d="M4 20 L14.5 9.5" /><path d="M14 5 h5 v5 l-2 -2 l-2.4 2.4 Z" {...F} /></>,
  shield: <><path d="M12 3 L19 6 V12 C19 16.5 16 19.5 12 21 C8 19.5 5 16.5 5 12 V6 Z" {...F} /><path d="M12 7 V17 M8 11 H16" stroke={CUT} strokeWidth="1.6" /></>,
  bow: <><path d="M7 3 C 15 8 15 16 7 21" /><path d="M7 3 L7 21" /><path d="M8 12 L19 12" /><path d="M16.5 9.5 L20 12 L16.5 14.5 Z" {...F} /></>,
  crossbow: <><path d="M3.5 9 C 8 4.5 16 4.5 20.5 9" /><path d="M12 6.5 V20" strokeWidth="2.4" /><path d="M9.5 20 h5" /><path d="M12 3 l2 3 h-4 Z" {...F} /></>,
  sword: <><path d="M5 19 L16.5 7.5" strokeWidth="2.4" /><path d="M16.5 7.5 L20 4 L19.2 8.8 Z" {...F} /><path d="M6.5 13.5 l4 4" strokeWidth="2.2" /></>,
  halberd: <><path d="M6 21 L16 11" /><path d="M15.5 5.5 c 3.5 -2 7 0 7.5 3 c -2 -0.5 -3.5 0 -4.5 1 Z" {...F} /><path d="M14 9 l3 3" strokeWidth="2.2" /></>,
  horse: <><path d="M5 20 L18.5 6.5" /><path d="M17 3.5 h4 v4 l-1.7 -1.7 l-2.6 2.6 Z" {...F} /><path d="M7 8.5 l5.4 2.7 v4.4 c0 2.8 -2.7 4.4 -2.7 4.4 s -2.7 -1.6 -2.7 -4.4 Z" {...F} /></>,
  paladin: <><path d="M12 3 L12 21" strokeWidth="2.4" /><path d="M7 8 h10" strokeWidth="2.4" /><path d="M12 6.5 l1.6 1.6 M12 6.5 l-1.6 1.6" /><circle cx="12" cy="12" r="7.5" /></>,
  crown: <><path d="M4 18 L5.5 8 L10 12 L12 5 L14 12 L18.5 8 L20 18 Z" {...F} /><path d="M4 20 h16" /></>,

  axe: <><path d="M5 20 L14.5 10" /><path d="M11.5 4.5 c 3.5 -2.5 8 -1.5 9.5 2.5 c -2 -0.8 -4 -0.6 -5.5 0.3 l -4.5 -1.2 Z" {...F} /></>,
  axes: <><path d="M4 20 L13 6 M20 20 L11 6" /><path d="M13 4 c 3 -1.5 6 0 6.5 3 c -2 -0.5 -3.5 0 -4.5 1 Z" {...F} /><path d="M11 4 c -3 -1.5 -6 0 -6.5 3 c 2 -0.5 3.5 0 4.5 1 Z" {...F} /></>,
  javelin: <><path d="M4 20 L18.5 5.5" /><path d="M18 2 h4 v4 l-2 -1.6 l-2.4 2.4 Z" {...F} /></>,
  bomb: <><circle cx="11" cy="14" r="6.2" {...F} /><path d="M14.5 8.8 L17.5 5.5" /><path d="M18 3 v3 M16 4.5 h4 M16.7 3.2 l2.6 2.6 M19.3 3.2 l-2.6 2.6" strokeWidth="1.2" /></>,
  shaman: <><path d="M12 21 V11" /><circle cx="12" cy="8" r="2.6" {...F} /><path d="M9 4 c 1.5 1.5 4.5 1.5 6 0 M8 6.5 c 2 2 6 2 8 0" strokeWidth="1.2" /></>,
  club: <><path d="M6 20 L10.8 13.6" strokeWidth="2.6" /><path d="M11.6 12.6 L16.8 6.2" strokeWidth="6.4" /><circle cx="12.8" cy="11.2" r="0.9" {...D} /><circle cx="14.9" cy="8.6" r="0.9" {...D} /><circle cx="17" cy="6" r="0.9" {...D} /></>,
  giant: <><circle cx="12" cy="12" r="5" /><path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5.5 5.5 l2 2 M16.5 16.5 l2 2 M18.5 5.5 l-2 2 M7.5 16.5 l-2 2" strokeWidth="1.6" /></>,
  pirate: <><path d="M6 13 C 6 8 18 8 18 13 C 16 15 8 15 6 13 Z" {...F} /><path d="M4 13 h16" /><circle cx="12" cy="10.4" r="1.2" {...D} /></>,
  keg: <><path d="M7.5 9 C7.5 7.4 16.5 7.4 16.5 9 V19 C16.5 20.6 7.5 20.6 7.5 19 Z" {...F} /><path d="M7.5 12 h9 M7.5 16 h9" stroke={CUT} strokeWidth="1.2" /><path d="M12 7.6 C12 5 14.5 5.6 15.5 3.6" strokeWidth="1.4" /><path d="M17 1.8 v2.6 M15.7 3.1 h2.6" strokeWidth="1.1" /></>,

  leafbow: <><path d="M8 3 C 15 8 15 16 8 21" /><path d="M8 3 L8 21" /><path d="M19 12 c -2.2 -3.4 -6.4 -3.4 -8.6 0 c 2.2 3.4 6.4 3.4 8.6 0 Z" {...F} /></>,
  fist: <><path d="M7.5 20.5 L13 8.5" strokeWidth="3.2" /><circle cx="15.2" cy="6.3" r="3.8" {...F} /><path d="M13 4.5 l1 1 M16 3.5 l0.5 1.5 M17.5 6 l1.5 0.5" stroke={CUT} strokeWidth="1.1" /></>,
  dagger: <><path d="M12 2.5 L14.7 12.5 H9.3 Z" {...F} /><path d="M7.8 13 h8.4" strokeWidth="2" /><path d="M12 14 V19" strokeWidth="2.4" /><circle cx="12" cy="20.4" r="1.4" {...F} /></>,
  orb: <><path d="M7.5 21 L13.5 6.5" /><circle cx="14.6" cy="5" r="2.7" {...F} /><path d="M19.5 8.5 l2 -1 M18.5 13.5 l2.2 0.8 M20 11 l1.5 -0.5" strokeWidth="1.4" /></>,
  frost: <><path d="M12 2 v20 M4 6 l16 12 M20 6 L4 18" strokeWidth="1.6" /><path d="M12 6 l2 2 -2 2 -2 -2 Z M12 14 l2 2 -2 2 -2 -2 Z" {...F} /></>,
  cross: <><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5 V17.5 M6.5 12 H17.5" strokeWidth="2.6" /></>,
  zeus: <path d="M13 2 L6 12 h5 l-2 10 l8 -12 h-5 Z" {...F} />,

  skull: <><path d="M12 3 a7 7 0 0 0 -7 7 v4.2 l 3 1.8 v 3 h 8 v -3 l 3 -1.8 v -4.2 a7 7 0 0 0 -7 -7z" {...F} /><circle cx="9.4" cy="10.5" r="1.7" {...D} /><circle cx="14.6" cy="10.5" r="1.7" {...D} /><path d="M10.2 16.6 v2.4 M12 16.6 v2.4 M13.8 16.6 v2.4" stroke={CUT} strokeWidth="1" /></>,
  bone: <><path d="M7 17 L17 7" strokeWidth="2.6" /><circle cx="5.8" cy="15.5" r="1.9" {...F} /><circle cx="8.5" cy="18.2" r="1.9" {...F} /><circle cx="18.2" cy="8.5" r="1.9" {...F} /><circle cx="15.5" cy="5.8" r="1.9" {...F} /></>,
  boneshot: <><path d="M6 4 L18 20" strokeWidth="2.2" /><path d="M18 6 C 13 9 13 15 18 18" /><path d="M18 6 L18 18" /></>,
  vampire: <><path d="M12 3 C 8 6 6 10 6 14 a6 6 0 0 0 12 0 C18 10 16 6 12 3 Z" {...F} /><path d="M10 13 l-1.5 2 M14 13 l1.5 2" stroke={CUT} strokeWidth="1.4" /></>,
  staff: <><path d="M7 21 L12.2 10" strokeWidth="1.9" /><path d="M14 2.5 a4.2 4.2 0 0 0 -4.2 4.2 v1.8 l1.6 1 v1.5 h5.2 v-1.5 l1.6 -1 V6.7 A4.2 4.2 0 0 0 14 2.5 Z" {...F} /><circle cx="12.5" cy="6.8" r="1" {...D} /><circle cx="15.5" cy="6.8" r="1" {...D} /><path d="M19.5 13 c1.6 1.2 1.6 3.2 0 4.4 M16.3 15.6 c1.2 1 1.2 2.6 0 3.6" strokeWidth="1.2" /></>,

  robot: <><rect x="5" y="8" width="14" height="11" rx="2" {...F} /><path d="M9 12 h2 M13 12 h2" stroke={CUT} strokeWidth="1.6" /><path d="M12 8 V5" /><circle cx="12" cy="4" r="1.2" {...F} /><path d="M8 19 v3 M16 19 v3" /></>,
  tank: <><rect x="3" y="13" width="18" height="6" rx="2" {...F} /><path d="M6 13 V9 h8 v4" /><path d="M14 11 h7" strokeWidth="2.4" /><circle cx="7" cy="16" r="1.2" {...D} /><circle cx="12" cy="16" r="1.2" {...D} /><circle cx="17" cy="16" r="1.2" {...D} /></>,
  railgun: <><path d="M3 13 h13" strokeWidth="2.6" /><path d="M16 10 h5 v3 h-5 z" {...F} /><path d="M8 9 v8 M5 9 v8" strokeWidth="1.6" /><circle cx="18" cy="11.5" r="0.9" {...D} /></>,
  catapult: <><path d="M3.5 20 h17" /><path d="M8 20 L12 11.5 L16 20" /><path d="M5 16.5 L18.5 7" strokeWidth="2.2" /><circle cx="19.2" cy="6" r="2.6" {...F} /><path d="M4 15.2 l2.2 2.8" strokeWidth="2.6" /></>,

  hoplite: <><circle cx="10" cy="13" r="6.5" {...F} /><path d="M7 13 l3 -3.4 l3 3.4" stroke={CUT} strokeWidth="1.6" /><path d="M14 10 L21 3" strokeWidth="2" /><path d="M19 2.5 h2.5 v2.5 Z" {...F} /></>,
  katana: <><path d="M4 20 C 10 17 16 11 20 3" strokeWidth="2.2" /><path d="M5.5 15.5 l4 4" strokeWidth="2.4" /><path d="M20 3 l-0.4 3.2 l-2.2 -1.6 Z" {...F} /></>,
  shuriken: <><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" {...F} /><circle cx="12" cy="12" r="1.6" {...D} /></>,
  harpoon: <><path d="M4 20 L17 7" strokeWidth="2" /><path d="M20.5 3.5 L19 9.5 L17 7 L14.5 5 Z" {...F} /><path d="M13 8 l-2.5 -0.5 M16 11 l0.5 2.5" /><path d="M4 20 c 3 1.5 5 -2 8 -0.5 s 4 1.5 7 0" strokeWidth="1.2" /></>,
  snake: <><path d="M6 20 c 8 0 9 -4 5 -6 s -4 -6 4 -7" strokeWidth="2.6" /><path d="M15 4.5 l4.5 0.5 l-1 3.5 l-3.5 -1 Z" {...F} /><path d="M19.5 5.5 l2 -1 M19.5 6 l2 1" strokeWidth="1" /></>,
  wing: <><path d="M12 20 C 6 17 3 11 3 4 c 3 2 6 3 9 7 c 3 -4 6 -5 9 -7 c 0 7 -3 13 -9 16 Z" {...F} /><path d="M12 11 V20" stroke={CUT} strokeWidth="1.3" /></>,
  fan: <><path d="M12 20 L3 9 C 6 4.5 18 4.5 21 9 Z" {...F} /><path d="M12 20 L7.5 6.5 M12 20 V5.5 M12 20 L16.5 6.5" stroke={CUT} strokeWidth="1.1" /><circle cx="12" cy="20" r="1.4" {...F} /></>,
  rocket: <><rect x="4" y="9" width="12" height="8" rx="1" {...F} /><path d="M7 12 h1 M10 12 h1 M13 12 h1 M7 14.5 h1 M10 14.5 h1 M13 14.5 h1" stroke={CUT} strokeWidth="1.4" /><circle cx="8" cy="19.5" r="2" /><path d="M16 9 l4 -5 M18 11 l4 -3 M17.5 6.5 l1.5 -3" strokeWidth="1.3" /></>,
  mammoth: <><path d="M5 19 V11 a6 6 0 0 1 12 0 v8 h-3 v-4 h-5 v4 Z" {...F} /><path d="M17 10 c 3 0 4 3 3 6" strokeWidth="2" /><path d="M15 14 c 2 3 5 3 6 0" strokeWidth="1.5" /><circle cx="14" cy="10" r="0.9" {...D} /></>,
};

/** Units that would otherwise share a glyph with another unit get their own. */
const KIND_GLYPH: Partial<Record<UnitKind, string>> = { troll: 'club', sapper: 'keg', necromancer: 'staff', catapult: 'catapult' };
const FACTION_COLOR = Object.fromEntries(FACTIONS.map(faction => [faction.id, faction.color])) as Record<Faction, string>;

export function UnitGlyph({ kind, ...props }: { kind: UnitKind } & SVGProps<SVGSVGElement>) {
  const glyph = GLYPHS[KIND_GLYPH[kind] ?? DEFS[kind].icon] ?? GLYPHS.shield;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{glyph}</svg>;
}

/** The glyph on a faction-coloured hexagonal plate: the 2D token used throughout deployment. */
export function UnitEmblem({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  return <svg className={`unit-emblem ${className}`} viewBox="0 0 56 56" aria-hidden="true" style={{ '--emblem': FACTION_COLOR[DEFS[kind].faction] } as CSSProperties}>
    <path className="emblem-plate" d="M28 3.5 49.2 15.75v24.5L28 52.5 6.8 40.25v-24.5Z" />
    <path className="emblem-rim" d="M28 8 45.3 18v20L28 48 10.7 38V18Z" />
    <UnitGlyph kind={kind} x={11.5} y={11.5} width={33} height={33} />
  </svg>;
}
