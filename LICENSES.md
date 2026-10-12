# Licenses

| Component | Path | License | Notes |
|---|---|---|---|
| chess.js 0.12.1 (Jeff Hlywa) | vendor/chess.js | BSD-2-Clause | Full text in vendor/chess.js.LICENSE. Unmodified. Fetched from the npm registry. |
| TCZ Ground Game V1 code (rules, engine, sprites, UI, tests) | src/, tools/, tests/ | Original, unlicensed (private, CFD-100 / The Chess Zone) | Written from the game bible and the Grok thread spec. No code copied from Grok's lost prototype or any other game. |
| Seed data | data/seeds.js (from data/TCZ_Ground_Game_P1_Seed_Desk.xlsx) | House data (The Chess Zone) | Teaching-shape FENs from the P1 seed desk, not archive games. |
| OpenStreetMap map data (Kane, PA and Bradford, PA cores) | data/osm/kane-core.osm.xml, data/osm/bradford/bradford-core.osm.xml (raw); data/world/kane.js, data/world/bradford.js (derived tiles + POIs) | **ODbL 1.0** | © OpenStreetMap contributors. https://www.openstreetmap.org/copyright. Attribution is shown on the game canvas and in Credits. The derived tile grid is a Derivative Database under ODbL: if it's shared publicly, it has to be offered under ODbL. |
| Region polygons | data/regions/*.geojson | House data | NW PA regions supplied by Chad A (Bradford and Kane areas). |
| Character registry + portraits | data/characters.js, assets/portraits/ | House data (The Chess Zone) | Generated from the TCZ character registry. Portraits ship only for locked rows. |
| playwright-core (dev only, not shipped) | node_modules/ | Apache-2.0 | Used only by tools/smoke.js. Not in dist/. |

The opponent engine is an original alpha-beta search (src/engine.js). No Stockfish or other engine is bundled.
No fonts or sounds are bundled. Pixel art is generated in code from the seed id. The only bundled images are house portraits for locked registry rows.
