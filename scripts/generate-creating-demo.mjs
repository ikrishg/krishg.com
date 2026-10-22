/**
 * Generates src/data/creating-demo.json (30 demo entries, 6 per category).
 */
import { writeFile } from "node:fs/promises";

const categories = [
  "poetry",
  "prose",
  "photography",
  "paintings",
  "design",
];

const titles = {
  poetry: [
    "Draft: platform at dusk",
    "Notes toward a sonnet",
    "Commuter hymn",
    "Rain on the fire escape",
    "Ledger of small mercies",
    "Unsent stanza",
  ],
  prose: [
    "Field notes from a late train",
    "On keeping a commonplace book",
    "Letter to a future collaborator",
    "Margins of a user manual",
    "Walking home through fog",
    "A room with two desks",
  ],
  photography: [
    "Fluorescent aisle, 7am",
    "Portrait under stairwell light",
    "Wet pavement, amber signal",
    "Still life with tape measure",
    "Bus window condensation",
    "Corner store after rain",
  ],
  paintings: [
    "Study in cadmium wash",
    "Interior with open door",
    "Figure at half resolution",
    "Palette knife horizon",
    "Negative space exercise",
    "Glaze over graphite grid",
  ],
  design: [
    "Poster system v0.3",
    "Type specimen: tight grotesk",
    "Wireframe for a reading room",
    "Brand mark explorations",
    "Deck layout for a workshop",
    "Icon grid for a civic app",
  ],
};

const years = [2016, 2018, 2019, 2020, 2022, 2024, 2025];
const ratios = [
  [400, 600],
  [600, 400],
  [500, 500],
  [480, 720],
  [720, 480],
  [560, 560],
];

let order = 0;
const entries = [];

for (const category of categories) {
  titles[category].forEach((title, i) => {
    order += 1;
    const [w, h] = ratios[i % ratios.length];
    const seed = `${category}-${i + 1}`;
    entries.push({
      id: `demo-${category}-${String(i + 1).padStart(2, "0")}`,
      demo: true,
      title,
      subtitle: `Demo ${category} piece ${i + 1}`,
      year: years[(order + i) % years.length],
      category,
      medium: `Demo ${category}`,
      order,
      cover: `https://picsum.photos/seed/${seed}/${w}/${h}`,
      body: `Demo blurb for testing the gallery. This ${category} entry is synthetic data marked demo: true. Replace with real work from the content collection later.`,
      published: `${years[(order + i) % years.length]}-${String((i % 12) + 1).padStart(2, "0")}-15`,
    });
  });
}

await writeFile(
  "src/data/creating-demo.json",
  JSON.stringify({ entries }, null, 2),
);
console.log(`Wrote ${entries.length} demo entries`);
