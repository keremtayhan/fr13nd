// Pure zodiac math — Western sun sign from month/day, Chinese animal+element from year.
// No data dependencies; used by the STARS sidecar and the daily read.

const WESTERN = [
  { sign: 'Capricorn', sym: '♑', end: 19 }, // Jan
  { sign: 'Aquarius', sym: '♒', end: 18 }, // Feb
  { sign: 'Pisces', sym: '♓', end: 20 }, // Mar
  { sign: 'Aries', sym: '♈', end: 19 }, // Apr
  { sign: 'Taurus', sym: '♉', end: 20 }, // May
  { sign: 'Gemini', sym: '♊', end: 20 }, // Jun
  { sign: 'Cancer', sym: '♋', end: 22 }, // Jul
  { sign: 'Leo', sym: '♌', end: 22 }, // Aug
  { sign: 'Virgo', sym: '♍', end: 22 }, // Sep
  { sign: 'Libra', sym: '♎', end: 22 }, // Oct
  { sign: 'Scorpio', sym: '♏', end: 21 }, // Nov
  { sign: 'Sagittarius', sym: '♐', end: 21 }, // Dec
  { sign: 'Capricorn', sym: '♑', end: 31 }, // Dec wrap
];

export function westernSign(month: number, day: number): { sign: string; sym: string } {
  const m = Math.min(12, Math.max(1, Math.round(month)));
  const here = WESTERN[m - 1];
  const picked = day <= here.end ? here : WESTERN[m]; // after the cutoff → next sign
  return { sign: picked.sign, sym: picked.sym };
}

const ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
// element by last digit of the year (heavenly-stem pairs): 2020 ends in 0 → Metal Rat ✓
const ELEMENTS = ['Metal', 'Metal', 'Water', 'Water', 'Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth'];

export function chineseSign(year: number): { animal: string; element: string } {
  const idx = (((year - 2020) % 12) + 12) % 12; // 2020 = Rat
  return { animal: ANIMALS[idx], element: ELEMENTS[((year % 10) + 10) % 10] };
}
