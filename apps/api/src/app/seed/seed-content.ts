import type { FieldSchema } from '@rv-checklist/domain';

/**
 * The starter content for a new owner, transcribed from `docs/seed-content.md`
 * (issue #19) — the doc is the source of truth; this constant is its typed
 * form. A towable travel trailer's worth of content: 16 maintenance tasks and
 * 9 checklists (4 packing + 5 procedures), with the procedures' ⚙︎ steps
 * referencing tasks **by name** (ids don't exist until seeding creates the
 * tasks) and ✎ steps carrying their own field schemas (ADR-0008).
 */

export interface SeedTask {
  readonly name: string;
  readonly intervalMonths: number;
  readonly fieldSchema: FieldSchema;
}

export interface SeedStep {
  readonly text: string;
  /** The seed task this step performs (⚙︎ in the doc), referenced by name. */
  readonly task?: string;
  /** A plain step's own custom fields (✎ in the doc). */
  readonly fieldSchema?: FieldSchema;
}

export interface SeedChecklist {
  readonly name: string;
  readonly tags: readonly string[];
  readonly steps: readonly SeedStep[];
}

export const SEED_RIG_NICKNAME = 'My Travel Trailer';

// Task names, as constants so a ⚙︎ reference can't drift from its task.
const WHEEL_BEARINGS = 'Repack / inspect wheel bearings';
const BRAKES = 'Inspect & adjust brakes';
const TIRES = 'Inspect tires — pressure, tread, age';
const ROOF = 'Inspect & reseal roof';
const SEAMS = 'Inspect exterior seams & seals';
const SLIDE_SEALS = 'Condition slide-out seals';
const LUBRICATE = 'Lubricate slides / jacks / stabilizers';
const SANITIZE = 'Sanitize fresh water system';
const WINTERIZE = 'Winterize water system';
const DEWINTERIZE = 'De-winterize water system';
const WATER_HEATER = 'Flush water heater / check anode rod';
const PROPANE = 'Propane system leak test & regulator check';
const ALARMS = 'Test smoke / CO / propane alarms';
const EXTINGUISHER = 'Inspect fire extinguisher';
const BATTERY = 'Battery service — charge & terminals';
const HITCH = 'Repack / grease hitch & coupler';

export const SEED_TASKS: readonly SeedTask[] = [
  {
    name: WHEEL_BEARINGS,
    intervalMonths: 12,
    fieldSchema: [
      { name: 'grease type', type: 'text', required: false },
      { name: 'odometer', type: 'number', required: false, unit: 'mi' },
    ],
  },
  {
    name: BRAKES,
    intervalMonths: 12,
    fieldSchema: [{ name: 'measured pad/shoe', type: 'text', required: false }],
  },
  {
    name: TIRES,
    intervalMonths: 12,
    fieldSchema: [
      { name: 'tread depth', type: 'number', required: false, unit: '/32"' },
      { name: 'DOT date', type: 'text', required: false },
      { name: 'set pressure', type: 'number', required: false, unit: 'psi' },
    ],
  },
  {
    name: ROOF,
    intervalMonths: 12,
    fieldSchema: [{ name: 'sealant product', type: 'text', required: false }],
  },
  { name: SEAMS, intervalMonths: 12, fieldSchema: [] },
  {
    name: SLIDE_SEALS,
    intervalMonths: 12,
    fieldSchema: [{ name: 'product', type: 'text', required: false }],
  },
  { name: LUBRICATE, intervalMonths: 12, fieldSchema: [] },
  { name: SANITIZE, intervalMonths: 12, fieldSchema: [] },
  {
    name: WINTERIZE,
    intervalMonths: 12,
    fieldSchema: [
      { name: 'antifreeze gallons used', type: 'number', required: false },
    ],
  },
  { name: DEWINTERIZE, intervalMonths: 12, fieldSchema: [] },
  {
    name: WATER_HEATER,
    intervalMonths: 12,
    fieldSchema: [
      { name: 'anode remaining', type: 'number', required: false, unit: '%' },
    ],
  },
  { name: PROPANE, intervalMonths: 12, fieldSchema: [] },
  { name: ALARMS, intervalMonths: 12, fieldSchema: [] },
  {
    name: EXTINGUISHER,
    intervalMonths: 12,
    fieldSchema: [{ name: 'gauge OK', type: 'text', required: false }],
  },
  {
    name: BATTERY,
    intervalMonths: 12,
    fieldSchema: [
      { name: 'resting voltage', type: 'number', required: false, unit: 'V' },
    ],
  },
  { name: HITCH, intervalMonths: 12, fieldSchema: [] },
];

export const SEED_CHECKLISTS: readonly SeedChecklist[] = [
  {
    name: 'Season load-in',
    tags: ['packing', 'season-start'],
    steps: [
      { text: 'Camp chairs' },
      { text: 'Outdoor mat / rug' },
      { text: 'Leveling blocks & wheel chocks' },
      {
        text: 'Hitch gear (weight-distribution bars, sway control, pin, lock)',
      },
      { text: 'Sewer hose kit' },
      { text: 'Fresh-water (potable) hose' },
      { text: 'Water pressure regulator' },
      { text: 'Surge protector / EMS' },
      { text: '30/50A adapters' },
      { text: 'Extension cords' },
      { text: 'Toolbox & duct tape' },
      { text: 'Tire-change kit (jack, blocks, lug wrench, gloves)' },
      { text: 'First-aid kit' },
      { text: 'Fire extinguisher (verify present & charged)' },
      { text: 'Flashlights / headlamps' },
      { text: 'Broom & dustpan' },
      { text: 'Bins for kitchen / bath basics' },
      { text: 'Spare fuses' },
      { text: 'Level / leveling app' },
    ],
  },
  {
    name: 'Trip packing — ahead',
    tags: ['packing', 'trip'],
    steps: [
      { text: 'Clothing by forecast' },
      { text: 'Bedding & pillows' },
      { text: 'Towels' },
      { text: 'Toiletries' },
      { text: 'Medications' },
      { text: 'Phone / device chargers' },
      { text: 'Camp kitchen (pots, utensils, coffee maker)' },
      { text: 'Dish soap & sponges' },
      { text: 'Trash bags' },
      { text: 'Lighter / matches' },
      { text: 'Bug spray & sunscreen' },
      { text: 'Outdoor games' },
      { text: 'Books / entertainment' },
      { text: 'Laundry bag' },
      { text: 'Reservation confirmations / permits' },
      { text: 'Cash for firewood' },
      {
        text: 'Fresh water level — top up before leaving',
        fieldSchema: [
          {
            name: 'Fresh water level',
            type: 'number',
            required: false,
            unit: '%',
          },
        ],
      },
    ],
  },
  {
    name: 'Trip packing — day-of',
    tags: ['packing', 'trip', 'day-of'],
    steps: [
      { text: 'Perishable food from home fridge' },
      { text: 'Ice' },
      { text: 'Leftovers / prepped meals' },
      { text: 'Daily meds' },
      { text: 'Phones & laptops off chargers' },
      { text: 'Kids’ / pet comfort items' },
      { text: 'Anything charging overnight' },
      { text: 'Glasses / sunglasses' },
      { text: 'Wallet & keys' },
      { text: 'Last-minute forecast recheck' },
    ],
  },
  {
    name: 'Food',
    tags: ['packing', 'food'],
    steps: [
      // Staples core.
      { text: 'Coffee & filters' },
      { text: 'Salt / pepper / oil' },
      { text: 'Spices' },
      { text: 'Condiments (ketchup, mustard, mayo)' },
      { text: 'Cooking spray' },
      { text: 'Sugar' },
      { text: 'Foil & storage bags' },
      { text: 'Paper towels' },
      { text: 'Napkins' },
      { text: 'Dish soap' },
      { text: 'S’mores kit' },
      { text: 'Water / drinks' },
      // Per-trip.
      { text: 'Breakfast items' },
      { text: 'Lunch items' },
      { text: 'Dinner ingredients' },
      { text: 'Snacks' },
      { text: 'Pet food' },
      { text: 'Pet treats' },
    ],
  },
  {
    name: 'Spring opening',
    tags: ['procedure', 'spring'],
    steps: [
      { text: 'Remove cover / pull from storage' },
      { text: 'Exterior wash' },
      { text: 'Inspect roof for winter damage', task: ROOF },
      { text: 'Inspect seams / seals', task: SEAMS },
      { text: 'Condition slide seals', task: SLIDE_SEALS },
      { text: 'De-winterize water system', task: DEWINTERIZE },
      { text: 'Sanitize fresh water', task: SANITIZE },
      { text: 'Check tires', task: TIRES },
      { text: 'Repack wheel bearings', task: WHEEL_BEARINGS },
      { text: 'Check brakes', task: BRAKES },
      { text: 'Battery back in & charge', task: BATTERY },
      { text: 'Test alarms', task: ALARMS },
      { text: 'Propane leak test', task: PROPANE },
      { text: 'Run fridge on all sources' },
      { text: 'Test A/C & furnace' },
      { text: 'Lubricate slides / jacks', task: LUBRICATE },
      { text: 'Restock consumables' },
    ],
  },
  {
    name: 'Pre-trip prep',
    tags: ['procedure', 'trip-prep'],
    steps: [
      { text: 'Confirm reservations' },
      { text: 'Check weather trend' },
      { text: 'Charge battery' },
      { text: 'Check tire pressure (all incl. spare)' },
      { text: 'Test fridge cools down' },
      { text: 'Fill propane' },
      { text: 'Inspect hitch & coupler' },
      { text: 'Test running / brake / turn lights' },
      { text: 'Flush & fill fresh water' },
      { text: 'Verify sewer / water hoses present' },
      { text: 'Restock first-aid & meds' },
      { text: 'Check fire extinguisher gauge' },
      { text: 'Note anything to fix / replace (the slack week)' },
    ],
  },
  {
    name: 'Departure',
    tags: ['procedure', 'departure'],
    steps: [
      { text: 'Retract / stow slides' },
      { text: 'Lower antenna & roof vents' },
      { text: 'Latch fridge & cabinets' },
      { text: 'Secure loose items' },
      { text: 'Close & lock windows' },
      { text: 'Turn off water pump' },
      { text: 'Turn off propane at tank' },
      { text: 'Retract stabilizers / jacks' },
      {
        text: 'Hitch up (coupler latched & locked, weight-distribution bars, sway control, safety chains, breakaway cable)',
      },
      { text: 'Connect & test lights (running / brake / turn)' },
      {
        text: 'Walk-around: chocks removed, steps in, hatches closed, tow mirrors set',
      },
      { text: 'Final tire-pressure glance' },
      { text: 'Do a full lap of the site' },
      {
        text: 'Fresh water on board',
        fieldSchema: [
          {
            name: 'Fresh water on board',
            type: 'number',
            required: false,
            unit: '%',
          },
        ],
      },
      {
        text: 'Gray / black tank levels',
        fieldSchema: [
          { name: 'Gray / black tank levels', type: 'text', required: false },
        ],
      },
      {
        text: 'Odometer',
        fieldSchema: [
          { name: 'Odometer', type: 'number', required: false, unit: 'mi' },
        ],
      },
    ],
  },
  {
    name: 'Campsite teardown',
    tags: ['procedure', 'teardown'],
    steps: [
      { text: 'Dump black then gray tanks' },
      { text: 'Rinse & stow sewer hose' },
      { text: 'Disconnect & stow water hose & regulator' },
      { text: 'Disconnect & stow power cord / adapters' },
      { text: 'Bring in outdoor mat, chairs, grill' },
      { text: 'Take down awning' },
      { text: 'Pack outdoor gear' },
      { text: 'Trash to bins' },
      { text: 'Quick interior stow' },
      { text: 'Then run Departure' },
    ],
  },
  {
    name: 'Fall closing / winterization',
    tags: ['procedure', 'fall', 'winterize'],
    steps: [
      { text: 'Drain fresh / gray / black tanks' },
      { text: 'Flush water heater & check anode', task: WATER_HEATER },
      { text: 'Bypass water heater' },
      { text: 'Blow out water lines' },
      { text: 'Pump RV antifreeze through all fixtures', task: WINTERIZE },
      { text: 'Antifreeze in all drain traps & toilet' },
      { text: 'Deep-clean interior' },
      { text: 'Remove all food' },
      { text: 'Defrost & prop fridge open' },
      { text: 'Remove batteries or put on tender', task: BATTERY },
      { text: 'Inspect & touch up seals', task: SEAMS },
      { text: 'Set rodent deterrents' },
      { text: 'Cover roof vents' },
      { text: 'Remove valuables / electronics' },
      { text: 'Cover or store rig' },
      { text: 'Record tire pressure / chock' },
    ],
  },
];
